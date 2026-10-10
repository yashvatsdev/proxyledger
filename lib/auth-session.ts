import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isAuthConfigured } from '@/lib/auth-utils'
import { timeOperation } from './performance-timing'

// Request-scoped cache only. Database-backed sessions are rechecked on each request.
export const getSession = cache(async () => isAuthConfigured() ? timeOperation('authentication', () => auth()) : null)

// Use this within every protected page, action and future authenticated data service.
// The actor ID always comes from the verified session, never from form input.
export async function requireUser() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  return session.user
}
