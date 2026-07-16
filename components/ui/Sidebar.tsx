'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

export interface SidebarLinkProps {
  href: string
  icon: LucideIcon
  label: string
  badge?: string | number
  exact?: boolean
}

export function SidebarLink({
  href,
  icon: Icon,
  label,
  badge,
  exact = false,
}: SidebarLinkProps) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={clsx(
        'sidebar-link',
        isActive && 'sidebar-link-active'
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="badge badge-gray">
          {badge}
        </span>
      )}
    </Link>
  )
}

export interface SidebarSectionProps {
  title?: string
  children: React.ReactNode
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="space-y-1">
      {title && (
        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

export interface SidebarProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
}

export function Sidebar({ children, header, footer }: SidebarProps) {
  return (
    <aside className="hidden w-[232px] flex-shrink-0 bg-white border-r border-[#ecebf1] lg:flex flex-col h-screen sticky top-0">
      {header && (
        <div className="px-5 py-5 border-b border-[#f0eff4]">
          {header}
        </div>
      )}
      
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {children}
      </nav>
      
      {footer && (
        <div className="p-4 border-t border-gray-200">
          {footer}
        </div>
      )}
    </aside>
  )
}
