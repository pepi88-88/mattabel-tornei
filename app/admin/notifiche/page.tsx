import { notFound } from 'next/navigation'
import { isSuperAdmin } from '../../../lib/superadmin-session'
import Notifications from './Notifications'
export const dynamic = 'force-dynamic'
export default function Page() {
  if (!isSuperAdmin()) notFound()
  return <Notifications />
}
