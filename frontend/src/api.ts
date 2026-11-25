import type {
  AskResponse,
  ChatSessionDetail,
  ChatSessionSummary,
  DocumentInfo,
  HealthResponse,
} from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) {
        detail = data.detail
      }
    } catch {
      // keep fallback detail
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health')
  },

  listDocuments(): Promise<DocumentInfo[]> {
    return request<DocumentInfo[]>('/api/documents')
  },

  uploadDocuments(files: File[]): Promise<{ documents: DocumentInfo[]; message: string }> {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return request<{ documents: DocumentInfo[]; message: string }>('/api/documents/upload', {
      method: 'POST',
      body: formData,
    })
  },

  deleteDocument(docId: string): Promise<{ status: string; id: string; filename: string }> {
    return request(`/api/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    })
  },

  listSessions(): Promise<ChatSessionSummary[]> {
    return request<ChatSessionSummary[]>('/api/chat/sessions')
  },

  createSession(title = 'New Chat'): Promise<ChatSessionSummary> {
    return request<ChatSessionSummary>('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  },

  getSession(sessionId: string): Promise<ChatSessionDetail> {
    return request<ChatSessionDetail>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`)
  },

  renameSession(sessionId: string, title: string): Promise<ChatSessionSummary> {
    return request<ChatSessionSummary>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  },

  deleteSession(sessionId: string): Promise<{ status: string; id: string }> {
    return request(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  },

  askQuestion(payload: {
    question: string
    session_id: string | null
    document_ids: string[] | null
  }): Promise<AskResponse> {
    return request<AskResponse>('/api/chat/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}
