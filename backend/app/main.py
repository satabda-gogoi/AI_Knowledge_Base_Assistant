"""FastAPI application entrypoint for AI Knowledge Base Assistant (RAG)."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db, rag
from app.config import get_settings
from app.routers import chat, documents
from app.schemas import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize SQLite schema on startup and close Qdrant cleanly on shutdown."""
    settings = get_settings()
    settings.ensure_directories()
    await db.init_db()
    yield
    rag.close_qdrant_client()


settings = get_settings()

app = FastAPI(
    title="AI Knowledge Base Assistant (RAG)",
    description="Upload PDFs & documents, ask questions grounded in your knowledge base with source citations.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chat.router)


@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """Return service health and active RAG configuration."""
    doc_count = await db.count_documents()
    return HealthResponse(
        status="ok",
        chat_model=settings.gemini_chat_model,
        embedding_model=settings.gemini_embedding_model,
        vector_store="qdrant-cloud" if settings.qdrant_url else "qdrant-local",
        document_count=doc_count,
        api_key_configured=bool(settings.google_api_key),
    )
