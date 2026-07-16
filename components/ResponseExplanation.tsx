/**
 * RESPONSE EXPLANATION COMPONENT
 * 
 * Shows decision trace to users for transparency
 */

'use client'

import { useState, useEffect } from 'react'
import { Card } from './ui/Card'

interface ResponseExplanationProps {
  messageId: string
  compact?: boolean
}

export function ResponseExplanation({ messageId, compact = false }: ResponseExplanationProps) {
  const [trace, setTrace] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return

    setLoading(true)
    fetch(`/api/decisions/${messageId}/trace`)
      .then(res => res.json())
      .then(data => setTrace(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [messageId, expanded])

  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:text-blue-800 mt-1"
      >
        {expanded ? '🔽 Hide sources' : '🔍 See how I answered'}
      </button>
    )
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>How was this answer generated?</span>
      </button>

      {expanded && (
        <Card className="mt-2 p-4 bg-gray-50 border">
          {loading && (
            <div className="text-center py-4 text-gray-500">
              Loading explanation...
            </div>
          )}

          {!loading && !trace && (
            <div className="text-center py-4 text-gray-500">
              No explanation available
            </div>
          )}

          {!loading && trace && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-semibold text-gray-700 mb-1">
                  🎯 Strategy Used
                </div>
                <div className="text-gray-600">
                  {trace.decision.strategy.replace(/_/g, ' ')}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {trace.decision.why}
                </div>
              </div>

              <div>
                <div className="font-semibold text-gray-700 mb-1">
                  📚 Sources Consulted
                </div>
                <div className="space-y-1">
                  {trace.retrieval.sourcesUsed
                    .filter((s: any) => s.used)
                    .map((source: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-gray-600">
                        <span className="text-green-600">✓</span>
                        <span>
                          {source.source === 'knowledge_base' && '📖 Knowledge Base'}
                          {source.source === 'knowledge_graph' && '🕸️ Knowledge Graph'}
                          {source.source === 'persistent_memory' && '🧠 Your Previous Conversations'}
                          {source.source === 'context' && '💬 Current Conversation'}
                        </span>
                        {source.resultsCount > 0 && (
                          <span className="text-xs text-gray-500">
                            ({source.resultsCount} results)
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <div className="font-semibold text-gray-700 mb-1">
                  📊 Confidence
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        trace.outcome.overallConfidence > 0.8
                          ? 'bg-green-500'
                          : trace.outcome.overallConfidence > 0.6
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{
                        width: `${trace.outcome.overallConfidence * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-gray-600 text-xs">
                    {(trace.outcome.overallConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {trace.issues && trace.issues.length > 0 && (
                <div className="border-t pt-3">
                  <div className="font-semibold text-yellow-700 mb-1">
                    ⚠️ Notes
                  </div>
                  {trace.issues.map((issue: any, i: number) => (
                    <div key={i} className="text-xs text-yellow-700">
                      • {issue.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 text-xs text-gray-500">
                Processed in {trace.outcome.totalProcessingTime}ms
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
