export const dashboardNavigation = [
  { label: 'Overview', href: '/dashboard', icon: 'overview' },
  { label: 'Friends', href: '/dashboard/friends', icon: 'friends' },
  { label: 'Balances', href: '/dashboard/balances', icon: 'balances' },
  { label: 'Transactions', href: '/dashboard/transactions', icon: 'transactions' },
  { label: 'Subjects', href: '/dashboard/subjects', icon: 'subjects' },
  { label: 'Notifications', href: '/dashboard/notifications', icon: 'notifications' },
] as const

export function activeDashboardRoute(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  if (href === '/dashboard/balances' && (pathname === '/dashboard/settlements' || pathname.startsWith('/dashboard/settlements/'))) return true
  return pathname === href || pathname.startsWith(`${href}/`)
}
