'use client'
import type {ReactNode} from 'react'
export default function PrepareOffline({statusBadge}:{tournamentId:string;tourId?:string;statusBadge?:ReactNode}){
 return statusBadge?<div className="flex justify-end">{statusBadge}</div>:null
}
