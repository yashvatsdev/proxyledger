import { afterEach, expect, it, vi } from 'vitest'
import { authFailureSummary, authLogger, diagnosticAdapter } from '../lib/auth-diagnostics'

afterEach(() => vi.restoreAllMocks())

it('preserves a bounded Auth.js/Prisma driver cause chain without payloads', () => {
  const secret = 'email@example.invalid access_token=private code=private postgres://private'
  const error = { type: 'AdapterError', message: secret, stack: secret, cause: { err: { name: 'PrismaClientKnownRequestError', code: 'P1011', message: secret, meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { kind: 'TlsConnectionError', reason: secret } } } }, provider: secret } }
  const summary = authFailureSummary(error)
  expect(summary.authType).toBe('AdapterError')
  expect(summary.causes).toContainEqual({ category: 'PrismaClientKnownRequestError', code: 'P1011' })
  expect(summary.causes).toContainEqual({ category: 'TlsConnectionError' })
  expect(JSON.stringify(summary)).not.toContain(secret)
  expect(JSON.stringify(summary)).not.toContain('reason')
})
it('distinguishes OAuth client rejection and native TLS codes without raw response bodies', () => {
  expect(authFailureSummary({ type: 'CallbackRouteError', cause: { err: { name: 'ResponseBodyError', code: 'OAUTH_RESPONSE_BODY_ERROR', cause: { error: 'invalid_client', error_description: 'secret' } } } }).causes).toContainEqual({ category: 'Unknown', code: 'invalid_client' })
  expect(authFailureSummary({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }).causes).toContainEqual({ category: 'Unknown', code: 'SELF_SIGNED_CERT_IN_CHAIN' })
  expect(authFailureSummary({ name: 'PrismaClientKnownRequestError', code: 'P2028', message: 'private transaction details' }).causes).toContainEqual({ category: 'PrismaClientKnownRequestError', code: 'P2028' })
})
it('records the failed adapter stage, rethrows the same error and preserves successful results', async () => {
  const failure = Object.assign(new Error('private session token'), { code: 'P2002' })
  const adapter = diagnosticAdapter({ createSession: vi.fn().mockRejectedValue(failure), getUser: vi.fn().mockResolvedValue({ id: 'private-id' }) })
  await expect(adapter.createSession!({ sessionToken: 'private', userId: 'private', expires: new Date() })).rejects.toBe(failure)
  expect(authFailureSummary({ type: 'AdapterError', cause: { err: failure } })).toMatchObject({ stage: 'adapter', operation: 'createSession' })
  expect(await adapter.getUser!('private-id')).toEqual({ id: 'private-id' })
})
it('ignores arbitrary codes/names, cycles and throwing getters', () => {
  const error: Record<string, unknown> = { name: 'personal-name', code: 'private-token', type: 'email@example.invalid' }
  error.cause = error
  Object.defineProperty(error, 'meta', { get() { throw new Error('do not call getters') } })
  expect(authFailureSummary(error)).toEqual({ event: 'authentication-failed', authType: 'Unknown', stage: 'auth-handler', causes: [] })
})
it('logs only structured allowlisted summaries and never enables debug data', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  authLogger.error(Object.assign(new Error('authorization-code=secret'), { type: 'InvalidCheck' }))
  authLogger.warn('private-token')
  authLogger.debug()
  expect(spy).toHaveBeenCalledWith('[auth] Authentication request failed', expect.objectContaining({ authType: 'InvalidCheck' }))
  expect(JSON.stringify([spy.mock.calls, warn.mock.calls])).not.toContain('secret')
  expect(warn.mock.calls[0][1]).toEqual({ event: 'authentication-warning', code: 'unknown' })
})
