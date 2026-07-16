'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [showCreateModal, setShowCreateModal] = useState(false)
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

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#ecebf1] bg-white/95 px-4 backdrop-blur lg:px-7">
          <GlobalSearch />
          <div className="ml-4 flex items-center gap-2">
            <NotificationCenter />
            <Button size="sm" onClick={() => setShowCreateModal(true)} icon={<Plus className="h-4 w-4" />}>Nuovo Agente</Button>
            <div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-gray-950 text-xs font-semibold text-white">SU</div>
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
