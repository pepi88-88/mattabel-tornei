import './globals.css'
import type { Metadata } from 'next'
import AppHeader from '../components/AppHeader'

export const metadata: Metadata = {
  title: 'Mattabel Beach Volley — Admin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      {/* 👇 classe per regole globali admin */}
      <body className="app-admin bg-neutral-950 text-neutral-100">
        <AppHeader />

        {/* container centrale + aria dall’alto */}
        <main className="container-admin mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
          {children}
        </main>
      </body>
    </html>
  )
}
