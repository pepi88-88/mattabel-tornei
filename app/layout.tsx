import './globals.css'
import type { Metadata, Viewport } from 'next'
import AppHeader from '../components/AppHeader'

export const metadata: Metadata = {
  title: 'Mattabel Beach Volley — Admin',
}

// 👇 AGGIUNGI QUESTO BLOCCO
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 0.5,     // <-- permette lo zoom OUT sotto 1
  maximumScale: 5,       // opzionale
  userScalable: true,    // <-- abilita pinch-zoom
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="app-admin bg-neutral-950 text-neutral-100">
        <AppHeader />
        <main className="container-admin mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
          {children}
        </main>
      </body>
      // dentro <html lang="it"> … </html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=0.5, maximum-scale=6, user-scalable=yes" />
  <script dangerouslySetInnerHTML={{
    __html: `
      (function(){
        var m = document.querySelector('meta[name=viewport]');
        console.log('VIEWPORT META:', m && m.getAttribute('content'));
      })();
    `
  }} />
</head>

    </html>
  )
}
