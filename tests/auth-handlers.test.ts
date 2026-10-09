import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ session: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } }))
vi.mock('../lib/db', () => ({ getPrisma: () => db }))
import { handlers } from '../auth'
import { NextRequest } from 'next/server'

const origin = 'https://ledger.example'
const token = 'opaque-test-session-token'
const sessionCookie = `__Secure-authjs.session-token=${token}`
const user = { id: 'user-1', name: 'Test User', email: 'test@example.com', emailVerified: null, image: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('AUTH_SECRET', 'test-only-secret-with-at-least-32-characters')
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-client')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-secret')
  vi.stubEnv('AUTH_URL', origin)
  vi.stubEnv('AUTH_TRUST_HOST', 'true')
})
afterEach(() => vi.unstubAllEnvs())

function request(path: string, cookie = '') {
  return new NextRequest(`${origin}/api/auth/${path}`, { headers: { cookie } })
}

it('loads a database session across requests, exposes the actor ID but no provider tokens', async () => {
  db.session.findUnique.mockResolvedValue({ user, userId: user.id, sessionToken: token, expires: new Date(Date.now() + 30 * 86400000) })
  for (let i = 0; i < 2; i++) {
    const response = await handlers.GET(request('session', sessionCookie))
    const data = await response.json()
    expect(data.user).toEqual({ id: user.id, name: user.name, email: user.email, image: user.image })
    expect(JSON.stringify(data)).not.toContain(token)
    expect(response.headers.get('cache-control')).toContain('no-store')
  }
  expect(db.session.findUnique).toHaveBeenCalledTimes(2)
  expect(db.session.findUnique).toHaveBeenCalledWith({ where: { sessionToken: token }, include: { user: true } })
})

it('rejects expired sessions and removes them from the database', async () => {
  db.session.findUnique.mockResolvedValue({ user, userId: user.id, sessionToken: token, expires: new Date(Date.now() - 1000) })
  const response = await handlers.GET(request('session', sessionCookie))
  expect(await response.json()).toBeNull()
  expect(db.session.delete).toHaveBeenCalledWith({ where: { sessionToken: token } })
})

it('rejects missing or revoked database sessions', async () => {
  db.session.findUnique.mockResolvedValue(null)
  expect(await (await handlers.GET(request('session', sessionCookie))).json()).toBeNull()
  expect(await (await handlers.GET(request('session'))).json()).toBeNull()
})

it('requires CSRF validation for sign-out POSTs', async () => {
  const response = await handlers.POST(new NextRequest(`${origin}/api/auth/signout`, {
    method: 'POST', headers: { cookie: sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'callbackUrl=/',
  }))
  expect(db.session.delete).not.toHaveBeenCalled()
  expect(response.headers.get('location')).toContain('MissingCSRF')
})

it('deletes the session, clears the secure cookie and redirects home after a CSRF-validated sign-out', async () => {
  const csrfResponse = await handlers.GET(request('csrf'))
  const { csrfToken } = await csrfResponse.json()
  const csrfCookies = csrfResponse.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
  const response = await handlers.POST(new NextRequest(`${origin}/api/auth/signout`, {
    method: 'POST',
    headers: { cookie: `${sessionCookie}; ${csrfCookies}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, callbackUrl: '/' }),
  }))
  expect(db.session.delete).toHaveBeenCalledWith({ where: { sessionToken: token } })
  expect(response.headers.get('location')).toBe(`${origin}/`)
  const cleared = response.headers.getSetCookie().find((cookie) => cookie.startsWith('__Secure-authjs.session-token='))
  expect(cleared).toContain('Max-Age=0')
  expect(cleared).toContain('HttpOnly')
  expect(cleared).toContain('Secure')
  expect(cleared).toContain('SameSite=Lax')
})
