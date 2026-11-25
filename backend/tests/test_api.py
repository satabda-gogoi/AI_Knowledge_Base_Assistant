"""Backend API and RAG pipeline tests using isolated temp storage."""

from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app import config, db, rag
from app.main import app


class DeterministicEmbeddings(Embeddings):
    """Lightweight deterministic embeddings for offline CI tests."""

    dim = 16

    def _vec(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for idx, ch in enumerate(text.lower()):
            vec[idx % self.dim] += (ord(ch) % 31) / 31.0
        norm = sum(x * x for x in vec) ** 0.5 or 1.0
        return [x / norm for x in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


@pytest.fixture()
def test_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provide a FastAPI TestClient wired to temporary SQLite & Qdrant directories."""
    rag.close_qdrant_client()
    config.get_settings.cache_clear()

    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("QDRANT_PATH", str(tmp_path / "qdrant"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("QDRANT_URL", "")

    monkeypatch.setattr(rag, "_embeddings", DeterministicEmbeddings())
    monkeypatch.setattr(rag, "_vector_size", DeterministicEmbeddings.dim)
    monkeypatch.setattr(
        rag,
        "get_llm",
        lambda temperature=0.2: FakeListChatModel(
            responses=[
                "The architecture uses FastAPI and Qdrant [1].",
                "Rewritten query about FastAPI and Qdrant",
                "Yes, Qdrant stores the document chunks locally [1].",
            ]
        ),
    )

    with TestClient(app) as client:
        yield client

    rag.close_qdrant_client()
    config.get_settings.cache_clear()


def test_health_endpoint(test_client: TestClient) -> None:
    res = test_client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["vector_store"] == "qdrant-local"
    assert data["document_count"] == 0


def test_document_upload_ask_history_and_delete(test_client: TestClient) -> None:
    sample_text = (
        "Project Atlas uses FastAPI for the backend API, LangChain for orchestration, "
        "and Qdrant as the local persistent vector database."
    )
    upload_res = test_client.post(
        "/api/documents/upload",
        files=[("files", ("architecture.md", sample_text.encode("utf-8"), "text/markdown"))],
    )
    assert upload_res.status_code == 200
    uploaded = upload_res.json()["documents"]
    assert len(uploaded) == 1
    doc_id = uploaded[0]["id"]
    assert uploaded[0]["filename"] == "architecture.md"
    assert uploaded[0]["chunk_count"] >= 1

    # List documents
    docs_res = test_client.get("/api/documents")
    assert docs_res.status_code == 200
    assert len(docs_res.json()) == 1

    # Ask first question (creates session automatically)
    ask_res = test_client.post(
        "/api/chat/ask",
        json={"question": "What stack does Project Atlas use?"},
    )
    assert ask_res.status_code == 200
    ask_data = ask_res.json()
    session_id = ask_data["session_id"]
    assert "[1]" in ask_data["assistant_message"]["content"]
    assert len(ask_data["assistant_message"]["sources"]) >= 1
    assert ask_data["assistant_message"]["sources"][0]["filename"] == "architecture.md"

    # Ask follow-up in same session with document filter
    followup_res = test_client.post(
        "/api/chat/ask",
        json={
            "question": "Where are chunks stored?",
            "session_id": session_id,
            "document_ids": [doc_id],
        },
    )
    assert followup_res.status_code == 200
    assert len(followup_res.json()["assistant_message"]["sources"]) >= 1

    # Verify session detail has 4 messages (2 user, 2 assistant)
    detail_res = test_client.get(f"/api/chat/sessions/{session_id}")
    assert detail_res.status_code == 200
    assert len(detail_res.json()["messages"]) == 4

    # Rename session
    rename_res = test_client.patch(
        f"/api/chat/sessions/{session_id}",
        json={"title": "Atlas Architecture Chat"},
    )
    assert rename_res.status_code == 200
    assert rename_res.json()["title"] == "Atlas Architecture Chat"

    # Delete document and verify list is empty
    del_doc = test_client.delete(f"/api/documents/{doc_id}")
    assert del_doc.status_code == 200
    assert test_client.get("/api/documents").json() == []

    # Delete session
    del_sess = test_client.delete(f"/api/chat/sessions/{session_id}")
    assert del_sess.status_code == 200
    assert test_client.get("/api/chat/sessions").json() == []
