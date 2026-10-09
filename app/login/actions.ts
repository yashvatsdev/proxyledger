'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { authErrorMessage, isAuthConfigured } from '@/lib/auth-utils'

export async function loginWithGoogle(): Promise<{ error: string } | null> {
  if (!isAuthConfigured()) return { error: authErrorMessage('Configuration')! }
  try {
    // Fixed destination: no client-provided callback or actor ID.
    await signIn('google', { redirectTo: '/dashboard' })
    return null
  } catch (error) {
    if (error instanceof AuthError) return { error: authErrorMessage(error.type)! }
    throw error // Preserve Next.js redirect control flow.
  }
}

export async function logout(): Promise<{ error: string } | null> {
  try {
    await signOut({ redirectTo: '/' })
    return null
  } catch (error) {
    if (error instanceof AuthError) return { error: 'We couldn’t sign you out. Please try again.' }
    throw error
  }
}
