'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Play } from 'lucide-react'
import Link from 'next/link'

interface Job {
  id: string
  type: string
  status: string
  progress: number
  progressMessage?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  sourcesCreated: number
  chunksCreated: number
  error?: string
  attempts: number
  maxAttempts: number
  nextRetryAt?: string
  target?: string
}

export default function JobsMonitoringPage() {
  const params = useParams()
  const botId = params.id as string
  
  const [jobs, setJobs] = useState<Job[]>([])
  const [kbStatus, setKbStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadJobs = useCallback(async () => {
    try {
      const [jobsRes, botRes] = await Promise.all([
        fetch(`/api/ingestion/status?botId=${botId}`),
        fetch(`/api/chatbots/${botId}`)
      ])
      
      const jobsData = await jobsRes.json()
      const botData = await botRes.json()
      
      if (jobsData.success) {
        setJobs(jobsData.data)
      }
      
      if (botData.success) {
        setKbStatus({
          status: botData.data.kbStatus,
          totalChunks: botData.data.kbTotalChunks,
          lastIndexed: botData.data.kbLastIndexed,
          error: botData.data.kbIndexingError
        })
      }
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }, [botId])

  useEffect(() => {
    loadJobs()
    
    if (autoRefresh) {
      const interval = setInterval(loadJobs, 3000) // Refresh every 3s
      return () => clearInterval(interval)
    }
  }, [autoRefresh, loadJobs])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50'
      case 'running': return 'text-blue-600 bg-blue-50'
      case 'pending': return 'text-yellow-600 bg-yellow-50'
      case 'failed': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5" />
      case 'running': return <Loader2 className="w-5 h-5 animate-spin" />
      case 'pending': return <Clock className="w-5 h-5" />
      case 'failed': return <XCircle className="w-5 h-5" />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'COMPLETATA'
      case 'running': return 'IN CORSO'
      case 'pending': return 'IN ATTESA'
      case 'failed': return 'NON RIUSCITA'
      default: return status.toUpperCase()
    }
  }

  const getKbStatusDisplay = () => {
    if (!kbStatus) return null
    
    switch (kbStatus.status) {
      case 'ready':
        return (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-900">Informazioni pronte</h3>
                <p className="text-sm text-green-700">
                  {kbStatus.totalChunks} sezioni disponibili
                  {kbStatus.lastIndexed && ` · Ultimo aggiornamento: ${new Date(kbStatus.lastIndexed).toLocaleString('it-IT')}`}
                </p>
              </div>
            </div>
          </div>
        )
      
      case 'indexing':
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <div>
                <h3 className="font-semibold text-blue-900">Aggiornamento in corso</h3>
                <p className="text-sm text-blue-700">
                  Le informazioni già pubblicate restano disponibili mentre controlliamo le nuove versioni.
                </p>
              </div>
            </div>
          </div>
        )
      
      case 'failed':
        return (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Aggiornamento non riuscito</h3>
                <p className="text-sm text-red-700">{kbStatus.error || 'Non è stato possibile aggiornare le informazioni.'}</p>
              </div>
            </div>
          </div>
        )
      
      case 'empty':
      default:
        return (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-gray-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Nessuna informazione importata</h3>
                <p className="text-sm text-gray-700">
                  Aggiungi una pagina web o un documento per iniziare.
                </p>
              </div>
            </div>
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Aggiornamento informazioni</h1>
              <p className="text-sm text-gray-600 mt-1">Stato reale delle pagine e dei documenti elaborati dal chatbot.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Aggiornamento automatico
              </label>
              <button
                onClick={loadJobs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Aggiorna
              </button>
              <Link
                href={`/chatbot/${botId}/setup`}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Torna alla configurazione
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* KB Status */}
        <div className="mb-6">
          {getKbStatusDisplay()}
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Importazioni ({jobs.length})</h2>
          </div>
          
          {jobs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Play className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">Nessuna importazione</p>
              <p className="text-sm mt-2">Le attività compariranno qui quando aggiungi nuove informazioni.</p>
            </div>
          ) : (
            <div className="divide-y">
              {jobs.map((job) => (
                <div key={job.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${getStatusColor(job.status)}`}>
                          {getStatusIcon(job.status)}
                          {getStatusLabel(job.status)}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {job.type === 'crawl' && 'Scansione sito'}
                          {job.type === 'pdf' && 'Documento PDF'}
                          {job.type === 'url' && 'Pagina web'}
                          {job.type === 'reindex' && 'Reindicizzazione'}
                        </span>
                      </div>

                      {job.target && (
                        <p className="mb-3 break-all text-sm font-medium text-gray-800">{job.target}</p>
                      )}
                      
                      {/* Progress Bar */}
                      {job.status === 'running' && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-600">{job.progressMessage || 'Processing...'}</span>
                            <span className="font-medium text-blue-600">{job.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Results */}
                      {job.status === 'completed' && (
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <span>{job.sourcesCreated} fonti aggiornate</span>
                          <span>{job.chunksCreated} sezioni disponibili</span>
                        </div>
                      )}

                      {job.status === 'pending' && job.error && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <p className="font-medium">L’ultimo tentativo non è riuscito</p>
                          <p className="mt-1 text-amber-800">{job.error}</p>
                          <p className="mt-2 text-xs text-amber-700">
                            Tentativo {job.attempts} di {job.maxAttempts}
                            {job.nextRetryAt && ` · Nuovo tentativo: ${new Date(job.nextRetryAt).toLocaleString('it-IT')}`}
                          </p>
                        </div>
                      )}
                      
                      {/* Error */}
                      {job.status === 'failed' && job.error && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 mb-2">
                          <p className="text-sm text-red-700">{job.error}</p>
                          {job.attempts < job.maxAttempts && (
                            <p className="text-xs text-red-600 mt-1">
                              Tentativo {job.attempts} di {job.maxAttempts}
                            </p>
                          )}
                          <Link href="/settings#operations-title" className="mt-2 inline-block text-xs font-semibold text-red-700 underline underline-offset-2">
                            Apri il monitor operativo
                          </Link>
                        </div>
                      )}
                      
                      {/* Timestamps */}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Creato: {new Date(job.createdAt).toLocaleString('it-IT')}</span>
                        {job.startedAt && (
                          <span>Avviato: {new Date(job.startedAt).toLocaleString('it-IT')}</span>
                        )}
                        {job.completedAt && (
                          <span>Concluso: {new Date(job.completedAt).toLocaleString('it-IT')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
