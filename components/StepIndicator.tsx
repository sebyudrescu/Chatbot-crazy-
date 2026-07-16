/**
 * Step Indicator Component
 * Visual indicator for wizard steps
 */

import { CheckCircle } from 'lucide-react'

export interface StepIndicatorProps {
  number: number
  label: string
  active: boolean
  completed: boolean
  onClick?: () => void
}

export function StepIndicator({ 
  number, 
  label, 
  active, 
  completed,
  onClick 
}: StepIndicatorProps) {
  return (
    <div 
      className={`flex flex-col items-center cursor-pointer ${onClick ? 'hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      {/* Circle */}
      <div 
        className={`
          w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
          transition-all duration-200
          ${completed 
            ? 'bg-green-500 text-white' 
            : active 
            ? 'bg-blue-600 text-white ring-4 ring-blue-200' 
            : 'bg-gray-200 text-gray-500'
          }
        `}
      >
        {completed ? (
          <CheckCircle className="w-6 h-6" />
        ) : (
          number
        )}
      </div>
      
      {/* Label */}
      <p 
        className={`
          mt-2 text-sm font-medium text-center
          ${active ? 'text-blue-600' : completed ? 'text-green-600' : 'text-gray-500'}
        `}
      >
        {label}
      </p>
      
      {/* Optional status text */}
      {completed && !active && (
        <p className="text-xs text-green-600 mt-1">✓ Completato</p>
      )}
      {active && (
        <p className="text-xs text-blue-600 mt-1">In corso...</p>
      )}
    </div>
  )
}

/**
 * Step Progress Line
 * Line connector between steps
 */
export function StepProgressLine({ completed }: { completed: boolean }) {
  return (
    <div 
      className={`
        flex-1 h-1 rounded mx-2 transition-all duration-300
        ${completed ? 'bg-green-500' : 'bg-gray-300'}
      `}
    />
  )
}
