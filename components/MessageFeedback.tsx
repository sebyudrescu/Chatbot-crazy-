'use client'

import { useState } from 'react'

interface MessageFeedbackProps {
  messageId: string
  onFeedbackSubmit?: (feedback: 'positive' | 'negative', comment?: string) => void
}

/**
 * Message Feedback Component
 * Thumbs up/down with optional comment
 */
export default function MessageFeedback({ messageId, onFeedbackSubmit }: MessageFeedbackProps) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null)
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (submitted) return

    setFeedback(type)
    
    // For negative feedback, show comment box
    if (type === 'negative') {
      setShowCommentBox(true)
      return
    }

    // For positive feedback, submit immediately
    await submitFeedback(type)
  }

  const submitFeedback = async (type: 'positive' | 'negative', feedbackComment?: string) => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch(`/api/messages/${messageId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: type,
          feedbackComment: feedbackComment || null,
        }),
      })

      if (response.ok) {
        setSubmitted(true)
        onFeedbackSubmit?.(type, feedbackComment)
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCommentSubmit = async () => {
    if (!feedback) return
    await submitFeedback(feedback, comment)
    setShowCommentBox(false)
  }

  if (submitted) {
    return (
      <div className="flex items-center space-x-2 text-sm text-green-600 mt-2">
        <span>✓</span>
        <span>Grazie per il tuo feedback!</span>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => handleFeedback('positive')}
          disabled={isSubmitting || submitted}
          className={`p-1 rounded hover:bg-gray-100 transition ${
            feedback === 'positive' ? 'text-green-600' : 'text-gray-400'
          } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Risposta utile"
        >
          👍
        </button>
        <button
          onClick={() => handleFeedback('negative')}
          disabled={isSubmitting || submitted}
          className={`p-1 rounded hover:bg-gray-100 transition ${
            feedback === 'negative' ? 'text-red-600' : 'text-gray-400'
          } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Risposta non utile"
        >
          👎
        </button>
      </div>

      {showCommentBox && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Cosa possiamo migliorare? (opzionale)"
            className="w-full p-2 border border-gray-300 rounded-md text-sm resize-none"
            rows={2}
          />
          <div className="flex space-x-2">
            <button
              onClick={handleCommentSubmit}
              disabled={isSubmitting}
              className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Invio...' : 'Invia'}
            </button>
            <button
              onClick={() => {
                setShowCommentBox(false)
                submitFeedback('negative')
              }}
              disabled={isSubmitting}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
            >
              Salta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
