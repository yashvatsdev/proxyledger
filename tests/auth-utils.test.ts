import { describe, expect, it } from 'vitest'
import { authErrorMessage, isAuthConfigured, safeAuthRedirect, userInitials } from '../lib/auth-utils'

describe('safe authentication redirects', () => {
  const origin = 'https://ledger.example'
  it('allows the dashboard, homepage sign-out and same-origin callbacks', () => {
    expect(safeAuthRedirect('/dashboard', origin)).toBe(`${origin}/dashboard`)
    expect(safeAuthRedirect('/', origin)).toBe(`${origin}/`)
    expect(safeAuthRedirect(`${origin}/dashboard?tab=overview`, origin)).toBe(`${origin}/dashboard?tab=overview`)
  })
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'https://ledger.example.evil.example', 'https://user:password@ledger.example', '/login', '/api/auth/signin', 'http://ledger.example'])('rejects unsafe or looping redirect %s', (url) => {
    expect(safeAuthRedirect(url, origin)).toBe(`${origin}/dashboard`)
  })
})

it('requires all credentials and a sufficiently long secret without exposing them', () => {
  expect(isAuthConfigured({})).toBe(false)
  expect(isAuthConfigured({ AUTH_SECRET: 'short', AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 'secret' })).toBe(false)
  expect(isAuthConfigured({ AUTH_SECRET: 'x'.repeat(32), AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 'secret' })).toBe(true)
})

it('maps untrusted error codes to safe feedback', () => {
  expect(authErrorMessage()).toBeNull()
  expect(authErrorMessage('OAuthAccountNotLinked')).toContain('original account')
  expect(authErrorMessage('AccessDenied')).toContain('not completed')
  expect(authErrorMessage('Configuration')).toContain('not available')
  expect(authErrorMessage('<script>secret-token</script>')).not.toContain('secret-token')
})

it('builds profile initials from names, email or a fallback', () => {
  expect(userInitials({ name: '  Alex Morgan  ', email: null, image: null })).toBe('AM')
  expect(userInitials({ name: 'Yash', email: null, image: null })).toBe('YA')
  expect(userInitials({ name: null, email: 'sam@example.com', image: null })).toBe('SA')
  expect(userInitials({ name: null, email: null, image: null })).toBe('US')
})
