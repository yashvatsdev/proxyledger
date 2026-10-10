import { expect, it } from 'vitest'
import { activeDashboardRoute, dashboardNavigation } from '../lib/navigation'
import { activityTimestamp, calendarDate, dashboardGreeting } from '../lib/display'

it('highlights the owning section for nested records and settlement reviews', () => {
  for (const item of dashboardNavigation) {
    expect(activeDashboardRoute(item.href, item.href)).toBe(true)
    if (item.href !== '/dashboard') expect(activeDashboardRoute(`${item.href}/record`, item.href)).toBe(true)
  }
  expect(activeDashboardRoute('/dashboard/settlements/request', '/dashboard/balances')).toBe(true)
  expect(activeDashboardRoute('/dashboard/settlements', '/dashboard/balances')).toBe(true)
  expect(activeDashboardRoute('/dashboard/friends', '/dashboard')).toBe(false)
  expect(activeDashboardRoute('/dashboard/friends-else', '/dashboard/friends')).toBe(false)
  expect(activeDashboardRoute('/dashboard/settlements-else', '/dashboard/balances')).toBe(false)
})
it.each([
  ['2026-10-10T06:29:00Z', 'Good morning'],
  ['2026-10-10T06:30:00Z', 'Good afternoon'],
  ['2026-10-10T12:29:00Z', 'Good afternoon'],
  ['2026-10-10T12:30:00Z', 'Good evening'],
  ['2026-10-10T18:30:00Z', 'Good morning'],
])('uses India time at greeting boundaries for %s', (timestamp, expected) => {
  expect(dashboardGreeting(timestamp)).toBe(expected)
})
it('formats activity consistently across the India date boundary', () => {
  const timestamp = '2026-10-10T18:30:00Z'
  expect(calendarDate(timestamp)).toBe('11 Oct 2026')
  expect(activityTimestamp(timestamp)).toMatch(/11 Oct 2026.*12:00\s*am/i)
})
