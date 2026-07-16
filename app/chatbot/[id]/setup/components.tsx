'use client'

import { Upload, LinkIcon, FileText, Globe, Loader2, Trash2, CheckCircle, XCircle, AlertCircle, Zap, Brain, ArrowRight, ArrowLeft, MessageSquare } from 'lucide-react'

interface Template {
  id: string
  name: string
  description: string
  category: string
}

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

// ============================================================================
// STEP 1: Settings
// ============================================================================
export function SettingsStep({
  companyName,
  setCompanyName,
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  saving,
  onSave,
  onNext
}: {
  companyName: string
  setCompanyName: (name: string) => void
  templates: Template[]
  selectedTemplateId: string | null
  setSelectedTemplateId: (id: string) => void
  saving: boolean
  onSave: () => void
  onNext: () => void
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Brain className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Configurazione Base</h2>
            <p className="text-gray-600">Imposta il nome e la personalità del tuo chatbot</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome Azienda
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="es. Acme Corp"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
            <p className="text-sm text-gray-500 mt-1">
              Questo nome verrà usato nelle risposte del chatbot
            </p>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Tipo di Chatbot
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedTemplateId === template.id
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {template.description}
                      </p>
                      <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        {template.category}
                      </span>
                    </div>
                    {selectedTemplateId === template.id && (
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <button
              onClick={onSave}
              disabled={saving || !companyName || !selectedTemplateId}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
            </button>
            <button
              onClick={onNext}
              disabled={!companyName || !selectedTemplateId}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
            >
              Continua
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              💡 Cos&apos;è un Template?
            </h3>
            <p className="text-sm text-blue-800">
              Il template definisce la personalità e il tono del chatbot. Ad esempio, un template &quot;Customer Support&quot; 
              sarà professionale e orientato alla risoluzione problemi, mentre &quot;Sales Agent&quot; sarà più persuasivo.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 2: Knowledge Base
// ============================================================================
export function KnowledgeStep({
  sources,
  uploading,
  url,
  setUrl,
  addingUrl,
  crawlMode,
  setCrawlMode,
  crawlProgress,
  onFileUpload,
  onAddUrl,
  onDelete,
  onNext,
  onBack,
  crawlPercentage = 0,
  crawlStatus = ''
}: {
  sources: KnowledgeSource[]
  uploading: boolean
  url: string
  setUrl: (url: string) => void
  addingUrl: boolean
  crawlMode: 'single' | 'full'
  setCrawlMode: (mode: 'single' | 'full') => void
  crawlProgress: string
  crawlPercentage?: number
  crawlStatus?: string
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAddUrl: () => void
  onDelete: (id: string) => void
  onNext: () => void
  onBack: () => void
}) {
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <Zap className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Knowledge Base</h2>
            <p className="text-gray-600">Carica i documenti per addestrare il chatbot</p>
          </div>
        </div>

        {/* Upload Options */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* PDF Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-blue-400 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-6 h-6 text-blue-600" />
              <h3 className="text-lg font-semibold">📄 Carica PDF</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Carica documenti PDF (max 10MB)
            </p>
            <label className="block">
              <input
                type="file"
                accept=".pdf"
                onChange={onFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  uploading
                    ? 'border-gray-300 bg-gray-50'
                    : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-10 h-10 text-blue-600 mx-auto mb-2 animate-spin" />
                    <p className="text-gray-600 text-sm">Caricamento...</p>
                  </>
                ) : (
                  <>
                    <FileText className="w-10 h-10 text-blue-600 mx-auto mb-2" />
                    <p className="text-gray-900 font-medium">
                      Clicca per caricare
                    </p>
                    <p className="text-gray-500 text-sm">o trascina qui</p>
                  </>
                )}
              </div>
            </label>
          </div>

          {/* URL Input with Crawl Mode */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-green-400 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <LinkIcon className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold">🌐 Aggiungi Sito Web</h3>
            </div>
            
            {/* Crawl Mode Toggle */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Modalità Scansione</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCrawlMode('single')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    crawlMode === 'single'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📄 Singola Pagina
                </button>
                <button
                  onClick={() => setCrawlMode('full')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    crawlMode === 'full'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🕸️ Intero Sito
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {crawlMode === 'full' 
                  ? '🚀 Esplora automaticamente tutte le pagine del sito'
                  : '📝 Estrae solo la pagina specificata'}
              </p>
            </div>

            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
              disabled={addingUrl}
            />
            
            {(crawlProgress || crawlPercentage > 0) && (
              <div className="mb-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="text-sm font-semibold text-blue-900">
                      {crawlStatus || crawlProgress}
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">
                    {crawlPercentage}%
                  </span>
                </div>
                {/* Real progress bar with percentage */}
                <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                    style={{width: `${crawlPercentage}%`}}
                  >
                    {crawlPercentage > 10 && (
                      <span className="text-xs font-bold text-white drop-shadow">
                        {crawlPercentage}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-blue-700">
                    {crawlPercentage < 30 ? '🔍 Crawling pages...' :
                     crawlPercentage < 90 ? '⚙️ Processing documents...' :
                     crawlPercentage < 100 ? '✨ Finalizing...' :
                     '✅ Complete!'}
                  </p>
                  <p className="text-xs text-blue-600 font-medium">
                    I documenti appariranno sotto ↓
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={onAddUrl}
              disabled={!url || addingUrl}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {addingUrl ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {crawlMode === 'full' ? 'Scansione in corso...' : 'Aggiungendo...'}
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  {crawlMode === 'full' ? 'Scansiona Sito' : 'Aggiungi URL'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sources List */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              📚 Documenti Caricati ({sources.length})
            </h3>
            {sources.some(s => s.status === 'processing' || s.status === 'pending') && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Elaborazione in corso...</span>
              </div>
            )}
          </div>

          {sources.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">
                Nessun documento ancora
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Carica almeno 1 documento per addestrare il chatbot
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors bg-white"
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
                          <span className="text-sm text-green-600 font-medium">
                            ✓ {source.chunkCount} chunks
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
                    {getStatusIcon(source.status)}
                    <button
                      onClick={() => onDelete(source.id)}
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

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t mt-6">
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Indietro
          </button>
          <button
            onClick={onNext}
            disabled={sources.length === 0}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
          >
            Continua al Test
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Zap className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-purple-900 mb-1">
              🕸️ Crawler Intelligente
            </h3>
            <p className="text-sm text-purple-800">
              Con la modalità &quot;Intero Sito&quot;, il sistema esplorerà automaticamente tutte le pagine collegate,
              estraendo contenuti di qualità e creando una knowledge base completa. Può esplorare fino a 50 pagine
              con un massimo di 4 livelli di profondità.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 3: Test
// ============================================================================
export function TestStep({
  botId,
  onBack
}: {
  botId: string
  onBack: () => void
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          🎉 Setup Completato!
        </h2>
        <p className="text-gray-600 text-lg mb-8">
          Il tuo chatbot è pronto. Ora puoi testarlo e vedere come risponde.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <a
            href={`/chat/${botId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-xl hover:shadow-lg transition-all"
          >
            <MessageSquare className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Prova il Chatbot</h3>
            <p className="text-sm text-gray-600">
              Testa le risposte con domande reali
            </p>
          </a>

          <a
            href={`/chatbot/${botId}/setup`}
            className="block p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl hover:shadow-lg transition-all"
          >
            <Brain className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Modifica Setup</h3>
            <p className="text-sm text-gray-600">
              Aggiungi documenti o cambia impostazioni
            </p>
          </a>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna Indietro
          </button>
          <a
            href="/dashboard"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Vai alla Dashboard
          </a>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3 text-lg">
          🚀 Prossimi Passi
        </h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Testa il chatbot con domande tipiche dei tuoi utenti</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Aggiungi più documenti per migliorare le risposte</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Monitora le conversazioni per vedere cosa chiedono gli utenti</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Integra il chatbot nel tuo sito web</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
