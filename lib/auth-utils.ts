export function isAuthConfigured(source: Record<string, string | undefined> = process.env) {
  return Boolean(source.AUTH_SECRET && source.AUTH_SECRET.length >= 32 && source.AUTH_GOOGLE_ID && source.AUTH_GOOGLE_SECRET)
}

// Only same-origin destinations are allowed, including callbacks supplied to Auth.js directly.
export function safeAuthRedirect(url: string, baseUrl: string) {
  const fallback = new URL('/dashboard', baseUrl).href
  try {
    const destination = new URL(url, baseUrl)
    if (destination.origin !== new URL(baseUrl).origin || destination.username || destination.password) return fallback
    if (destination.pathname === '/login' || destination.pathname.startsWith('/api/auth')) return fallback
    return destination.href
  } catch {
    return fallback
  }
}

export function authErrorMessage(error?: string) {
  if (!error) return null
  if (error === 'OAuthAccountNotLinked') return 'This email is already linked to another sign-in method. Use the original account to continue.'
  if (error === 'AccessDenied') return 'Google sign-in was not completed. Please try again.'
  if (error === 'Configuration') return 'Google sign-in is not available right now. Please try again later.'
  return 'We couldn’t sign you in with Google. Please try again.'
}

export type UserProfile = { name: string | null; email: string | null; image: string | null }

export function userInitials(user: UserProfile) {
  const parts = (user.name?.trim() || user.email?.split('@')[0] || 'User').split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}
