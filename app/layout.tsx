import type { Metadata } from 'next'
import '@fontsource-variable/inter'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'LitX AI · AI Agent Studio',
    template: '%s · LitX AI',
  },
  description: 'Workspace privato per creare, testare e pubblicare AI Agent per i tuoi clienti.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body>
        {children}
      </body>
    </html>
  )
}
