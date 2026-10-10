import assert from 'node:assert/strict'

const origin = process.env.SMOKE_ORIGIN || 'http://localhost:3107'
const protectedRoutes = ['/dashboard', '/dashboard/friends', '/dashboard/friends/unrelated', '/dashboard/subjects', '/dashboard/transactions', '/dashboard/transactions/unrelated', '/dashboard/balances', '/dashboard/balances/unrelated', '/dashboard/settlements', '/dashboard/settlements/unrelated', '/dashboard/notifications', '/dashboard/settings']
const routes = ['/', '/login', '/api/auth/session', ...protectedRoutes]
const requiredHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000',
}

// Read-only, anonymous requests; no OAuth login or application mutations.
try {
  for (const path of routes) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(10000) })
    for (const [name, expected] of Object.entries(requiredHeaders)) assert.equal(response.headers.get(name), expected, `Missing security header on ${path}`)
    if (protectedRoutes.includes(path)) {
      assert.equal(response.status, 307, `Unprotected route: ${path}`)
      assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login')
    } else {
      assert.equal(response.status, 200, `Unexpected public response: ${path}`)
      if (path === '/api/auth/session') {
        assert.equal(await response.json(), null)
        assert.match(response.headers.get('cache-control') || '', /no-store/)
      }
    }
  }
  console.log(`Security smoke passed: ${routes.length} routes, ${protectedRoutes.length} anonymous redirects, all six headers and no-store anonymous session.`)
} catch {
  console.error('Security smoke failed. Check local route protection and response headers. Response contents withheld.')
  process.exitCode = 1
}
