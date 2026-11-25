"""Lightweight async SQLite persistence for documents and chat history."""

from datetime import datetime, timezone
import json
from typing import Any
import uuid
import aiosqlite

from app.config import get_settings


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_connection() -> aiosqlite.Connection:
    settings = get_settings()
    conn = await aiosqlite.connect(settings.sqlite_db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys = ON;")
    return conn


async def init_db() -> None:
    """Create database tables if they do not exist."""
    conn = await _get_connection()
    try:
        await conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                page_count INTEGER NOT NULL DEFAULT 1,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ready',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session_created
                ON chat_messages(session_id, created_at);
            """
        )
        await conn.commit()
    finally:
        await conn.close()


# --- Document CRUD ---


async def insert_document(
    doc_id: str,
    filename: str,
    file_type: str,
    file_size: int,
    page_count: int,
    chunk_count: int,
    status: str = "ready",
) -> dict[str, Any]:
    """Insert a new document record."""
    created_at = _utc_now_iso()
    conn = await _get_connection()
    try:
        await conn.execute(
            """
            INSERT INTO documents (id, filename, file_type, file_size, page_count, chunk_count, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (doc_id, filename, file_type, file_size, page_count, chunk_count, status, created_at),
        )
        await conn.commit()
        return {
            "id": doc_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "page_count": page_count,
            "chunk_count": chunk_count,
            "status": status,
            "created_at": created_at,
        }
    finally:
        await conn.close()


async def list_documents() -> list[dict[str, Any]]:
    """List all documents ordered newest first."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            "SELECT id, filename, file_type, file_size, page_count, chunk_count, status, created_at "
            "FROM documents ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await conn.close()


async def get_document(doc_id: str) -> dict[str, Any] | None:
    """Fetch a single document record by ID."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            "SELECT id, filename, file_type, file_size, page_count, chunk_count, status, created_at "
            "FROM documents WHERE id = ?",
            (doc_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await conn.close()


async def delete_document_record(doc_id: str) -> bool:
    """Delete a document record by ID. Returns True if a row was deleted."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await conn.commit()
        return cursor.rowcount > 0
    finally:
        await conn.close()


async def count_documents() -> int:
    """Return total indexed document count."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute("SELECT COUNT(*) FROM documents")
        row = await cursor.fetchone()
        return int(row[0]) if row else 0
    finally:
        await conn.close()


# --- Chat Sessions & Messages CRUD ---


async def create_chat_session(title: str = "New Chat") -> dict[str, Any]:
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    now = _utc_now_iso()
    conn = await _get_connection()
    try:
        await conn.execute(
            "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (session_id, title, now, now),
        )
        await conn.commit()
        return {
            "id": session_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
        }
    finally:
        await conn.close()


async def list_chat_sessions() -> list[dict[str, Any]]:
    """List all chat sessions ordered by most recently updated."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            """
            SELECT s.id, s.title, s.created_at, s.updated_at, COUNT(m.id) AS message_count
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.id = m.session_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await conn.close()


async def get_chat_session(session_id: str) -> dict[str, Any] | None:
    """Fetch a single chat session summary."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            """
            SELECT s.id, s.title, s.created_at, s.updated_at, COUNT(m.id) AS message_count
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.id = m.session_id
            WHERE s.id = ?
            GROUP BY s.id
            """,
            (session_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await conn.close()


async def update_chat_session_title(session_id: str, title: str) -> dict[str, Any] | None:
    """Rename a chat session and bump updated_at."""
    now = _utc_now_iso()
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, session_id),
        )
        await conn.commit()
        if cursor.rowcount == 0:
            return None
    finally:
        await conn.close()
    return await get_chat_session(session_id)


async def delete_chat_session(session_id: str) -> bool:
    """Delete a chat session and its messages (cascade)."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        await conn.commit()
        return cursor.rowcount > 0
    finally:
        await conn.close()


async def add_chat_message(
    session_id: str,
    role: str,
    content: str,
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Append a message to a chat session and update session timestamp."""
    msg_id = str(uuid.uuid4())
    now = _utc_now_iso()
    sources_list = sources or []
    sources_json = json.dumps(sources_list)
    conn = await _get_connection()
    try:
        await conn.execute(
            """
            INSERT INTO chat_messages (id, session_id, role, content, sources_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (msg_id, session_id, role, content, sources_json, now),
        )
        await conn.execute(
            "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await conn.commit()
        return {
            "id": msg_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "sources": sources_list,
            "created_at": now,
        }
    finally:
        await conn.close()


async def get_chat_messages(session_id: str) -> list[dict[str, Any]]:
    """Fetch all messages in a session ordered chronologically."""
    conn = await _get_connection()
    try:
        cursor = await conn.execute(
            """
            SELECT id, session_id, role, content, sources_json, created_at
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        rows = await cursor.fetchall()
        messages: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["sources"] = json.loads(item.pop("sources_json") or "[]")
            messages.append(item)
        return messages
    finally:
        await conn.close()
