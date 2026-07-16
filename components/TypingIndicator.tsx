'use client'

/**
 * Typing Indicator Component
 * Shows animated dots when the bot is typing
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-start space-x-3 mb-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
          AI
        </div>
      </div>
      <div className="bg-gray-100 rounded-lg p-3 max-w-xs">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}
