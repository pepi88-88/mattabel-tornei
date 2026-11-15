'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

type Theme = 'normale' | 'dark' | 'blu'
type Area = 'staff' | 'atleta'
const valid = (value: string | null): value is Theme =>
  value === 'normale' || value === 'dark' || value === 'blu'

/** Independent browser preferences for staff and athlete areas. No DB writes. */
export default function ThemeSwitcher({ area }: { area: Area }) {
  const pathname = usePathname()
  const [theme, setTheme] = React.useState<Theme>('blu')
  const key = 'mattabel:theme:' + area

  React.useEffect(() => {
    // One-time Mattabel Blu relaunch. After the first visit, the selected
    // theme remains the visitor's choice across future sessions.
    const launchMarker = 'mattabel:theme:blu-relaunch-2026:' + area
    let next: Theme = 'blu'
    try {
      if (localStorage.getItem(launchMarker) !== '1') {
        localStorage.setItem(key, 'blu')
        localStorage.setItem(launchMarker, '1')
      } else {
        const stored = localStorage.getItem(key)
        if (valid(stored)) next = stored
      }
    } catch {}
    setTheme(next)
    document.documentElement.dataset.mattabelTheme = next
    document.documentElement.dataset.mattabelArea = area
  }, [key, area, pathname])

  const update = (next: Theme) => {
    setTheme(next)
    document.documentElement.dataset.mattabelTheme = next
    document.documentElement.dataset.mattabelArea = area
    try { localStorage.setItem(key, next) } catch {}
  }

  return (
    <div className="mattabel-theme-picker" aria-label="Tema grafico">
      <span className="mattabel-theme-label">Tema</span>
      <select
        aria-label="Seleziona tema grafico"
        title="Seleziona tema grafico"
        value={theme}
        onChange={(event) => update(event.target.value as Theme)}
      >
        <option value="normale">Normale</option>
        <option value="dark">Dark</option>
        <option value="blu">Blu</option>
      </select>
    </div>
  )
}
