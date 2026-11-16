import {NextResponse} from 'next/server'

// Una versione distinta per ogni deploy Vercel, senza dipendere dalla cache
// dell'app o dal Service Worker. Funziona anche tramite il dominio ufficiale.
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(){
  const version=process.env.VERCEL_GIT_COMMIT_SHA
    ||process.env.VERCEL_URL
    ||process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    ||'local-development'
  return NextResponse.json({version},{
    headers:{
      'Cache-Control':'private, no-store, no-cache, must-revalidate',
      'Pragma':'no-cache'
    }
  })
}
