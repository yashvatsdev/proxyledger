'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CircleRefresh() {
  const router = useRouter()
  useEffect(() => {
    // Pick up the other participant's changes without interrupting an open dialog.
    const refresh = () => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) router.refresh() }
    const interval = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [router])
  return null
}
