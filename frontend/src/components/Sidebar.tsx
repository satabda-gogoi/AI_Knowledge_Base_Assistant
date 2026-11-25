import { useRef, useState } from 'react'
import {
  Check,
  CheckSquare,
  Database,
  FileText,
  FolderOpen,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import type { ChatSessionSummary, DocumentInfo, HealthResponse } from '../types'

interface SidebarProps {
  activeTab: 'chats' | 'documents'
  onTabChange: (tab: 'chats' | 'documents') => void
  sessions: ChatSessionSummary[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  onRenameSession: (id: string, title: string) => Promise<void>
  onDeleteSession: (id: string) => Promise<void>
  documents: DocumentInfo[]
  selectedDocIds: string[]
  onToggleDocSelection: (docId: string) => void
  onClearDocSelection: () => void
  onUploadFiles: (files: File[]) => Promise<void>
  onDeleteDocument: (docId: string) => Promise<void>
  isUploading: boolean
  health: HealthResponse | null
  isOpenMobile: boolean
  onCloseMobile: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function Sidebar({
  activeTab,
  onTabChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  documents,
  selectedDocIds,
  onToggleDocSelection,
  onClearDocSelection,
  onUploadFiles,
  onDeleteDocument,
  isUploading,
  health,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  const handleFileChange = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    await onUploadFiles(Array.from(fileList))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const startRename = (session: ChatSessionSummary) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
  }

  const commitRename = async (id: string) => {
    const trimmed = editingTitle.trim()
    if (trimmed) {
      await onRenameSession(id, trimmed)
    }
    setEditingSessionId(null)
  }

  const handleDeleteDoc = async (docId: string) => {
    setDeletingDocId(docId)
    try {
      await onDeleteDocument(docId)
    } finally {
      setDeletingDocId(null)
    }
  }

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-slate-800/80 bg-slate-900/95 backdrop-blur-md transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-100">
                Knowledge Base AI
              </h1>
              <p className="text-[11px] text-slate-400">RAG Assistant · Citations</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onNewChat}
              title="New Chat"
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
            <button
              onClick={onCloseMobile}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 gap-1 border-b border-slate-800/80 p-2">
          <button
            onClick={() => onTabChange('chats')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === 'chats'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chats
            <span className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300">
              {sessions.length}
            </span>
          </button>

          <button
            onClick={() => onTabChange('documents')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === 'documents'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Documents
            <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
              {documents.length}
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'chats' ? (
            <div className="space-y-1.5">
              {sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-5 text-center">
                  <MessageSquare className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                  <p className="text-xs font-medium text-slate-300">No conversations yet</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Upload a document and ask your first question.
                  </p>
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const isEditing = editingSessionId === session.id

                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (!isEditing) {
                          onSelectSession(session.id)
                          onCloseMobile()
                        }
                      }}
                      className={`group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition ${
                        isActive
                          ? 'bg-indigo-600/15 ring-1 ring-indigo-500/40'
                          : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingTitle}
                              autoFocus
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitRename(session.id)
                                if (e.key === 'Escape') setEditingSessionId(null)
                              }}
                              className="w-full rounded-md border border-indigo-500 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none"
                            />
                            <button
                              onClick={() => void commitRename(session.id)}
                              className="rounded p-1 text-emerald-400 hover:bg-slate-800"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p
                              className={`truncate text-xs font-medium ${
                                isActive ? 'text-indigo-200' : 'text-slate-200'
                              }`}
                            >
                              {session.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {session.message_count} msgs · {formatRelativeTime(session.updated_at)}
                            </p>
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div
                          className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => startRename(session)}
                            title="Rename chat"
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => void onDeleteSession(session.id)}
                            title="Delete chat"
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  void handleFileChange(e.dataTransfer.files)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border border-dashed p-4 text-center transition ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-950/40 hover:border-indigo-500/60 hover:bg-slate-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,.json"
                  onChange={(e) => void handleFileChange(e.target.files)}
                  className="hidden"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-1.5 py-1">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                    <p className="text-xs font-medium text-indigo-200">
                      Indexing & embedding...
                    </p>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mx-auto mb-1.5 h-6 w-6 text-indigo-400" />
                    <p className="text-xs font-medium text-slate-200">
                      Drop PDFs or docs here
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      PDF, DOCX, TXT, MD, CSV, JSON
                    </p>
                  </>
                )}
              </div>

              {/* Filter header */}
              {documents.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    {selectedDocIds.length > 0
                      ? `${selectedDocIds.length} filtered`
                      : `All ${documents.length} active`}
                  </span>
                  {selectedDocIds.length > 0 && (
                    <button
                      onClick={onClearDocSelection}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300"
                    >
                      Use all docs
                    </button>
                  )}
                </div>
              )}

              {/* Documents list */}
              {documents.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-500">
                  No documents uploaded yet. Upload your first PDF or note above.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const isSelected = selectedDocIds.includes(doc.id)
                    const isDeleting = deletingDocId === doc.id
                    return (
                      <div
                        key={doc.id}
                        className={`group rounded-xl border p-2.5 transition ${
                          isSelected
                            ? 'border-indigo-500/50 bg-indigo-500/10'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => onToggleDocSelection(doc.id)}
                            title={
                              isSelected
                                ? 'Remove from search filter'
                                : 'Filter questions to this document'
                            }
                            className="mt-0.5 text-slate-400 hover:text-indigo-300"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                              <p
                                title={doc.filename}
                                className="truncate text-xs font-medium text-slate-200"
                              >
                                {doc.filename}
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-semibold uppercase text-slate-300">
                                {doc.file_type}
                              </span>
                              <span>{doc.page_count}p</span>
                              <span>·</span>
                              <span>{doc.chunk_count} chunks</span>
                              <span>·</span>
                              <span>{formatBytes(doc.file_size)}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => void handleDeleteDoc(doc.id)}
                            disabled={isDeleting}
                            title="Delete document"
                            className="rounded-md p-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer System Health */}
        <div className="border-t border-slate-800/80 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Database className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            {health ? (
              <span className="truncate">
                {health.chat_model} · {health.vector_store}
              </span>
            ) : (
              <span className="text-amber-400">Connecting to backend...</span>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
