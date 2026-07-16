import { LucideIcon } from 'lucide-react'
import { Button, ButtonProps } from './Button'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  } & Omit<ButtonProps, 'children' | 'onClick'>
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>
      )}
      
      {action && (
        <Button 
          onClick={action.onClick}
          variant={action.variant}
          size={action.size}
          disabled={action.disabled}
          className={action.className}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
