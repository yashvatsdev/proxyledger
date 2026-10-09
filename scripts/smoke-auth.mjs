const origin = process.env.SMOKE_ORIGIN || 'http://localhost:3100'
const sessionResponse = await fetch(`${origin}/api/auth/session`)
if (sessionResponse.status !== 200 || await sessionResponse.json() !== null) {
  console.error('Anonymous session endpoint failed. Check production Auth.js host configuration.')
  process.exitCode = 1
} else console.log('/api/auth/session: 200 (anonymous)')
const cases = [['/', 200], ['/login', 200], ['/dashboard', 307], ['/dashboard/friends', 307], ['/dashboard/friends/test', 307], ['/dashboard/notifications', 307], ['/dashboard/transactions', 307], ['/dashboard/transactions/test', 307], ['/dashboard/subjects', 307], ['/dashboard/balances', 307], ['/dashboard/balances/test', 307], ['/dashboard/settlements', 307], ['/dashboard/settlements/test', 307]]
for (const [path, status] of cases) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' })
  const location = response.headers.get('location')
  console.log(`${path}: ${response.status}${location ? ` -> ${location}` : ''}`)
  if (response.status !== status || (path.startsWith('/dashboard') && location !== '/login')) process.exitCode = 1
  if (path === '/login') {
    const html = await response.text()
    if (!html.includes('Continue with Google') || !html.includes('Back to homepage')) process.exitCode = 1
  }
}
