import 'server-only'

export function databasePoolConfig(connectionString: string, serverless = process.env.VERCEL === '1') {
  const url = new URL(connectionString)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
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
  }
  return {
    connectionString: url.href,
    ...(!local ? { ssl: { rejectUnauthorized: true } } : {}),
    max: serverless ? 1 : 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }
}
