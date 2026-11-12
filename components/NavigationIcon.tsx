import * as React from 'react'

export type NavigationIconName =
  | 'tour' | 'players' | 'registrations' | 'groups' | 'bracket'
  | 'results' | 'ranking' | 'broadcast' | 'waiting' | 'payments'
  | 'print' | 'logout'

/** Lightweight inline icons: zero extra JS libraries or image downloads. */
export default function NavigationIcon({ name, size = 16 }: { name: NavigationIconName; size?: number }) {
  const paths: Record<NavigationIconName, React.ReactNode> = {
    tour: <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v5m-4 3h8m-8-3h8"/></>,
    players: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2.5a5.5 5.5 0 0 1 11 0V20H3.5Z"/><path d="M17 5a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4v2"/></>,
    registrations: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5v-2h6v2M9 10h6m-6 4h6m-6 4h4"/></>,
    groups: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    bracket: <><path d="M3 5h5v5H3zM3 15h5v5H3zM16 9h5v6h-5zM8 7.5h4v4h4M8 17.5h4v-4h4"/></>,
    results: <><path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/></>,
    ranking: <><path d="M4 20V12h4v8M10 20V5h4v15M16 20v-9h4v9M2 20h20"/></>,
    broadcast: <><circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.36 6.36 0 0 0 0 9m9-9a6.36 6.36 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15m15-15a10.6 10.6 0 0 1 0 15"/></>,
    waiting: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></>,
    payments: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20M6 15h5"/></>,
    print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 15h12v6H6zM18 12h.01"/></>,
    logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M15 17l5-5-5-5M20 12H9"/></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'inline-block' }}>{paths[name]}</svg>
}
