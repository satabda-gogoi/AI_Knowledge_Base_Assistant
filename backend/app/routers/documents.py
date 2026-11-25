"""Document upload, listing, and deletion endpoints."""

from pathlib import Path
import shutil
import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile

from app import db, rag
from app.config import get_settings
from app.schemas import DocumentInfo, DocumentUploadResponse

router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.get("", response_model=list[DocumentInfo])
async def get_documents() -> list[DocumentInfo]:
    """List all documents currently indexed in the knowledge base."""
    rows = await db.list_documents()
    return [DocumentInfo(**row) for row in rows]


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_documents(files: list[UploadFile] = File(...)) -> DocumentUploadResponse:
    """Upload one or more PDF/text/DOCX/MD files and index them into Qdrant."""
    if not files:
        raise HTTPException(status_code=400, detail="Please select at least one file to upload.")

    settings = get_settings()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    uploaded_docs: list[DocumentInfo] = []

    for upload in files:
        filename = Path(upload.filename or "untitled").name
        ext = Path(filename).suffix.lower()
        if ext not in rag.SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file '{filename}'. Supported types: {', '.join(sorted(rag.SUPPORTED_EXTENSIONS))}",
            )

        temp_name = f"{uuid.uuid4()}_{filename}"
        temp_path = Path(settings.upload_dir) / temp_name

        try:
            with temp_path.open("wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)

            file_size = temp_path.stat().st_size
            if file_size == 0:
                raise HTTPException(status_code=400, detail=f"File '{filename}' is empty.")
            if file_size > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{filename}' exceeds the {settings.max_file_size_mb} MB limit.",
                )

            indexed = rag.index_document(temp_path, filename)
            doc_record = await db.insert_document(
                doc_id=indexed["doc_id"],
                filename=filename,
                file_type=ext.lstrip("."),
                file_size=file_size,
                page_count=indexed["page_count"],
                chunk_count=indexed["chunk_count"],
                status="ready",
            )
            uploaded_docs.append(DocumentInfo(**doc_record))
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            err_msg = str(exc)
            if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
                raise HTTPException(
                    status_code=429,
                    detail="Gemini API rate limit reached while generating embeddings. Please wait a few seconds and retry.",
                ) from exc
            raise HTTPException(
                status_code=500,
                detail=f"Failed to index '{filename}': {err_msg}",
            ) from exc
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)

    return DocumentUploadResponse(
        documents=uploaded_docs,
        message=f"Successfully indexed {len(uploaded_docs)} document(s).",
    )


@router.delete("/{doc_id}")
async def delete_document(doc_id: str) -> dict[str, str]:
    """Delete a document from both SQLite metadata and Qdrant vector store."""
    existing = await db.get_document(doc_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    rag.delete_document_vectors(doc_id)
    await db.delete_document_record(doc_id)
    return {"status": "deleted", "id": doc_id, "filename": existing["filename"]}
