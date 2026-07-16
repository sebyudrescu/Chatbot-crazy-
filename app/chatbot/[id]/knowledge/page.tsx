'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Upload, Link as LinkIcon, Trash2, FileText, Globe, Loader2, CheckCircle, XCircle, ArrowLeft, MessageSquare } from 'lucide-react'
import Link from 'next/link'

interface KnowledgeSource {
  id: string
  sourceType: string
  sourceUrl?: string
  originalFilename?: string
  status: string
  chunkCount: number
  errorMessage?: string
  createdAt: string
}

export default function KnowledgeBasePage() {
  const params = useParams()
  const router = useRouter()
  const botId = params.id as string

  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [url, setUrl] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge-sources?botId=${botId}`)
      const data = await res.json()
      if (data.success) {
        setSources(data.data)
      }
    } catch (error) {
      console.error('Error fetching sources:', error)
    } finally {
      setLoading(false)
    }
  }, [botId])

  useEffect(() => {
    fetchSources()
    // Poll for updates every 3 seconds
    const interval = setInterval(fetchSources, 3000)
    return () => clearInterval(interval)
  }, [fetchSources])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('botId', botId)

      const res = await fetch('/api/knowledge-sources/upload-pdf', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        alert('PDF uploaded successfully! Processing...')
        fetchSources()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Failed to upload file')
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  const handleAddUrl = async () => {
    if (!url) return

    setAddingUrl(true)

    try {
      const res = await fetch('/api/knowledge-sources/add-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, url }),
      })

      const data = await res.json()

      if (data.success) {
        alert('URL added successfully! Processing...')
        setUrl('')
        fetchSources()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error adding URL:', error)
      alert('Failed to add URL')
    } finally {
      setAddingUrl(false)
    }
  }

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this source?')) return

    try {
      const res = await fetch(
        `/api/knowledge-sources?sourceId=${sourceId}&botId=${botId}`,
        { method: 'DELETE' }
      )

      const data = await res.json()

      if (data.success) {
        fetchSources()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting source:', error)
      alert('Failed to delete source')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return null
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completato'
      case 'processing':
        return 'Elaborazione...'
      case 'failed':
        return 'Fallito'
      default:
        return status
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
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
            <Link
              href={`/chat/${botId}`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Prova Chat
            </Link>
          </div>
          <p className="text-gray-600">
            Carica documenti per alimentare il tuo agente AI con informazioni specifiche
          </p>
        </div>

        {/* Upload Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* PDF Upload */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold">Carica PDF</h2>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Carica documenti PDF (max 10MB)
            </p>
            <label className="block">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  uploading
                    ? 'border-gray-300 bg-gray-50'
                    : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-3 animate-spin" />
                    <p className="text-gray-600">Caricamento in corso...</p>
                  </>
                ) : (
                  <>
                    <FileText className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                    <p className="text-gray-900 font-medium mb-1">
                      Clicca per caricare PDF
                    </p>
                    <p className="text-gray-500 text-sm">
                      o trascina il file qui
                    </p>
                  </>
                )}
              </div>
            </label>
          </div>

          {/* URL Input */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <LinkIcon className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold">Aggiungi URL</h2>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Inserisci l&apos;URL di una pagina web da cui estrarre contenuto
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
              disabled={addingUrl}
            />
            <button
              onClick={handleAddUrl}
              disabled={!url || addingUrl}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {addingUrl ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aggiungendo...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Aggiungi URL
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sources List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Documenti Caricati ({sources.length})
          </h2>

          {sources.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Nessun documento caricato ancora
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Carica PDF o aggiungi URL per iniziare
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {source.sourceType === 'pdf' ? (
                      <FileText className="w-8 h-8 text-red-600 flex-shrink-0" />
                    ) : (
                      <Globe className="w-8 h-8 text-blue-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {source.originalFilename || source.sourceUrl || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-500">
                          {new Date(source.createdAt).toLocaleDateString('it-IT')}
                        </span>
                        {source.status === 'completed' && (
                          <span className="text-sm text-gray-500">
                            {source.chunkCount} chunks
                          </span>
                        )}
                      </div>
                      {source.errorMessage && (
                        <p className="text-sm text-red-600 mt-1">
                          {source.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(source.status)}
                      <span className="text-sm font-medium">
                        {getStatusText(source.status)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">
            💡 Come Funziona il Sistema RAG
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• I documenti vengono processati e divisi in chunks</li>
            <li>• Ogni chunk viene convertito in un embedding vettoriale</li>
            <li>• Gli embeddings sono salvati in un indice FAISS</li>
            <li>• Quando un utente fa una domanda, il sistema cerca i chunks più rilevanti</li>
            <li>• Il chatbot usa SOLO questi chunks per generare la risposta</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
