'use client'

interface CTA {
  id: string
  type: 'button' | 'link' | 'form' | 'banner'
  label: string
  action: string
  variant?: 'primary' | 'secondary' | 'success' | 'info'
  icon?: string
  metadata?: Record<string, any>
}

interface ContextualCTAProps {
  ctas: CTA[]
  onCTAClick?: (cta: CTA) => void
}

/**
 * Contextual CTA Component
 * Shows contextual call-to-action buttons and banners
 */
export default function ContextualCTA({ ctas, onCTAClick }: ContextualCTAProps) {
  if (!ctas || ctas.length === 0) return null

  const getVariantStyles = (variant?: string) => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
      case 'secondary':
        return 'bg-gray-200 text-gray-800 hover:bg-gray-300 border-gray-300'
      case 'success':
        return 'bg-green-600 text-white hover:bg-green-700 border-green-600'
      case 'info':
        return 'bg-cyan-600 text-white hover:bg-cyan-700 border-cyan-600'
      default:
        return 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
    }
  }

  const handleClick = (cta: CTA) => {
    if (onCTAClick) {
      onCTAClick(cta)
    } else {
      // Default behavior: navigate to action URL
      if (cta.type === 'link' || cta.type === 'button') {
        window.open(cta.action, '_blank')
      }
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {ctas.map((cta) => {
        if (cta.type === 'banner') {
          return (
            <div
              key={cta.id}
              className={`p-3 rounded-lg border cursor-pointer transition ${getVariantStyles(
                cta.variant
              )}`}
              onClick={() => handleClick(cta)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{cta.label}</span>
                <span className="text-xl">→</span>
              </div>
            </div>
          )
        }

        return (
          <button
            key={cta.id}
            onClick={() => handleClick(cta)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition inline-flex items-center space-x-2 ${getVariantStyles(
              cta.variant
            )}`}
          >
            {cta.icon && <span>{cta.icon}</span>}
            <span>{cta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
