import { afterEach, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

afterEach(() => vi.unstubAllEnvs())
async function headers(environment: string) {
  vi.stubEnv('NODE_ENV', environment)
  const config = (await import(pathToFileURL(resolve('next.config.mjs')).href)).default
  return (await config.headers())[0]
}
it('protects every route from framing, MIME sniffing and unsafe document bases', async () => {
  const result = await headers('production')
  expect(result.source).toBe('/:path*')
  const values = Object.fromEntries(result.headers.map((header: { key: string; value: string }) => [header.key, header.value]))
  expect(values['X-Content-Type-Options']).toBe('nosniff')
  expect(values['X-Frame-Options']).toBe('DENY')
  expect(values['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  expect(values['Content-Security-Policy']).toContain("base-uri 'self'")
  expect(values['Content-Security-Policy']).toContain("object-src 'none'")
  expect(values['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  expect(values['Strict-Transport-Security']).toBe('max-age=31536000')
})
it('does not set HSTS in local development', async () => {
  expect((await headers('development')).headers.some((header: { key: string }) => header.key === 'Strict-Transport-Security')).toBe(false)
})
