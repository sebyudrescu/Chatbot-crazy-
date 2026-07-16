import { HTMLAttributes } from 'react'
import { clsx } from 'clsx'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'gray'
  dot?: boolean
}

export function Badge({
  children,
  variant = 'gray',
  dot = false,
  className,
  ...props
}: BadgeProps) {
  const variantClasses = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    gray: 'badge-gray',
  }

  return (
    <span className={clsx('badge', variantClasses[variant], className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
