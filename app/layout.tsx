import './globals.css'
import type { Metadata, Viewport } from 'next'
import AppHeader from '../components/AppHeader'
import OfflineBootstrap from '../components/OfflineBootstrap'

export const metadata: Metadata = {
  title: 'Mattabel Tornei',
  description: 'Gironi, tabelloni, risultati e classifiche dei tornei beach volley Mattabel.',
  applicationName: 'Mattabel Tornei',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Mattabel Tornei', statusBarStyle: 'black-translucent' },
  icons: { apple: [{ url: '/logo-mattabel.png' }], icon: [{ url: '/logo-mattabel.png' }] },
}

// ✅ niente blocchi allo zoom qui
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" data-mattabel-theme="blu">
      <body className="app-admin bg-neutral-950 text-neutral-100">
        <OfflineBootstrap />
        <AppHeader />
        <main className="container-admin mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
          {children}
        </main>
      </body>
    </html>
  )
}
