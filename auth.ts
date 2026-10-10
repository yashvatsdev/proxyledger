import 'server-only'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { getPrisma } from '@/lib/db'
import { safeAuthRedirect } from '@/lib/auth-utils'

// Lazy initialization keeps secret/database configuration out of static builds.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(getPrisma()),
  providers: [Google],
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    redirect: ({ url, baseUrl }) => safeAuthRedirect(url, baseUrl),
    session({ session, user }) {
      // Explicit allowlist: adapter session tokens must never reach /api/auth/session.
      return {
        expires: session.expires,
        user: { id: user.id, name: user.name, email: user.email, image: user.image },
      }
    },
  },
  // Never log OAuth payloads, provider tokens, database URLs, or user details.
  logger: {
    error() { console.error('[auth] Authentication request failed') },
    warn() { console.warn('[auth] Authentication configuration warning') },
    debug() {},
  },
}))
