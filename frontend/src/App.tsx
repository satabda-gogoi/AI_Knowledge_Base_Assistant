import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpenCheck,
  FileUp,
  Filter,
  Loader2,
  Menu,
  Paperclip,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { api } from './api'
import { ChatMessageBubble } from './components/ChatMessageBubble'
import { Sidebar } from './components/Sidebar'
import type { ChatMessage, ChatSessionSummary, DocumentInfo, HealthResponse } from './types'

const SAMPLE_PROMPTS = [
  'Summarize the key points from my uploaded documents.',
  'What are the main recommendations or action items mentioned?',
  'List any important dates, metrics, or figures with their sources.',
]

export default function App() {
  const [activeTab, setActiveTab] = useState<'chats' | 'documents'>('chats')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const quickUploadRef = useRef<HTMLInputElement | null>(null)

  const refreshInitialData = async () => {
    try {
      const [healthData, docsData, sessionsData] = await Promise.all([
        api.health(),
        api.listDocuments(),
        api.listSessions(),
      ])
      setHealth(healthData)
      setDocuments(docsData)
      setSessions(sessionsData)

      if (sessionsData.length > 0 && !activeSessionId) {
        const detail = await api.getSession(sessionsData[0].id)
        setActiveSessionId(detail.session.id)
        setMessages(detail.messages)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach backend API.')
    }
  }

  useEffect(() => {
    void refreshInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  const handleSelectSession = async (sessionId: string) => {
    setErrorMsg(null)
    try {
      const detail = await api.getSession(sessionId)
      setActiveSessionId(detail.session.id)
      setMessages(detail.messages)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load chat session.')
    }
  }

  const handleNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
    setActiveTab('chats')
    setIsSidebarOpen(false)
  }

  const handleRenameSession = async (id: string, title: string) => {
    try {
      const updated = await api.renameSession(id, title)
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to rename session.')
    }
  }

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete session.')
    }
  }

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setErrorMsg(null)
    setIsUploading(true)
    try {
      const res = await api.uploadDocuments(files)
      setDocuments((prev) => [...res.documents, ...prev])
      const updatedHealth = await api.health()
      setHealth(updatedHealth)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Document upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    setErrorMsg(null)
    try {
      await api.deleteDocument(docId)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId))
      const updatedHealth = await api.health()
      setHealth(updatedHealth)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete document.')
    }
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    )
  }

  const handleAsk = async (promptOverride?: string) => {
    const text = (promptOverride ?? question).trim()
    if (!text || isAsking) return

    setErrorMsg(null)
    if (!promptOverride) setQuestion('')

    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: activeSessionId || 'pending',
      role: 'user',
      content: text,
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUserMsg])
    setIsAsking(true)

    try {
      const res = await api.askQuestion({
        question: text,
        session_id: activeSessionId,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
      })

      setActiveSessionId(res.session_id)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        res.user_message,
        res.assistant_message,
      ])

      const sessionsData = await api.listSessions()
      setSessions(sessionsData)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id))
      if (!promptOverride) setQuestion(text)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to get an answer.')
    } finally {
      setIsAsking(false)
    }
  }

  const activeSessionTitle =
    sessions.find((s) => s.id === activeSessionId)?.title || 'New Conversation'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => void handleSelectSession(id)}
        onNewChat={handleNewChat}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        documents={documents}
        selectedDocIds={selectedDocIds}
        onToggleDocSelection={toggleDocSelection}
        onClearDocSelection={() => setSelectedDocIds([])}
        onUploadFiles={handleUploadFiles}
        onDeleteDocument={handleDeleteDocument}
        isUploading={isUploading}
        health={health}
        isOpenMobile={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      {/* Main Workspace */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top Navbar */}
        <header className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-100">
                {activeSessionTitle}
              </h2>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Filter className="h-3 w-3 text-indigo-400" />
                  {selectedDocIds.length > 0
                    ? `Scoped to ${selectedDocIds.length} selected doc(s)`
                    : `Searching all ${documents.length} document(s)`}
                </span>
                {selectedDocIds.length > 0 && (
                  <button
                    onClick={() => setSelectedDocIds([])}
                    className="text-indigo-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setActiveTab('documents')
              setIsSidebarOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-indigo-500/60 hover:bg-slate-800"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Manage Docs</span>
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
              {documents.length}
            </span>
          </button>
        </header>

        {/* Error Toast */}
        {errorMsg && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200 sm:mx-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/30">
                <BookOpenCheck className="h-7 w-7 text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-slate-100">
                Ask your Knowledge Base anything
              </h3>
              <p className="mt-2 max-w-lg text-sm text-slate-400">
                Upload PDFs, Word docs, Markdown, or text files. Every answer is grounded in your
                uploaded sources with clickable page and excerpt citations.
              </p>

              <div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3.5 text-left">
                  <FileUp className="mb-2 h-4 w-4 text-indigo-400" />
                  <p className="text-xs font-semibold text-slate-200">1. Upload Docs</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    PDF, DOCX, TXT, MD, CSV indexed with Gemini embeddings.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3.5 text-left">
                  <Sparkles className="mb-2 h-4 w-4 text-indigo-400" />
                  <p className="text-xs font-semibold text-slate-200">2. Context-Aware</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Follow-up questions remember your chat history automatically.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3.5 text-left">
                  <BookOpenCheck className="mb-2 h-4 w-4 text-indigo-400" />
                  <p className="text-xs font-semibold text-slate-200">3. Verified Sources</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Click any citation badge to inspect the exact source excerpt.
                  </p>
                </div>
              </div>

              {documents.length === 0 ? (
                <button
                  onClick={() => quickUploadRef.current?.click()}
                  disabled={isUploading}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload your first document
                </button>
              ) : (
                <div className="mt-6 w-full space-y-2">
                  <p className="text-xs font-medium text-slate-400">Try asking:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SAMPLE_PROMPTS.map((sample) => (
                      <button
                        key={sample}
                        onClick={() => void handleAsk(sample)}
                        className="rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs text-slate-300 transition hover:border-indigo-500/50 hover:bg-slate-800 hover:text-white"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              {isAsking && (
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 ring-1 ring-slate-800">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  </div>
                  <span>Searching knowledge base and synthesizing cited answer...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-800/80 bg-slate-950/90 px-4 py-3.5 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-2 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/30">
              <input
                ref={quickUploadRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  void handleUploadFiles(files)
                  e.target.value = ''
                }}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => quickUploadRef.current?.click()}
                disabled={isUploading}
                title="Upload PDF or document"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-indigo-300 disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <textarea
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleAsk()
                  }
                }}
                placeholder={
                  documents.length > 0
                    ? 'Ask a question about your documents... (Enter to send)'
                    : 'Upload a document first, or ask a question...'
                }
                className="max-h-36 flex-1 resize-none bg-transparent py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />

              <button
                type="button"
                onClick={() => void handleAsk()}
                disabled={!question.trim() || isAsking}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isAsking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-slate-500">
              Powered by Gemini + LangChain + Qdrant · Answers cite retrieved document excerpts
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
