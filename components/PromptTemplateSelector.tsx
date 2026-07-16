'use client'

import { useState, useEffect } from 'react'
import { 
  Sparkles, 
  Wrench, 
  DollarSign, 
  Target, 
  BookOpen, 
  GraduationCap, 
  Code,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit
} from 'lucide-react'

interface PromptTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  systemPrompt: string
  placeholders?: string[] | string // Can be array or string from API
}

interface PromptTemplateSelectorProps {
  selectedTemplateId?: string | null
  customPrompt?: string | null
  promptVariables?: Record<string, string> | null
  companyName: string
  onTemplateChange: (templateId: string | null) => void
  onCustomPromptChange: (prompt: string | null) => void
  onVariablesChange: (variables: Record<string, string>) => void
  disabled?: boolean
}

const iconMap: Record<string, any> = {
  '🛠️': Wrench,
  '💼': DollarSign,
  '🎯': Target,
  '📚': BookOpen,
  '🎓': GraduationCap,
  '🔧': Code,
  '✨': Sparkles,
}

const categoryColors: Record<string, string> = {
  support: 'bg-blue-100 text-blue-800 border-blue-300',
  sales: 'bg-green-100 text-green-800 border-green-300',
  consulting: 'bg-purple-100 text-purple-800 border-purple-300',
  informative: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  educational: 'bg-pink-100 text-pink-800 border-pink-300',
  technical: 'bg-gray-100 text-gray-800 border-gray-300',
  custom: 'bg-orange-100 text-orange-800 border-orange-300',
}

export default function PromptTemplateSelector({
  selectedTemplateId,
  customPrompt,
  promptVariables = {},
  companyName,
  onTemplateChange,
  onCustomPromptChange,
  onVariablesChange,
  disabled = false,
}: PromptTemplateSelectorProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'template' | 'custom'>(
    customPrompt ? 'custom' : 'template'
  )
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPrompt, setPreviewPrompt] = useState('')
  const [variables, setVariables] = useState<Record<string, string>>(
    promptVariables || { COMPANY_NAME: companyName }
  )

  useEffect(() => {
    fetchTemplates()
  }, [])

  useEffect(() => {
    // Update company name in variables when it changes
    setVariables(prev => ({
      ...prev,
      COMPANY_NAME: companyName,
    }))
  }, [companyName])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/prompt-templates')
      const data = await response.json()
      if (data.success) {
        setTemplates(data.data.templates)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    if (disabled) return
    
    const newTemplateId = selectedTemplateId === templateId ? null : templateId
    onTemplateChange(newTemplateId)
    
    if (newTemplateId) {
      const template = templates.find(t => t.id === newTemplateId)
      if (template?.placeholders) {
        // Initialize variables for template
        const newVars: Record<string, string> = { COMPANY_NAME: companyName }
        
        // Handle placeholders as array or string (fix for API response)
        const placeholdersArray = Array.isArray(template.placeholders) 
          ? template.placeholders 
          : [template.placeholders]
        
        placeholdersArray.forEach(ph => {
          if (ph && ph !== 'COMPANY_NAME' && !variables[ph]) {
            newVars[ph] = ''
          }
        })
        setVariables(newVars)
        onVariablesChange(newVars)
      }
    }
  }

  const handleModeChange = (newMode: 'template' | 'custom') => {
    if (disabled) return
    
    setMode(newMode)
    if (newMode === 'custom') {
      onTemplateChange(null)
    } else {
      onCustomPromptChange(null)
    }
  }

  const handleVariableChange = (key: string, value: string) => {
    const newVariables = { ...variables, [key]: value }
    setVariables(newVariables)
    onVariablesChange(newVariables)
  }

  const handlePreview = async () => {
    if (mode === 'custom') {
      setPreviewPrompt(customPrompt || '')
      setShowPreview(true)
      return
    }

    if (!selectedTemplateId) {
      alert('Seleziona un template prima di visualizzare l\'anteprima')
      return
    }

    try {
      const response = await fetch('/api/prompt-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          variables,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setPreviewPrompt(data.data.filledPrompt)
        setShowPreview(true)
      }
    } catch (error) {
      console.error('Error previewing template:', error)
    }
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Configurazione System Prompt
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleModeChange('template')}
            disabled={disabled}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
              mode === 'template'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Sparkles className="w-5 h-5 inline-block mr-2" />
            Usa Template Predefinito
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('custom')}
            disabled={disabled}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
              mode === 'custom'
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Edit className="w-5 h-5 inline-block mr-2" />
            Prompt Personalizzato
          </button>
        </div>
      </div>

      {/* Template Selection */}
      {mode === 'template' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {templates.map((template) => {
              const IconComponent = iconMap[template.icon] || Sparkles
              const isSelected = selectedTemplateId === template.id
              const isExpanded = expandedTemplate === template.id

              return (
                <div
                  key={template.id}
                  className={`border-2 rounded-lg transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  } ${disabled ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => handleTemplateSelect(template.id)}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className={`p-2 rounded-lg ${categoryColors[template.category]}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900">{template.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${categoryColors[template.category]}`}>
                            {template.category}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                        {template.placeholders && template.placeholders.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {Array.isArray(template.placeholders) && template.placeholders.map((ph: string) => (
                              <span key={ph} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {ph}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Nascondi' : 'Mostra'} anteprima ${template.name}`}
                      className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-200 mt-2 pt-3">
                      <p className="text-xs text-gray-500 mb-2">Anteprima template:</p>
                      <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-40 overflow-y-auto">
                        {template.systemPrompt.substring(0, 500)}...
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Variables Form */}
          {selectedTemplate?.placeholders && selectedTemplate.placeholders.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Variabili Template</h4>
              <div className="space-y-3">
                {Array.isArray(selectedTemplate.placeholders) && selectedTemplate.placeholders.map((placeholder: string) => (
                  <div key={placeholder}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {placeholder.replace(/_/g, ' ')}
                    </label>
                    <input
                      type="text"
                      value={variables[placeholder] || ''}
                      onChange={(e) => handleVariableChange(placeholder, e.target.value)}
                      placeholder={`Inserisci ${placeholder.toLowerCase()}`}
                      disabled={disabled || placeholder === 'COMPANY_NAME'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Prompt */}
      {mode === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Prompt Personalizzato
          </label>
          <textarea
            value={customPrompt || ''}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            disabled={disabled}
            placeholder="Scrivi qui il tuo system prompt personalizzato..."
            rows={12}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-2">
            Il prompt personalizzato sostituirà completamente il template predefinito.
          </p>
        </div>
      )}

      {/* Preview Button */}
      <button
        type="button"
        onClick={handlePreview}
        disabled={disabled || (mode === 'template' && !selectedTemplateId) || (mode === 'custom' && !customPrompt)}
        className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Eye className="w-4 h-4" />
        Anteprima Prompt Finale
      </button>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Anteprima System Prompt</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <pre className="text-sm bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap font-mono">
                {previewPrompt}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
