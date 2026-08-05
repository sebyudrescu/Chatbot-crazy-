'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bot, LayoutDashboard, Plus } from 'lucide-react'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  
  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path)
  }
  
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link 
            href="/" 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Chatbot RAG</h1>
              <p className="text-xs text-gray-500">Gestisci i tuoi agenti</p>
            </div>
          </Link>
          
          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <Link
              href="/chatbots"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
                isActive('/chatbots') || isActive('/chatbot') || isActive('/chat')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">I Miei Chatbot</span>
            </Link>
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
                isActive('/dashboard')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </Link>
            
            <Link
              href="/chatbots"
              onClick={async (e) => {
                e.preventDefault()
                // Crea un nuovo chatbot e poi reindirizza
                try {
                  const res = await fetch('/api/chatbots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      companyName: 'Nuovo Agente',
                      systemPrompt: 'Sei un assistente virtuale professionale e cordiale.' 
                    }),
                  })
                  
                  if (res.ok) {
                    const data = await res.json()
                    const newBotId = data.data.id
                    
                    // Vai alla pagina setup del nuovo chatbot
                    router.push(`/chatbot/${newBotId}/setup`)
                  } else {
                    alert('Errore nella creazione del chatbot')
                  }
                } catch (error) {
                  console.error('Error creating chatbot:', error)
                  alert('Errore nella creazione del chatbot')
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuovo Agente</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
