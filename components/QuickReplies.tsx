'use client'

interface QuickReply {
  id: string
  text: string
  category?: 'faq' | 'product' | 'support' | 'general'
}

interface QuickRepliesProps {
  replies: QuickReply[]
  onReplyClick: (text: string) => void
}

/**
 * Quick Replies Component
 * Shows suggested questions/responses
 */
export default function QuickReplies({ replies, onReplyClick }: QuickRepliesProps) {
  if (!replies || replies.length === 0) return null

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'faq':
        return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
      case 'product':
        return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
      case 'support':
        return 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
    }
  }

  return (
    <div className="mb-4">
      <div className="text-xs text-gray-500 mb-2">Suggerimenti:</div>
      <div className="flex flex-wrap gap-2">
        {replies.map((reply) => (
          <button
            key={reply.id}
            onClick={() => onReplyClick(reply.text)}
            className={`px-3 py-2 rounded-full border text-sm font-medium transition-colors ${getCategoryColor(
              reply.category
            )}`}
          >
            {reply.text}
          </button>
        ))}
      </div>
    </div>
  )
}
