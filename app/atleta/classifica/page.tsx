import { Suspense } from 'react'
import ClassificaClient from './ClassificaClient'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Caricamento classifica…</div>}>
      <ClassificaClient />
    </Suspense>
  )
}
