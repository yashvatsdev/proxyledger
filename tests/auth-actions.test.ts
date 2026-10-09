import { beforeEach, expect, it, vi } from 'vitest'
import { AuthError } from 'next-auth'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), configured: vi.fn() }))
vi.mock('../auth', () => ({ signIn: mocks.signIn, signOut: mocks.signOut }))
vi.mock('../lib/auth-utils', async (original) => ({ ...await original<object>(), isAuthConfigured: mocks.configured }))
import { loginWithGoogle, logout } from '../app/login/actions'

beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true) })

it('uses Google with a fixed dashboard destination', async () => {
  await loginWithGoogle()
  expect(mocks.signIn).toHaveBeenCalledWith('google', { redirectTo: '/dashboard' })
})

it('shows useful setup feedback when credentials are unavailable', async () => {
  mocks.configured.mockReturnValue(false)
  expect((await loginWithGoogle())?.error).toContain('not available')
  expect(mocks.signIn).not.toHaveBeenCalled()
})

it('sanitizes provider failures without returning token details', async () => {
  mocks.signIn.mockRejectedValue(new AuthError('private-provider-token'))
  const result = await loginWithGoogle()
  expect(result?.error).toContain('try again')
  expect(result?.error).not.toContain('private-provider-token')
})

it('invalidates the session through Auth.js and redirects home', async () => {
  await logout()
  expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: '/' })
})

it('provides retry feedback when sign-out fails', async () => {
  mocks.signOut.mockRejectedValue(new AuthError('private-database-error'))
  expect((await logout())?.error).toContain('try again')
})

it('preserves Next.js redirect exceptions for both actions', async () => {
  const redirect = new Error('NEXT_REDIRECT')
  mocks.signIn.mockRejectedValue(redirect)
  mocks.signOut.mockRejectedValue(redirect)
  await expect(loginWithGoogle()).rejects.toBe(redirect)
  await expect(logout()).rejects.toBe(redirect)
})
