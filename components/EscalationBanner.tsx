'use client'

import { useState } from 'react'

interface EscalationBannerProps {
  conversationId: string
  onEscalate?: () => void
}

/**
 * Escalation Banner Component
 * Shows option to escalate to human agent
 */
export default function EscalationBanner({ conversationId, onEscalate }: EscalationBannerProps) {
  const [isEscalating, setIsEscalating] = useState(false)
  const [isEscalated, setIsEscalated] = useState(false)

  const handleEscalate = async () => {
    setIsEscalating(true)

    try {
      const response = await fetch(`/api/conversations/${conversationId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'User requested human assistance',
        }),
      })

      if (response.ok) {
        setIsEscalated(true)
        onEscalate?.()
      }
    } catch (error) {
      console.error('Failed to escalate:', error)
    } finally {
      setIsEscalating(false)
    }
  }

  if (isEscalated) {
    return (
      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">✓</span>
          <div>
            <h4 className="font-semibold text-green-800">Richiesta inoltrata</h4>
            <p className="text-sm text-green-700 mt-1">
              Un operatore umano ti assisterà a breve. Grazie per la pazienza!
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-blue-800">Hai bisogno di assistenza personalizzata?</h4>
          <p className="text-sm text-blue-700 mt-1">
            Possiamo metterti in contatto con un operatore umano
          </p>
        </div>
        <button
          onClick={handleEscalate}
          disabled={isEscalating}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {isEscalating ? 'Inoltrando...' : 'Parla con un operatore'}
        </button>
      </div>
    </div>
  )
}
