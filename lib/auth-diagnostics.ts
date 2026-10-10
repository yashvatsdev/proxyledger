import 'server-only'
import type { Adapter } from 'next-auth/adapters'

const authTypes = new Set(['AuthError', 'AdapterError', 'CallbackRouteError', 'OAuthCallbackError', 'OAuthSignInError', 'OAuthProfileParseError', 'OAuthAccountNotLinked', 'AccessDenied', 'InvalidCheck', 'MissingSecret', 'UntrustedHost', 'InvalidProvider', 'InvalidEndpoints', 'MissingAdapter', 'MissingAdapterMethods', 'SessionTokenError', 'JWTSessionError', 'SignOutError', 'MissingCSRF', 'InvalidCallbackUrl', 'Configuration'])
const codes = new Set(['P1000', 'P1001', 'P1002', 'P1003', 'P1010', 'P1011', 'P1017', 'P2000', 'P2002', 'P2003', 'P2021', 'P2022', 'P2024', 'P2025', 'P2034', '28P01', '28000', '42501', '42P01', '42703', '23502', '23503', '23505', '53300', '57P03', '40001', '40P01', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'OAUTH_RESPONSE_BODY_ERROR', 'OAUTH_OPERATION_PROCESSING_ERROR', 'OAUTH_INVALID_RESPONSE', 'OAUTH_JWT_CLAIM_COMPARISON_FAILED', 'invalid_client', 'invalid_grant', 'invalid_request', 'unauthorized_client', 'access_denied'])
codes.add('P2028') // Transaction acquisition/expiration failures; never log the raw message.
const names = new Set(['Error', 'TypeError', 'AggregateError', 'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientValidationError', 'DriverAdapterError', 'ResponseBodyError', 'OperationProcessingError'])
const driverKinds = new Set(['TlsConnectionError', 'AuthenticationFailed', 'TooManyConnections', 'ConnectionClosed', 'DatabaseDoesNotExist', 'TableDoesNotExist', 'ColumnNotFound', 'UniqueConstraintViolation', 'ForeignKeyConstraintViolation'])
const operations = new Set(['createUser', 'getUser', 'getUserByEmail', 'getUserByAccount', 'getAccount', 'updateUser', 'linkAccount', 'getSessionAndUser', 'createSession', 'updateSession', 'deleteSession', 'createVerificationToken', 'useVerificationToken'])
const failedOperations = new WeakMap<object, string>()

// Preserve the original exception and API contract; never retain adapter inputs.
export function diagnosticAdapter<T extends Adapter>(adapter: T): T {
  return new Proxy(adapter, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || !operations.has(property) || typeof method !== 'function') return method
      return async (...args: unknown[]) => {
        try { return await Reflect.apply(method, target, args) }
        catch (error) {
          if (error && typeof error === 'object') failedOperations.set(error, property)
          throw error
        }
      }
    },
  })
}

function field(value: object, key: string): unknown {
  // Avoid executing custom getters on arbitrary errors or serializing objects.
  try { return Object.getOwnPropertyDescriptor(value, key)?.value }
  catch { return undefined }
}

export function authFailureSummary(error: unknown, stage?: 'configuration' | 'database-probe') {
  const queue: unknown[] = [error]
  const seen = new Set<object>()
  const causes: { category: string; code?: string }[] = []
  let operation: string | undefined
  let authType = 'Unknown'
  for (let visited = 0; queue.length && visited < 24; visited++) {
    const value = queue.shift()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    operation ??= failedOperations.get(value)
    const type = field(value, 'type')
    const name = field(value, 'name')
    const kind = field(value, 'kind')
    const code = [field(value, 'code'), field(value, 'originalCode'), field(value, 'error')].find(item => typeof item === 'string' && codes.has(item)) as string | undefined
    const category = typeof type === 'string' && authTypes.has(type) ? type : typeof name === 'string' && names.has(name) ? name : typeof kind === 'string' && driverKinds.has(kind) ? kind : 'Unknown'
    if (authType === 'Unknown' && typeof type === 'string' && authTypes.has(type)) authType = type
    if (category !== 'Unknown' || code) causes.push({ category, ...(code ? { code } : {}) })
    // Auth.js cause.err; Prisma adapter meta/driver cause; native fetch/TLS cause.
    for (const key of ['cause', 'err', 'meta', 'driverAdapterError']) queue.push(field(value, key))
    const aggregate = field(value, 'errors')
    if (Array.isArray(aggregate)) queue.push(...aggregate.slice(0, 4))
  }
  return { event: 'authentication-failed', authType, stage: stage ?? (operation ? 'adapter' : 'auth-handler'), ...(operation ? { operation } : {}), causes }
}

export function reportAuthFailure(error: unknown, stage?: 'configuration' | 'database-probe') {
  console.error('[auth] Authentication request failed', authFailureSummary(error, stage))
}

export const authLogger = {
  error: reportAuthFailure,
  warn(code: string) {
    const allowed = ['debug-enabled', 'env-url-basepath-redundant', 'experimental-webauthn']
    console.warn('[auth] Authentication configuration warning', { event: 'authentication-warning', code: allowed.includes(code) ? code : 'unknown' })
  },
  debug() {}, // Auth.js debug payloads contain adapter arguments and OAuth data.
}
