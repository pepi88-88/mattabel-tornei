import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mattabel Tornei',
    short_name: 'Mattabel Tornei',
    description: 'Tornei beach volley Mattabel: gironi, tabelloni, risultati e classifiche.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#071526',
    theme_color: '#0b2542',
    orientation: 'any',
    lang: 'it',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
