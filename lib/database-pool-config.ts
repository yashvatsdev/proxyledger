import 'server-only'
import { X509Certificate } from 'node:crypto'

export function databasePoolConfig(connectionString: string, serverless = process.env.VERCEL === '1', certificate = process.env.DATABASE_SSL_CA) {
  const url = new URL(connectionString)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  let ca: string | undefined
  if (!local) {
    // pg parses URL SSL options after object options. Remove ambiguous modes
    // and require full verification; keep explicitly supplied CA/cert paths.
    const mode = url.searchParams.get('sslmode')
    if (mode === 'disable' || mode === 'no-verify' || url.searchParams.get('ssl') === 'false' || url.searchParams.get('ssl') === '0') {
      throw new Error('Remote database connections require verified TLS')
    }
    url.searchParams.delete('ssl')
    url.searchParams.delete('uselibpqcompat')
    url.searchParams.set('sslmode', 'verify-full')
    if (certificate) {
      if (certificate.length > 65536 || ['sslrootcert', 'sslcert', 'sslkey'].some(key => url.searchParams.has(key))) {
        throw new Error('Invalid or conflicting database CA configuration')
      }
      ca = certificate.replace(/\\n/g, '\n').trim()
      const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
      try {
        if (!certificates?.length || certificates.join('\n').replace(/\s/g, '') !== ca.replace(/\s/g, '') || certificates.some(pem => !new X509Certificate(pem).ca)) throw new Error()
      } catch { throw new Error('Invalid database CA certificate') }
      // pg's connection-string SSL options replace the object SSL options.
      // Keep CA + verification in one object so the CA is not discarded.
      url.searchParams.delete('sslmode')
    }
  }
  return {
    connectionString: url.href,
    ...(!local ? { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } } : {}),
    max: serverless ? 1 : 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }
}
