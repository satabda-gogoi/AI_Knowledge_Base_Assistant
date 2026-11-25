"""Pydantic request and response schemas for the API."""

from pydantic import BaseModel, Field


class SourceCitation(BaseModel):
    """Reference to a retrieved document chunk used to ground an answer."""

    citation_id: int
    doc_id: str
    filename: str
    page: int | None = None
    chunk_index: int = 0
    score: float | None = None
    excerpt: str


class DocumentInfo(BaseModel):
    """Metadata for an indexed document in the knowledge base."""

    id: str
    filename: str
    file_type: str
    file_size: int
    page_count: int
    chunk_count: int
    status: str
    created_at: str


class DocumentUploadResponse(BaseModel):
    """Response returned after uploading and indexing documents."""

    documents: list[DocumentInfo]
    message: str


class ChatMessageSchema(BaseModel):
    """A single user or assistant message within a chat session."""

    id: str
    session_id: str
    role: str
    content: str
    sources: list[SourceCitation] = Field(default_factory=list)
    created_at: str


class ChatSessionSummary(BaseModel):
    """Summary of a chat session for the history sidebar."""

    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class ChatSessionDetail(BaseModel):
    """Full chat session with ordered messages."""

    session: ChatSessionSummary
    messages: list[ChatMessageSchema]


class CreateSessionRequest(BaseModel):
    """Payload to create a new chat session."""

    title: str = "New Chat"


class RenameSessionRequest(BaseModel):
    """Payload to rename an existing chat session."""

    title: str = Field(min_length=1, max_length=120)


class AskRequest(BaseModel):
    """Payload to ask a question against the knowledge base."""

    question: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    document_ids: list[str] | None = None


class AskResponse(BaseModel):
    """Grounded answer with source citations and session metadata."""

    session_id: str
    session_title: str
    user_message: ChatMessageSchema
    assistant_message: ChatMessageSchema


class HealthResponse(BaseModel):
    """Service health and configuration summary."""

    status: str
    chat_model: str
    embedding_model: str
    vector_store: str
    document_count: int
    api_key_configured: bool
