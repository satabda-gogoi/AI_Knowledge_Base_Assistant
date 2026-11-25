import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, Bot, ChevronDown, ChevronUp, FileText, User } from 'lucide-react'
import type { ChatMessage, SourceCitation } from '../types'

interface ChatMessageBubbleProps {
  message: ChatMessage
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const [expandedCitationId, setExpandedCitationId] = useState<number | null>(null)
  const [showAllSources, setShowAllSources] = useState(false)

  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-indigo-950/40">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    )
  }

  const sources: SourceCitation[] = message.sources || []

  const toggleCitation = (citationId: number) => {
    setShowAllSources(false)
    setExpandedCitationId((prev) => (prev === citationId ? null : citationId))
  }

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-3xl items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 text-indigo-300 ring-1 ring-slate-700">
          <Bot className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="rounded-2xl rounded-tl-sm border border-slate-800/90 bg-slate-900/80 px-5 py-4 text-sm text-slate-200 shadow-sm">
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>

          {sources.length > 0 && (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Sources Referenced ({sources.length})</span>
                </div>
                <button
                  onClick={() => {
                    setExpandedCitationId(null)
                    setShowAllSources((prev) => !prev)
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
                >
                  {showAllSources ? (
                    <>
                      Hide excerpts <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Expand all <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>

              {/* Citation Pills */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {sources.map((src) => {
                  const isActive = showAllSources || expandedCitationId === src.citation_id
                  return (
                    <button
                      key={`${src.doc_id}-${src.citation_id}`}
                      onClick={() => toggleCitation(src.citation_id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition ${
                        isActive
                          ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                          : 'border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      <span className="font-semibold text-indigo-400">[{src.citation_id}]</span>
                      <FileText className="h-3 w-3 text-slate-400" />
                      <span className="max-w-[160px] truncate">{src.filename}</span>
                      {src.page !== null && (
                        <span className="text-slate-400">p.{src.page}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Expanded Excerpt Cards */}
              {(showAllSources || expandedCitationId !== null) && (
                <div className="mt-3 space-y-2">
                  {sources
                    .filter((src) => showAllSources || src.citation_id === expandedCitationId)
                    .map((src) => (
                      <div
                        key={`detail-${src.doc_id}-${src.citation_id}`}
                        className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs"
                      >
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                            <span>[{src.citation_id}]</span>
                            <span>{src.filename}</span>
                            {src.page !== null && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                Page {src.page}
                              </span>
                            )}
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                              Chunk #{src.chunk_index + 1}
                            </span>
                          </div>
                          {src.score !== null && (
                            <span className="text-[10px] text-slate-400">
                              Relevance: {(src.score * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-slate-300">
                          {src.excerpt}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
