'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '../../../lib/supabaseBrowser' 

export default function Page() {
  const [state, setState] = useState<'pending'|'ok'|'err'>('pending')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      // Legge una tabella inesistente: se l'errore è "does not exist" va comunque bene
      const { error } = await supabaseBrowser.from('tours').select('*').limit(1)
      if (!error || /does not exist/i.test(error.message)) {
        setState('ok'); setMsg('Connessione OK')
      } else {
        setState('err'); setMsg(error.message)
      }
    })()
  }, [])

  return (
    <div className="p-6">
      <div className={`font-semibold ${state==='ok' ? 'text-emerald-400' : state==='err' ? 'text-red-400' : 'text-neutral-300'}`}>
        {state==='pending' ? 'Verifico…' : msg}
      </div>
      <div className="text-xs text-neutral-400 mt-2">
        Se vedi “Connessione OK”, URL e chiavi sono configurati correttamente.
      </div>
    </div>
  )
}
