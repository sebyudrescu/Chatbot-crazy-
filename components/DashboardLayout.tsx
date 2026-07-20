'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  Database,
  FlaskConical,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Activity,
  Workflow as WorkflowIcon,
  Users,
  ShieldCheck,
  Plug,
  Radio,
  LayoutTemplate,
  Zap,
  Lightbulb,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { Sidebar, SidebarLink, SidebarSection } from './ui/Sidebar'
import { Button } from './ui/Button'
import { GlobalSearch } from './GlobalSearch'
import { NotificationCenter } from './NotificationCenter'
import { AgentCreationWizard } from './AgentCreationWizard'

export interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeCreateWizard = useCallback(() => setShowCreateModal(false), [])
  const completeCreateWizard = useCallback((agentId: string) => {
    setShowCreateModal(false)
    router.push(`/chatbot/${agentId}/onboarding`)
    router.refresh()
  }, [router])
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  useEffect(() => {
    const handleOpen = () => setShowCreateModal(true)
    window.addEventListener('open-create-modal', handleOpen)
    return () => window.removeEventListener('open-create-modal', handleOpen)
  }, [])

  useEffect(() => {
    setMobileNavigationOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileNavigationOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileNavigationOpen])

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  const ownerFooter = (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-950 text-[10px] font-semibold text-white">SU</div>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-900">Sebastian U.</p><p className="text-[10px] text-gray-400">Amministratore</p></div>
      <button onClick={logout} aria-label="Esci dall’area proprietario" title="Esci" className="rounded-lg p-2 text-gray-400 transition hover:bg-white hover:text-red-600"><LogOut className="h-4 w-4" /></button>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#f8f8fb]">
      <Sidebar
        header={
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-200">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-950">LitX <span className="text-brand-600">AI</span></h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400">Agent Studio</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-950 text-[10px] font-semibold text-white">SU</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-900">Sebastian U.</p><p className="text-[10px] text-gray-400">Amministratore</p></div>
            <button onClick={logout} aria-label="Esci dall’area proprietario" title="Esci" className="rounded-lg p-2 text-gray-400 transition hover:bg-white hover:text-red-600"><LogOut className="h-4 w-4" /></button>
          </div>
        }
      >
        <SidebarSection>
          <SidebarLink href="/dashboard" icon={BarChart3} label="Overview" exact />
          <SidebarLink href="/chatbots" icon={Bot} label="AI Agents" />
          <SidebarLink href="/templates" icon={LayoutTemplate} label="Templates" />
          <SidebarLink href="/knowledge" icon={Database} label="Data Sources" />
          <SidebarLink href="/testing" icon={FlaskConical} label="Testing" />
          <SidebarLink href="/evaluations" icon={ShieldCheck} label="Evaluations" />
          <SidebarLink href="/workflow" icon={WorkflowIcon} label="Workflow" />
          <SidebarLink href="/actions" icon={Zap} label="Actions" />
          <SidebarLink href="/conversations" icon={MessageSquare} label="Chat Logs" />
          <SidebarLink href="/contacts" icon={Users} label="Contacts (CRM)" />
          <SidebarLink href="/analytics" icon={BarChart3} label="Analytics" />
          <SidebarLink href="/suggestions" icon={Lightbulb} label="AI Suggestions" />
          <SidebarLink href="/integrations" icon={Plug} label="Integrations" />
          <SidebarLink href="/channels" icon={Radio} label="Channels" />
          <SidebarLink href="/dashboard/traces" icon={Activity} label="Decision Traces" />
        </SidebarSection>
        <SidebarSection title="Operazioni">
          <SidebarLink href="/settings" icon={Settings} label="Settings" />
        </SidebarSection>
      </Sidebar>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Chiudi menu di navigazione" className="absolute inset-0 bg-gray-950/45 backdrop-blur-sm" onClick={closeMobileNavigation} />
          <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigazione principale" className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-200"><Sparkles className="h-5 w-5 text-white" /></div>
                <div><p className="text-lg font-bold tracking-tight text-gray-950">LitX <span className="text-brand-600">AI</span></p><p className="text-[10px] font-medium uppercase tracking-widest text-gray-400">Agent Studio</p></div>
              </div>
              <button ref={closeButtonRef} type="button" onClick={closeMobileNavigation} aria-label="Chiudi navigazione" className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4"><MobileNavigation onNavigate={closeMobileNavigation} /></nav>
            <div className="border-t border-gray-200 p-4">{ownerFooter}</div>
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#ecebf1] bg-white/95 px-4 backdrop-blur lg:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileNavigationOpen(true)}
              aria-label="Apri navigazione"
              aria-controls="mobile-navigation"
              aria-expanded={mobileNavigationOpen}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-2 lg:ml-4">
            <NotificationCenter />
            <Button size="sm" onClick={() => setShowCreateModal(true)} aria-label="Nuovo agente" icon={<Plus className="h-4 w-4" />}><span className="hidden md:inline">Nuovo Agente</span></Button>
            <div className="ml-1 hidden h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-gray-950 text-xs font-semibold text-white sm:flex">SU</div>
          </div>
        </header>
        <div className="min-h-[calc(100vh-4rem)]">{children}</div>
      </main>

      <AgentCreationWizard
        open={showCreateModal}
        onClose={closeCreateWizard}
        onCreated={completeCreateWizard}
      />
    </div>
  )
}

function MobileNavigation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <SidebarSection>
        <SidebarLink href="/dashboard" icon={BarChart3} label="Overview" exact onClick={onNavigate} />
        <SidebarLink href="/chatbots" icon={Bot} label="AI Agents" onClick={onNavigate} />
        <SidebarLink href="/templates" icon={LayoutTemplate} label="Templates" onClick={onNavigate} />
        <SidebarLink href="/knowledge" icon={Database} label="Data Sources" onClick={onNavigate} />
        <SidebarLink href="/testing" icon={FlaskConical} label="Testing" onClick={onNavigate} />
        <SidebarLink href="/evaluations" icon={ShieldCheck} label="Evaluations" onClick={onNavigate} />
        <SidebarLink href="/workflow" icon={WorkflowIcon} label="Workflow" onClick={onNavigate} />
        <SidebarLink href="/actions" icon={Zap} label="Actions" onClick={onNavigate} />
        <SidebarLink href="/conversations" icon={MessageSquare} label="Chat Logs" onClick={onNavigate} />
        <SidebarLink href="/contacts" icon={Users} label="Contacts (CRM)" onClick={onNavigate} />
        <SidebarLink href="/analytics" icon={BarChart3} label="Analytics" onClick={onNavigate} />
        <SidebarLink href="/suggestions" icon={Lightbulb} label="AI Suggestions" onClick={onNavigate} />
        <SidebarLink href="/integrations" icon={Plug} label="Integrations" onClick={onNavigate} />
        <SidebarLink href="/channels" icon={Radio} label="Channels" onClick={onNavigate} />
        <SidebarLink href="/dashboard/traces" icon={Activity} label="Decision Traces" onClick={onNavigate} />
      </SidebarSection>
      <SidebarSection title="Operazioni">
        <SidebarLink href="/settings" icon={Settings} label="Settings" onClick={onNavigate} />
      </SidebarSection>
    </>
  )
}
