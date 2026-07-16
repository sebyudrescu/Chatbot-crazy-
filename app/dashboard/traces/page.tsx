/**
 * TRACES DASHBOARD PAGE
 * 
 * Simple dashboard per visualizzare decision traces
 */

'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface TraceSummary {
  totalMessages: number
  tracesAvailable: number
  avgConfidence: number
  avgResponseTime: number
  strategies: Record<string, number>
  issueCount: number
}

export default function TracesDashboard() {
  const [botId, setBotId] = useState('')
  const [bots, setBots] = useState<any[]>([])
  const [summary, setSummary] = useState<TraceSummary | null>(null)
  const [traces, setTraces] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTrace, setSelectedTrace] = useState<any>(null)

  // Load bots
  useEffect(() => {
    fetch('/api/chatbots')
      .then(res => res.json())
      .then(data => {
        setBots(data.chatbots || [])
        if (data.chatbots && data.chatbots.length > 0) {
          setBotId(data.chatbots[0].id)
        }
      })
      .catch(console.error)
  }, [])

  // Load traces when bot selected
  useEffect(() => {
    if (!botId) return

    setLoading(true)
    fetch(`/api/dashboard/traces?botId=${botId}&limit=20`)
      .then(res => res.json())
      .then(data => {
        setSummary(data.summary)
        setTraces(data.traces || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [botId])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📊 Decision Traces</h1>
          <p className="text-gray-600 mt-1">Monitor and debug bot decisions in real-time</p>
        </div>
        
        <select
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">Select Bot</option>
          {bots.map(bot => (
            <option key={bot.id} value={bot.id}>
              {bot.companyName}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-gray-600">Total Messages</div>
              <div className="text-2xl font-bold mt-1">{summary.totalMessages}</div>
            </Card>

            <Card className="p-4">
              <div className="text-sm text-gray-600">Avg Confidence</div>
              <div className="text-2xl font-bold mt-1">
                {(summary.avgConfidence * 100).toFixed(0)}%
              </div>
              <div className={`text-xs mt-1 ${
                summary.avgConfidence > 0.8 ? 'text-green-600' :
                summary.avgConfidence > 0.6 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {summary.avgConfidence > 0.8 ? '✅ Excellent' :
                 summary.avgConfidence > 0.6 ? '⚠️ Acceptable' :
                 '❌ Needs improvement'}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm text-gray-600">Avg Response Time</div>
              <div className="text-2xl font-bold mt-1">
                {summary.avgResponseTime.toFixed(0)}ms
              </div>
              <div className={`text-xs mt-1 ${
                summary.avgResponseTime < 500 ? 'text-green-600' :
                summary.avgResponseTime < 1000 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {summary.avgResponseTime < 500 ? '⚡ Fast' :
                 summary.avgResponseTime < 1000 ? '✓ Good' :
                 '⚠️ Slow'}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm text-gray-600">Issues Detected</div>
              <div className="text-2xl font-bold mt-1">{summary.issueCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.issueCount === 0 ? '✅ All good' : '⚠️ Review needed'}
              </div>
            </Card>
          </div>

          {/* Strategy Distribution */}
          {Object.keys(summary.strategies).length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">🎯 Strategy Distribution</h2>
              <div className="space-y-3">
                {Object.entries(summary.strategies).map(([strategy, count]) => {
                  const percentage = ((count / summary.totalMessages) * 100).toFixed(0)
                  return (
                    <div key={strategy}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{strategy}</span>
                        <span className="text-gray-600">{count} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Recent Traces */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">📝 Recent Traces</h2>
            
            {traces.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No traces available yet</p>
                <p className="text-sm mt-2">Chat with the bot to generate traces</p>
              </div>
            ) : (
              <div className="space-y-3">
                {traces.map((trace, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition"
                    onClick={() => setSelectedTrace(trace)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
                          {trace.query.substring(0, 100)}
                          {trace.query.length > 100 ? '...' : ''}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-gray-600">
                          <span>Strategy: <span className="font-medium">{trace.decision.strategy}</span></span>
                          <span>Confidence: <span className={`font-medium ${
                            trace.outcome.overallConfidence > 0.8 ? 'text-green-600' :
                            trace.outcome.overallConfidence > 0.6 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>{(trace.outcome.overallConfidence * 100).toFixed(0)}%</span></span>
                          <span>Time: <span className="font-medium">{trace.outcome.totalProcessingTime}ms</span></span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTrace(trace)
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                    
                    {trace.issues && trace.issues.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {trace.issues.map((issue: any, i: number) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-1 rounded ${
                              issue.severity === 'error' ? 'bg-red-100 text-red-700' :
                              issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {issue.severity === 'error' ? '🚨' :
                             issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
                            {' '}{issue.message}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Trace Detail Modal */}
      {selectedTrace && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTrace(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Decision Trace Details</h2>
              <button
                onClick={() => setSelectedTrace(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Query */}
              <div>
                <h3 className="font-semibold mb-2">Query</h3>
                <p className="text-gray-700">{selectedTrace.query}</p>
              </div>

              {/* Understanding */}
              <div>
                <h3 className="font-semibold mb-2">🧠 Understanding</h3>
                <div className="bg-gray-50 rounded p-4 space-y-2 text-sm">
                  <div><span className="font-medium">Intent:</span> {selectedTrace.understanding.intent}</div>
                  <div><span className="font-medium">Type:</span> {selectedTrace.understanding.queryType}</div>
                  {selectedTrace.understanding.entities.length > 0 && (
                    <div><span className="font-medium">Entities:</span> {selectedTrace.understanding.entities.join(', ')}</div>
                  )}
                </div>
              </div>

              {/* Decision */}
              <div>
                <h3 className="font-semibold mb-2">🎯 Decision</h3>
                <div className="bg-gray-50 rounded p-4 space-y-2 text-sm">
                  <div><span className="font-medium">Strategy:</span> {selectedTrace.decision.strategy}</div>
                  <div><span className="font-medium">Why:</span> {selectedTrace.decision.why}</div>
                  <div><span className="font-medium">Confidence:</span> {(selectedTrace.decision.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>

              {/* Retrieval */}
              <div>
                <h3 className="font-semibold mb-2">🔍 Retrieval</h3>
                <div className="space-y-2">
                  {selectedTrace.retrieval.sourcesUsed.map((source: any, i: number) => (
                    <div key={i} className="bg-gray-50 rounded p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {source.used ? '✅' : '❌'} {source.source}
                        </span>
                        {source.used && source.resultsCount > 0 && (
                          <span className="text-gray-600">
                            {source.resultsCount} results, top: {(source.topScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {!source.used && source.reason && (
                        <div className="text-gray-600 text-xs mt-1">{source.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Outcome */}
              <div>
                <h3 className="font-semibold mb-2">📊 Outcome</h3>
                <div className="bg-gray-50 rounded p-4 space-y-2 text-sm">
                  <div><span className="font-medium">Success:</span> {selectedTrace.outcome.success ? '✅ Yes' : '❌ No'}</div>
                  <div><span className="font-medium">Confidence:</span> {(selectedTrace.outcome.overallConfidence * 100).toFixed(0)}%</div>
                  <div><span className="font-medium">Processing Time:</span> {selectedTrace.outcome.totalProcessingTime}ms</div>
                </div>
              </div>

              {/* Issues */}
              {selectedTrace.issues && selectedTrace.issues.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">⚠️ Issues</h3>
                  <div className="space-y-2">
                    {selectedTrace.issues.map((issue: any, i: number) => (
                      <div key={i} className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                        <div className="font-medium text-yellow-800">{issue.message}</div>
                        {issue.suggestion && (
                          <div className="text-yellow-700 text-xs mt-1">💡 {issue.suggestion}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
