'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import AthleteClassificaPage from './ClassificaInner'

// Wrapper con Suspense per gestire useSearchParams
export default function ClassificaClient() {
  const params = useSearchParams()
  return <AthleteClassificaPage params={params} />
}
