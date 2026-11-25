export interface SourceCitation {
  citation_id: number
  doc_id: string
  filename: string
  page: number | null
  chunk_index: number
  score: number | null
  excerpt: string
}

export interface DocumentInfo {
  id: string
  filename: string
  file_type: string
  file_size: number
  page_count: number
  chunk_count: number
  status: string
  created_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  sources: SourceCitation[]
  created_at: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ChatSessionDetail {
  session: ChatSessionSummary
  messages: ChatMessage[]
}

export interface AskResponse {
  session_id: string
  session_title: string
  user_message: ChatMessage
  assistant_message: ChatMessage
}

export interface HealthResponse {
  status: string
  chat_model: string
  embedding_model: string
  vector_store: string
  document_count: number
  api_key_configured: boolean
}
