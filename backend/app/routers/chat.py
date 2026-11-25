"""Chat sessions, history, and RAG question-answering endpoints."""

from fastapi import APIRouter, HTTPException

from app import db, rag
from app.schemas import (
    AskRequest,
    AskResponse,
    ChatMessageSchema,
    ChatSessionDetail,
    ChatSessionSummary,
    CreateSessionRequest,
    RenameSessionRequest,
)

router = APIRouter(prefix="/api/chat", tags=["Chat"])


def _derive_session_title(question: str) -> str:
    cleaned = " ".join(question.strip().split())
    if len(cleaned) <= 48:
        return cleaned
    return cleaned[:45].rstrip() + "..."


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def get_sessions() -> list[ChatSessionSummary]:
    """List all saved chat sessions."""
    rows = await db.list_chat_sessions()
    return [ChatSessionSummary(**row) for row in rows]


@router.post("/sessions", response_model=ChatSessionSummary)
async def create_session(payload: CreateSessionRequest) -> ChatSessionSummary:
    """Create a new empty chat session."""
    row = await db.create_chat_session(title=payload.title.strip() or "New Chat")
    return ChatSessionSummary(**row)


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session_detail(session_id: str) -> ChatSessionDetail:
    """Retrieve a chat session and all its messages."""
    session = await db.get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    messages = await db.get_chat_messages(session_id)
    return ChatSessionDetail(
        session=ChatSessionSummary(**session),
        messages=[ChatMessageSchema(**msg) for msg in messages],
    )


@router.patch("/sessions/{session_id}", response_model=ChatSessionSummary)
async def rename_session(session_id: str, payload: RenameSessionRequest) -> ChatSessionSummary:
    """Rename an existing chat session."""
    updated = await db.update_chat_session_title(session_id, payload.title.strip())
    if not updated:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return ChatSessionSummary(**updated)


@router.delete("/sessions/{session_id}")
async def remove_session(session_id: str) -> dict[str, str]:
    """Delete a chat session and its message history."""
    deleted = await db.delete_chat_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return {"status": "deleted", "id": session_id}


@router.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest) -> AskResponse:
    """Ask a question grounded in uploaded documents and persist chat history."""
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    session_id = payload.session_id
    if session_id:
        session = await db.get_chat_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found.")
    else:
        session = await db.create_chat_session(title=_derive_session_title(question))
        session_id = session["id"]

    history_rows = await db.get_chat_messages(session_id)

    try:
        answer_text, sources = rag.answer_question(
            question=question,
            history_rows=history_rows,
            document_ids=payload.document_ids or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        err_msg = str(exc)
        if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="Gemini API rate limit reached. Please wait a moment and try again.",
            ) from exc
        raise HTTPException(status_code=500, detail=f"RAG query failed: {err_msg}") from exc

    # Auto-title if this is the first message in a "New Chat" session
    session_title = session["title"]
    if not history_rows and session_title == "New Chat":
        session_title = _derive_session_title(question)
        await db.update_chat_session_title(session_id, session_title)

    user_msg = await db.add_chat_message(session_id=session_id, role="user", content=question)
    assistant_msg = await db.add_chat_message(
        session_id=session_id,
        role="assistant",
        content=answer_text,
        sources=sources,
    )

    return AskResponse(
        session_id=session_id,
        session_title=session_title,
        user_message=ChatMessageSchema(**user_msg),
        assistant_message=ChatMessageSchema(**assistant_msg),
    )
