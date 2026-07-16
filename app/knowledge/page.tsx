'use client'

import { useCallback, useEffect, useState } from 'react'
import { Database, Upload, Globe, FileText, FileSpreadsheet, FileType2, PenLine, Trash2, Search, Plus, Loader2, CheckCircle, XCircle, AlertCircle, Globe2 } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

interface KnowledgeSource {
  id: string
  botId: string
  sourceType: 'url' | 'pdf' | 'docx' | 'txt' | 'csv' | 'manual'
  sourceUrl: string | null
  originalFilename: string | null
  contentText: string
  processedAt: string | null
  status: 'processing' | 'completed' | 'failed'
  createdAt: string
  chunkCount: number
  errorMessage: string | null
}

interface Chatbot {
  id: string
  companyName: string
  _count: {
    knowledgeSources: number
  }
}

export default function KnowledgePage() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [selectedChatbot, setSelectedChatbot] = useState<string>('')
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadType, setUploadType] = useState<'pdf' | 'url' | 'crawl'>('pdf')
  const [url, setUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [crawlProgress, setCrawlProgress] = useState<string>('')

  useEffect(() => {
    fetchChatbots()
  }, [])

  const fetchChatbots = async () => {
    try {
      const response = await fetch('/api/chatbots')
      if (response.ok) {
        const data = await response.json()
        const bots = data.success ? (data.data || []) : []
        setChatbots(bots)
        // Auto-select first chatbot
        if (bots.length > 0) {
          setSelectedChatbot(bots[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching chatbots:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchKnowledgeSources = useCallback(async () => {
    if (!selectedChatbot) return
    
    try {
      const response = await fetch(`/api/knowledge-sources?botId=${selectedChatbot}`)
      if (response.ok) {
        const data = await response.json()
        setKnowledgeSources(data.success ? (data.data || []) : [])
      }
    } catch (error) {
      console.error('Error fetching knowledge sources:', error)
    }
  }, [selectedChatbot])

  useEffect(() => {
    if (selectedChatbot) {
      fetchKnowledgeSources()
      const interval = window.setInterval(fetchKnowledgeSources, 5000)
      return () => window.clearInterval(interval)
    }
  }, [selectedChatbot, fetchKnowledgeSources])

  const handleCrawl = async () => {
    if (!selectedChatbot) {
      alert('Seleziona un chatbot prima')
      return
    }

    if (!crawlUrl.trim()) {
      alert('Inserisci un URL da cui iniziare il crawling')
      return
    }

    setCrawling(true)
    setCrawlProgress('Inizializzazione crawler...')

    try {
      const response = await fetch('/api/knowledge-sources/crawl-with-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedChatbot,
          url: crawlUrl.trim(),
          maxPages: 10,
          maxDepth: 3,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const jobId = data.jobId
        let completed = false
        for (let attempt = 0; attempt < 150; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          const statusResponse = await fetch(`/api/ingestion/status?jobId=${jobId}`)
          const statusData = await statusResponse.json()
          if (!statusResponse.ok) throw new Error(statusData.error || 'Stato crawl non disponibile')
          const job = statusData.data
          setCrawlProgress(`${job.progress || 0}% · ${job.progressMessage || 'Elaborazione in corso...'}`)
          if (job.status === 'completed') {
            completed = true
            setCrawlUrl('')
            setShowUploadModal(false)
            await fetchKnowledgeSources()
            alert(`Crawl completato: ${job.sourcesCreated} pagine e ${job.chunksCreated} blocchi indicizzati.`)
            break
          }
          if (job.status === 'failed') throw new Error(job.error || 'Il crawler non è riuscito a completare il sito')
        }
        if (!completed) throw new Error('Il crawl sta impiegando troppo tempo. Puoi seguirlo dalla pagina dei job.')
      } else {
        const data = await response.json()
        alert('❌ Errore durante il crawling: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error crawling:', error)
      alert(`Errore durante il crawling: ${error instanceof Error ? error.message : 'errore sconosciuto'}`)
    } finally {
      setCrawling(false)
      setCrawlProgress('')
    }
  }

  const handleUpload = async () => {
    if (!selectedChatbot) {
      alert('Seleziona un chatbot prima')
      return
    }

    if (uploadType === 'crawl') {
      return handleCrawl()
    }

    if (uploadType === 'url' && !url.trim()) {
      alert('Inserisci un URL')
      return
    }

    if (uploadType === 'pdf' && !selectedFile) {
      alert('Seleziona un file PDF')
      return
    }

    setUploading(true)

    try {
      if (uploadType === 'url') {
        // Upload URL
        const response = await fetch('/api/knowledge-sources/add-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botId: selectedChatbot,
            url: url.trim(),
          }),
        })

        if (response.ok) {
          setUrl('')
          setShowUploadModal(false)
          fetchKnowledgeSources()
          alert('✅ URL aggiunto con successo!')
        } else {
          const data = await response.json()
          alert('❌ Errore: ' + (data.error || 'Impossibile aggiungere URL'))
        }
      } else {
        // Upload PDF
        const formData = new FormData()
        formData.append('botId', selectedChatbot)
        formData.append('file', selectedFile!)

        const response = await fetch('/api/knowledge-sources/upload-pdf', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          setSelectedFile(null)
          setShowUploadModal(false)
          fetchKnowledgeSources()
          alert('✅ PDF caricato con successo!')
        } else {
          const data = await response.json()
          alert('❌ Errore: ' + (data.error || 'Impossibile caricare PDF'))
        }
      }
    } catch (error) {
      console.error('Error uploading:', error)
      alert('❌ Errore durante il caricamento')
    } finally {
      setUploading(false)
    }
  }

  const deleteSource = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa knowledge source?')) return

    try {
      const response = await fetch(`/api/knowledge-sources?sourceId=${id}&botId=${selectedChatbot}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchKnowledgeSources()
      }
    } catch (error) {
      console.error('Error deleting source:', error)
    }
  }

  const filteredSources = knowledgeSources.filter(source => {
    if (!searchTerm.trim()) return true
    
    const search = searchTerm.toLowerCase()
    const filename = source.originalFilename?.toLowerCase() || ''
    const url = source.sourceUrl?.toLowerCase() || ''
    
    return filename.includes(search) || url.includes(search)
  })

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <Badge variant="success" dot>Completato</Badge>
    if (status === 'processing') return <Badge variant="info" dot>Processing...</Badge>
    if (status === 'failed') return <Badge variant="danger" dot>Errore</Badge>
    return <Badge variant="gray">{status}</Badge>
  }

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="w-5 h-5 text-success-600" />
    if (status === 'processing') return <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
    if (status === 'failed') return <XCircle className="w-5 h-5 text-danger-600" />
    return <AlertCircle className="w-5 h-5 text-gray-400" />
  }

  const getSourceIcon = (type: KnowledgeSource['sourceType']) => {
    if (type === 'url') return <Globe className="h-6 w-6 text-brand-600" />
    if (type === 'csv') return <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
    if (type === 'docx') return <FileType2 className="h-6 w-6 text-blue-600" />
    if (type === 'manual') return <PenLine className="h-6 w-6 text-violet-600" />
    return <FileText className={`h-6 w-6 ${type === 'pdf' ? 'text-danger-600' : 'text-gray-600'}`} />
  }

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Caricamento knowledge base..." />
      </DashboardLayout>
    )
  }

  if (chatbots.length === 0) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Card padding="none">
            <EmptyState
              icon={Database}
              title="Nessun chatbot disponibile"
              description="Crea prima un chatbot per gestire la knowledge base"
              action={{
                label: "Crea Chatbot",
                onClick: () => {
                  window.dispatchEvent(new Event('open-create-modal'))
                },
                variant: "success"
              }}
            />
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const selectedBot = chatbots.find(b => b.id === selectedChatbot)

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mx-auto max-w-[1500px] px-5 pt-6 lg:px-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Knowledge engine</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">Knowledge Base</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestisci le fonti di conoscenza per i tuoi chatbot
            </p>
          </div>
        </div>
      </div>

      {/* Chatbot Selector */}
      <div className="mx-auto mt-6 max-w-[1500px] px-5 lg:px-7">
        <div className="card flex items-end gap-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Seleziona Chatbot
            </label>
            <select
              value={selectedChatbot}
              onChange={(e) => setSelectedChatbot(e.target.value)}
              className="input"
            >
              {chatbots.map(bot => (
                <option key={bot.id} value={bot.id}>
                  {bot.companyName} ({bot._count.knowledgeSources} sources)
                </option>
              ))}
            </select>
          </div>

          {selectedBot && (
            <div className="flex gap-2">
              <Link href="/knowledge/import" className="btn btn-secondary"><Upload className="h-4 w-4" />Importa documenti</Link>
              <Button
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowUploadModal(true)}
              >
                Aggiungi fonte
              </Button>
            </div>
          )}
        </div></div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-7">
        {selectedBot && (
          <>
            {/* Search */}
            <div className="mb-6">
              <Input
                placeholder="Cerca per nome file o URL..."
                icon={<Search className="w-4 h-4" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Knowledge Sources */}
            {filteredSources.length === 0 ? (
              <Card padding="none">
                <EmptyState
                  icon={Database}
                  title={searchTerm ? "Nessun risultato" : "Nessuna knowledge source"}
                  description={
                    searchTerm
                      ? "Nessuna source trovata con questo termine"
                      : `Aggiungi PDF o URL per arricchire la knowledge base di ${selectedBot.companyName}`
                  }
                  action={!searchTerm ? {
                    label: "Aggiungi Prima Source",
                    onClick: () => setShowUploadModal(true),
                    variant: "success"
                  } : undefined}
                />
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredSources.map((source) => (
                  <Card key={source.id} hover padding="md">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        {/* Icon */}
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {getSourceIcon(source.sourceType)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {source.originalFilename || source.sourceUrl}
                            </h3>
                            {getStatusBadge(source.status)}
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Tipo:</span>{' '}
                              <span className="text-gray-900 font-medium uppercase">
                                {source.sourceType}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Chunks:</span>{' '}
                              <span className="text-gray-900 font-medium">
                                {source.chunkCount}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Caricato:</span>{' '}
                              <span className="text-gray-900">
                                {new Date(source.createdAt).toLocaleDateString('it-IT')}
                              </span>
                            </div>
                          </div>

                          {source.errorMessage && (
                            <p className="text-sm text-danger-600 mt-2">
                              Errore: {source.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        {getStatusIcon(source.status)}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSource(source.id)}
                          icon={<Trash2 className="w-4 h-4 text-danger-600" />}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full" padding="none">
            <CardHeader>
              <CardTitle>Aggiungi Knowledge Source</CardTitle>
              <CardDescription>
                Carica un PDF o aggiungi un URL per {selectedBot?.companyName}
              </CardDescription>
            </CardHeader>

            <div className="p-6 space-y-6">
              {/* Type Selector */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={uploadType === 'pdf' ? 'primary' : 'secondary'}
                  onClick={() => setUploadType('pdf')}
                  icon={<FileText className="w-4 h-4" />}
                  size="sm"
                >
                  PDF
                </Button>
                <Button
                  variant={uploadType === 'url' ? 'primary' : 'secondary'}
                  onClick={() => setUploadType('url')}
                  icon={<Globe className="w-4 h-4" />}
                  size="sm"
                >
                  URL
                </Button>
                <Button
                  variant={uploadType === 'crawl' ? 'primary' : 'secondary'}
                  onClick={() => setUploadType('crawl')}
                  icon={<Globe2 className="w-4 h-4" />}
                  size="sm"
                >
                  Crawl Site
                </Button>
              </div>

              {/* Upload Form */}
              {uploadType === 'crawl' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-brand-50 to-purple-50 border-2 border-brand-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Globe2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-brand-900 mb-1">
                          🚀 Intelligent Website Crawler
                        </p>
                        <p className="text-sm text-brand-800">
                          Inserisci solo l&apos;URL e il crawler farà tutto automaticamente:
                        </p>
                        <ul className="text-sm text-brand-700 mt-2 space-y-1">
                          <li>✅ Trova tutte le pagine del sito (fino a 200)</li>
                          <li>✅ Estrae solo il contenuto di qualità</li>
                          <li>✅ Rimuove automaticamente duplicati e noise</li>
                          <li>✅ Crea chunks ottimizzati per il RAG</li>
                          <li>✅ Aggiunge tutto alla knowledge base</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Input
                    label="URL del Sito"
                    placeholder="https://example.com o https://docs.example.com"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                    helperText="Inserisci l'URL principale del sito (homepage o sezione docs)"
                    disabled={crawling}
                  />

                  {crawling && (
                    <div className="p-6 bg-gradient-to-br from-brand-50 to-purple-50 border-2 border-brand-300 rounded-xl">
                      <div className="flex items-center gap-4 mb-4">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                        <div>
                          <p className="font-bold text-brand-900">Crawling in corso...</p>
                          <p className="text-sm text-brand-700">
                            Sto esplorando il sito e raccogliendo contenuto
                          </p>
                        </div>
                      </div>
                      {crawlProgress && (
                        <p className="text-sm text-brand-600 bg-white/50 rounded-lg px-4 py-2">
                          {crawlProgress}
                        </p>
                      )}
                      <div className="mt-4 flex items-center gap-2 text-xs text-brand-600">
                        <div className="w-2 h-2 bg-brand-600 rounded-full animate-pulse"></div>
                        Questo processo può richiedere 2-5 minuti
                      </div>
                    </div>
                  )}

                  {!crawling && (
                    <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
                      <p className="text-sm text-success-800">
                        💡 <strong>Automatico:</strong> Il crawler decide automaticamente quante pagine crawlare 
                        e quanto andare in profondità. Non serve configurare nulla!
                      </p>
                    </div>
                  )}
                </div>
              ) : uploadType === 'url' ? (
                <Input
                  label="URL"
                  placeholder="https://example.com/documentation"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  helperText="Inserisci l'URL di una pagina web da cui estrarre contenuto"
                />
              ) : (
                <div>
                  <label className="form-label">File PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="input"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-600 mt-2">
                      Selezionato: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                Annulla
              </Button>
              <Button
                variant="success"
                onClick={handleUpload}
                loading={uploading || crawling}
                disabled={uploading || crawling}
                icon={!uploading && !crawling && (
                  uploadType === 'crawl' ? <Globe2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />
                )}
              >
                {crawling ? 'Crawling...' : uploading ? 'Caricamento...' : uploadType === 'crawl' ? 'Avvia Crawl' : 'Carica'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  )
}
