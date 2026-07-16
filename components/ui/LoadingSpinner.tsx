import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  fullPage?: boolean
}

export function LoadingSpinner({
  size = 'md',
  text,
  fullPage = false,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={clsx(sizeClasses[size], 'animate-spin text-brand-600')} />
      {text && <p className="text-sm text-gray-600">{text}</p>}
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    )
  }

  return content
}
