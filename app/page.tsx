'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function Home() {
 const router=useRouter()
 function goAthlete() {
  try {localStorage.setItem('role','athlete')} catch {}
  router.replace('/atleta/tornei')
 }
 function goStaff(){router.replace('/login-staff')}
 return <main className="mt-access-screen">
  <div className="mt-access-aura" aria-hidden="true" />
  <section className="mt-access-card" aria-label="Benvenuto Mattabel">
   <div className="mt-access-logo">
    <Image src="/logo-mattabel.png" width={245} height={245} alt="Mattabel Beach Volley, logo con tartaruga e scritta circolare" priority/>
   </div>
   <h1>Benvenuto</h1>
   <p>Scegli il tuo accesso</p>
   <div className="mt-access-choices">
    <button type="button" className="mt-access-athlete" onClick={goAthlete}>
     <span aria-hidden="true" className="mt-access-choice-icon">🏐</span><span>Atleta</span>
    </button>
    <button type="button" className="mt-access-staff" onClick={goStaff}>
     <span aria-hidden="true" className="mt-access-choice-icon">▣</span><span>Staff</span>
    </button>
   </div>
  </section>
 </main>
}
