"""LangChain RAG pipeline using Gemini LLM, Gemini Embeddings, and Qdrant."""

from pathlib import Path
from typing import Any
import uuid

from docx import Document as DocxDocument
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchAny,
    MatchValue,
    VectorParams,
)

from app.config import get_settings

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".csv", ".json"}

_qdrant_client: QdrantClient | None = None
_embeddings: GoogleGenerativeAIEmbeddings | None = None
_vector_size: int | None = None


def get_qdrant_client() -> QdrantClient:
    """Return a singleton Qdrant client (local disk by default, or Qdrant Cloud)."""
    global _qdrant_client
    if _qdrant_client is None:
        settings = get_settings()
        if settings.qdrant_url:
            _qdrant_client = QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key or None,
            )
        else:
            _qdrant_client = QdrantClient(path=settings.qdrant_path)
    return _qdrant_client


def close_qdrant_client() -> None:
    """Close the Qdrant client cleanly on shutdown."""
    global _qdrant_client
    if _qdrant_client is not None:
        _qdrant_client.close()
        _qdrant_client = None


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    """Return singleton Gemini embeddings model."""
    global _embeddings
    if _embeddings is None:
        settings = get_settings()
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is not configured.")
        _embeddings = GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model,
            google_api_key=settings.google_api_key,
        )
    return _embeddings


def get_llm(temperature: float = 0.2) -> ChatGoogleGenerativeAI:
    """Instantiate Gemini chat model."""
    settings = get_settings()
    if not settings.google_api_key:
        raise ValueError("GOOGLE_API_KEY is not configured.")
    return ChatGoogleGenerativeAI(
        model=settings.gemini_chat_model,
        google_api_key=settings.google_api_key,
        temperature=temperature,
    )


def _ensure_collection() -> QdrantVectorStore:
    """Ensure the Qdrant collection exists and return a LangChain QdrantVectorStore."""
    global _vector_size
    settings = get_settings()
    client = get_qdrant_client()
    embeddings = get_embeddings()

    if not client.collection_exists(settings.qdrant_collection):
        if _vector_size is None:
            probe = embeddings.embed_query("dimension probe")
            _vector_size = len(probe)
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=_vector_size, distance=Distance.COSINE),
        )

    return QdrantVectorStore(
        client=client,
        collection_name=settings.qdrant_collection,
        embedding=embeddings,
    )


def _extract_text_from_response(content: Any) -> str:
    """Normalize AIMessage.content (str or multimodal block list) to plain text."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
        return "\n".join(parts).strip()
    return str(content).strip()


def load_file_to_documents(file_path: Path, filename: str, doc_id: str) -> tuple[list[Document], int]:
    """Extract LangChain Documents and page count from a supported uploaded file."""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    raw_docs: list[Document] = []
    page_count = 1

    if ext == ".pdf":
        reader = PdfReader(str(file_path))
        page_count = max(len(reader.pages), 1)
        for idx, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                raw_docs.append(
                    Document(
                        page_content=text,
                        metadata={"doc_id": doc_id, "filename": filename, "page": idx},
                    )
                )
    elif ext == ".docx":
        docx_file = DocxDocument(str(file_path))
        paragraphs = [p.text.strip() for p in docx_file.paragraphs if p.text and p.text.strip()]
        for table in docx_file.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
                if cells:
                    paragraphs.append(" | ".join(cells))
        combined = "\n\n".join(paragraphs).strip()
        if combined:
            raw_docs.append(
                Document(
                    page_content=combined,
                    metadata={"doc_id": doc_id, "filename": filename, "page": None},
                )
            )
    else:
        raw_bytes = file_path.read_bytes()
        try:
            text = raw_bytes.decode("utf-8").strip()
        except UnicodeDecodeError:
            text = raw_bytes.decode("latin-1", errors="ignore").strip()
        if text:
            raw_docs.append(
                Document(
                    page_content=text,
                    metadata={"doc_id": doc_id, "filename": filename, "page": None},
                )
            )

    if not raw_docs:
        raise ValueError(
            f"No readable text could be extracted from '{filename}'. "
            "If this is a scanned PDF, please run OCR first."
        )

    return raw_docs, page_count


def index_document(file_path: Path, filename: str) -> dict[str, Any]:
    """Split, embed, and store a document in Qdrant. Returns indexing metadata."""
    settings = get_settings()
    doc_id = str(uuid.uuid4())
    raw_docs, page_count = load_file_to_documents(file_path, filename, doc_id)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(raw_docs)
    if not chunks:
        raise ValueError(f"Document '{filename}' produced zero indexable text chunks.")

    for idx, chunk in enumerate(chunks):
        chunk.metadata["doc_id"] = doc_id
        chunk.metadata["filename"] = filename
        chunk.metadata["chunk_index"] = idx
        if "page" not in chunk.metadata:
            chunk.metadata["page"] = None

    vector_store = _ensure_collection()
    # Batch embeddings in chunks of 32 to respect free-tier API payload/RPM limits
    batch_size = 32
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vector_store.add_documents(batch)

    return {
        "doc_id": doc_id,
        "page_count": page_count,
        "chunk_count": len(chunks),
    }


def delete_document_vectors(doc_id: str) -> None:
    """Remove all vector points belonging to doc_id from Qdrant."""
    settings = get_settings()
    client = get_qdrant_client()
    if not client.collection_exists(settings.qdrant_collection):
        return

    client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=FilterSelector(
            filter=Filter(
                must=[
                    FieldCondition(
                        key="metadata.doc_id",
                        match=MatchValue(value=doc_id),
                    )
                ]
            )
        ),
    )


def _to_langchain_history(history: list[dict[str, Any]], max_messages: int = 10) -> list[BaseMessage]:
    """Convert stored DB chat messages into LangChain message objects."""
    recent = history[-max_messages:] if max_messages > 0 else history
    converted: list[BaseMessage] = []
    for msg in recent:
        if msg["role"] == "user":
            converted.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            converted.append(AIMessage(content=msg["content"]))
    return converted


def _rewrite_query_with_history(
    question: str,
    chat_history: list[BaseMessage],
    llm: ChatGoogleGenerativeAI,
) -> str:
    """Rewrite follow-up questions into a standalone search query when history exists."""
    if not chat_history:
        return question

    contextualize_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Given the conversation history and the latest user question, rewrite the "
                "question into a concise, self-contained search query for a document knowledge base. "
                "Do NOT answer the question. Return only the rewritten query (or the original question "
                "if it is already standalone).",
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{question}"),
        ]
    )
    chain = contextualize_prompt | llm | StrOutputParser()
    rewritten = chain.invoke({"chat_history": chat_history, "question": question})
    return rewritten.strip() or question


def answer_question(
    question: str,
    history_rows: list[dict[str, Any]],
    document_ids: list[str] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Run history-aware RAG retrieval + grounded Gemini generation with source citations."""
    settings = get_settings()
    client = get_qdrant_client()

    if not client.collection_exists(settings.qdrant_collection):
        return (
            "Your knowledge base has no indexed documents yet. Upload a PDF, DOCX, TXT, or Markdown file first, then ask your question.",
            [],
        )

    vector_store = _ensure_collection()
    llm = get_llm(temperature=0.2)
    lc_history = _to_langchain_history(history_rows, max_messages=8)

    search_query = _rewrite_query_with_history(question, lc_history, llm)

    qdrant_filter: Filter | None = None
    if document_ids:
        qdrant_filter = Filter(
            must=[
                FieldCondition(
                    key="metadata.doc_id",
                    match=MatchAny(any=document_ids),
                )
            ]
        )

    results = vector_store.similarity_search_with_score(
        query=search_query,
        k=settings.retrieval_k,
        filter=qdrant_filter,
    )

    if not results:
        return (
            "I could not find any relevant passages in the selected documents for your question.",
            [],
        )

    context_blocks: list[str] = []
    sources: list[dict[str, Any]] = []

    for idx, (doc, score) in enumerate(results, start=1):
        meta = doc.metadata or {}
        filename = str(meta.get("filename", "Unknown Document"))
        doc_id = str(meta.get("doc_id", ""))
        page = meta.get("page")
        chunk_index = int(meta.get("chunk_index", 0))
        page_label = f", Page {page}" if page is not None else ""

        context_blocks.append(f"[{idx}] (Source: {filename}{page_label})\n{doc.page_content}")

        excerpt = doc.page_content.strip()
        if len(excerpt) > 420:
            excerpt = excerpt[:417].rstrip() + "..."

        sources.append(
            {
                "citation_id": idx,
                "doc_id": doc_id,
                "filename": filename,
                "page": page,
                "chunk_index": chunk_index,
                "score": round(float(score), 4),
                "excerpt": excerpt,
            }
        )

    context_text = "\n\n---\n\n".join(context_blocks)

    qa_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are an accurate, helpful AI Knowledge Base Assistant. "
                "Answer the user's question using ONLY the retrieved document excerpts below. "
                "Cite your claims inline using bracketed source numbers like [1], [2], or [1][3] "
                "matching the numbered excerpts.\n"
                "Rules:\n"
                "- Never invent facts, numbers, or citations that are not in the excerpts.\n"
                "- If the excerpts only partially answer the question, answer what is supported and clearly state what is missing.\n"
                "- Format the response cleanly with Markdown (headings, bullet points, or code blocks where helpful).\n\n"
                "Retrieved Excerpts:\n{context}",
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{question}"),
        ]
    )

    response = (qa_prompt | llm).invoke(
        {
            "context": context_text,
            "chat_history": lc_history,
            "question": question,
        }
    )
    answer_text = _extract_text_from_response(response.content)
    return answer_text, sources
