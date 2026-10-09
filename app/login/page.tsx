import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-session'
import { authErrorMessage } from '@/lib/auth-utils'
import LoginCard from './login-card'

export const metadata: Metadata = { title: 'Sign in | Proxy Ledger' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const session = await getSession()
  if (session?.user?.id) redirect('/dashboard')
  const { error } = await searchParams
  return <LoginCard initialError={authErrorMessage(typeof error === 'string' ? error : undefined)} />
}
