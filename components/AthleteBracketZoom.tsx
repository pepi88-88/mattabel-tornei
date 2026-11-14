'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const clamp = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100))
const distance = (touches: TouchList) => Math.hypot(
  touches[0].clientX - touches[1].clientX,
  touches[0].clientY - touches[1].clientY,
)

export default function AthleteBracketZoom({
  children, storageId,
}: {
  children: React.ReactNode
  storageId: string
}) {
  const [zoom, setZoom] = useState(1)
  const currentZoom = useRef(1)
  const surface = useRef<HTMLDivElement>(null)
  const pinch = useRef<{distance: number; zoom: number} | null>(null)

  const updateZoom = useCallback((value: number) => {
    const next = clamp(value)
    currentZoom.current = next
    setZoom(next)
  }, [])

  // Restore the viewer's preference when returning to the same bracket.
  useEffect(() => {
    pinch.current = null
    let previous = 1
    try {
      const saved = Number(sessionStorage.getItem('athlete-bracket-zoom:' + storageId))
      if (Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM) previous = saved
    } catch {}
    updateZoom(previous)
  }, [storageId, updateZoom])

  useEffect(() => {
    try { sessionStorage.setItem('athlete-bracket-zoom:' + storageId, String(zoom)) } catch {}
  }, [storageId, zoom])

  useEffect(() => {
    const element = surface.current
    if (!element) return

    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinch.current = null
        return
      }
      pinch.current = { distance: distance(event.touches), zoom: currentZoom.current }
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      if (!pinch.current) {
        pinch.current = { distance: distance(event.touches), zoom: currentZoom.current }
        return
      }
      // Prevent only the native two-finger page zoom: one-finger scroll
      // remains available for navigating large bracket boards.
      if (event.cancelable) event.preventDefault()
      const ratio = distance(event.touches) / Math.max(1, pinch.current.distance)
      updateZoom(pinch.current.zoom * ratio)
    }
    const end = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch.current = null
      // Zoom deliberately NOT reset: the selected factor is retained.
    }

    element.addEventListener('touchstart', start, { passive: true })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', end, { passive: true })
    element.addEventListener('touchcancel', end, { passive: true })
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', end)
    }
  }, [updateZoom])

  const fitToScreen = () => {
    const wrapper = surface.current
    if (!wrapper) return
    const board = wrapper.querySelector<HTMLElement>('.mt-bracket-board-inner')
      || wrapper.querySelector<HTMLElement>('.bracket-scope')
    if (!board) {
      updateZoom(1)
      return
    }
    const available = wrapper.clientWidth
    const contentWidth = board.getBoundingClientRect().width / currentZoom.current
    if (available > 0 && contentWidth > 0) updateZoom(Math.min(1, available / contentWidth * 0.97))
  }

  return <section className="mt-athlete-zoom-panel" aria-label="Zoom del tabellone">
    <div className="mt-athlete-zoom-toolbar" role="group" aria-label="Controlli zoom">
      <span className="mt-athlete-zoom-help">Allarga o riduci con due dita</span>
      <button type="button" className="btn btn-sm" onClick={() => updateZoom(currentZoom.current - .1)}
        disabled={zoom <= MIN_ZOOM} aria-label="Riduci zoom tabellone">−</button>
      <output aria-live="off" className="mt-athlete-zoom-percent">{Math.round(zoom * 100)}%</output>
      <button type="button" className="btn btn-sm" onClick={() => updateZoom(currentZoom.current + .1)}
        disabled={zoom >= MAX_ZOOM} aria-label="Aumenta zoom tabellone">+</button>
      <button type="button" className="btn btn-sm" onClick={fitToScreen}
        title="Riduci quanto basta per vedere la larghezza completa del tabellone">Adatta</button>
      <button type="button" className="btn btn-sm" onClick={() => updateZoom(1)}
        title="Ripristina dimensioni originali">100%</button>
    </div>
    <div className="mt-athlete-zoom-surface" ref={surface}>
      <div className="mt-athlete-zoom-content" style={{ zoom }}>
        {children}
      </div>
    </div>
  </section>
}
