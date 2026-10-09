import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(), configured: vi.fn() }))
vi.mock('../auth', () => ({ auth: mocks.auth }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('../lib/auth-utils', () => ({ isAuthConfigured: mocks.configured }))
import { requireUser, getSession } from '../lib/auth-session'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.configured.mockReturnValue(true)
  mocks.redirect.mockImplementation(() => { throw new Error('redirect') })
})

it('redirects anonymous requests on the server', async () => {
  mocks.auth.mockResolvedValue(null)
  await expect(requireUser()).rejects.toThrow('redirect')
  expect(mocks.redirect).toHaveBeenCalledWith('/login')
})

it('rejects sessions without a verified actor ID', async () => {
  mocks.auth.mockResolvedValue({ user: { email: 'test@example.com' } })
  await expect(requireUser()).rejects.toThrow('redirect')
})

it('returns the database session user for authorization', async () => {
  const user = { id: 'verified-user', name: 'Test User' }
  mocks.auth.mockResolvedValue({ user })
  expect(await requireUser()).toEqual(user)
  expect(mocks.redirect).not.toHaveBeenCalled()
})

it('keeps the login page available before OAuth setup', async () => {
  mocks.configured.mockReturnValue(false)
  expect(await getSession()).toBeNull()
  expect(mocks.auth).not.toHaveBeenCalled()
})
