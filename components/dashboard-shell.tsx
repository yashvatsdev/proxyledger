'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ArrowRight, ArrowUpRight, Bell, BookOpen, ChevronDown, LayoutDashboard, Menu, Scale, Settings, Users } from 'lucide-react'
import UserAvatar from './user-avatar'
import SignOutButton from './sign-out-button'
import CircleRefresh from './circle-refresh'
import CircleDialog from './circle-dialog'
import RecordFavor from './record-favor'
import WorkspaceSearch from './workspace-search'
import { activeDashboardRoute, dashboardNavigation } from '@/lib/navigation'
import type { UserProfile } from '@/lib/auth-utils'

const MotionLink = motion.create(Link)
const icons = { overview: LayoutDashboard, friends: Users, balances: Scale, transactions: ArrowUpRight, subjects: BookOpen, notifications: Bell }

export default function DashboardShell({ user, unread, children }: { user: UserProfile; unread: number; children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(pathname)
  const mobileOpen = mobileMenuOpen && menuPath === pathname
  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <a className="dashboard-skip-link" href="#dashboard-content">Skip to main content</a>
    <CircleRefresh />
    <aside className="sidebar">
      <Link className="brand-row" href="/dashboard" aria-label="Proxy Ledger overview"><div className="brand-mark"><ArrowRight aria-hidden="true" /></div><div><strong>proxyledger</strong><span>your favor network</span></div></Link>
      <nav className="nav-list" aria-label="Main navigation"><p className="nav-label">Workspace</p>{dashboardNavigation.map(({ label, icon, href }) => {
        const Icon = icons[icon]
        const active = activeDashboardRoute(pathname, href)
        return <MotionLink key={label} href={href} whileHover={{ x: 2 }} whileTap={{ scale: .98 }} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><Icon aria-hidden="true" /><span>{label}</span>{icon === 'notifications' && unread > 0 && <b aria-label={`${unread} unread`}>{unread}</b>}{active && <motion.i className="nav-active-indicator" layoutId="nav-active-indicator" />}</MotionLink>
      })}</nav>
      <div className="sidebar-bottom"><Link className={`nav-item ${activeDashboardRoute(pathname, '/dashboard/settings') ? 'active' : ''}`} href="/dashboard/settings" aria-current={activeDashboardRoute(pathname, '/dashboard/settings') ? 'page' : undefined}><Settings aria-hidden="true" /><span>Settings</span></Link><AccountDisclosure user={user} /></div>
    </aside>
    <section className="content"><header className="topbar"><Link className="mobile-brand" href="/dashboard" aria-label="Proxy Ledger overview"><div className="brand-mark"><ArrowRight aria-hidden="true" /></div><strong>proxyledger</strong></Link><div className="topbar-actions"><WorkspaceSearch /><Link className="icon-button notification-button" href="/dashboard/notifications" aria-label={`Notifications, ${unread} unread`}><Bell aria-hidden="true" />{unread > 0 && <i />}</Link><UserAvatar user={user} /><RecordFavor className="button primary top-action" /><button type="button" className="mobile-menu" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={() => { setMenuPath(pathname); setMobileMenuOpen(true) }}><Menu aria-hidden="true" /></button></div></header>
      <CircleDialog open={mobileOpen} onClose={() => setMobileMenuOpen(false)} title="Your workspace" description="Navigate your circle, favors and shared balances."><nav className="mobile-workspace-nav" aria-label="Mobile navigation">{dashboardNavigation.map(({ label, icon, href }) => { const Icon = icons[icon]; const active = activeDashboardRoute(pathname, href); return <Link key={label} href={href} aria-current={active ? 'page' : undefined} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}><Icon aria-hidden="true" />{label}{icon === 'notifications' && unread > 0 && <b>{unread}</b>}</Link> })}<Link className="nav-item" href="/dashboard/settings" aria-current={pathname === '/dashboard/settings' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}><Settings aria-hidden="true" />Settings</Link></nav><div className="mobile-auth-profile"><strong>{user.name || 'Your account'}</strong><small>{user.email}</small><SignOutButton /></div></CircleDialog>
      <main id="dashboard-content" tabIndex={-1}>{children}</main>
    </section>
  </div></MotionConfig>
}

function AccountDisclosure({ user }: { user: UserProfile }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const [openedPath, setOpenedPath] = useState(pathname)
  const visible = open && openedPath === pathname
  useEffect(() => {
    if (!visible) return
    const dismiss = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss) }
  }, [visible])
  return <div ref={root} onKeyDown={event => { if (event.key === 'Escape' && visible) { event.preventDefault(); setOpen(false); trigger.current?.focus() } }}>
    <button ref={trigger} type="button" className="profile-button" aria-label="Open account menu" aria-expanded={visible} aria-controls={id} onClick={() => { setOpenedPath(pathname); setOpen(!visible) }}><UserAvatar user={user} /><span><strong>{user.name || 'Your account'}</strong><small title={user.email || undefined}>{user.email}</small></span><ChevronDown aria-hidden="true" /></button>
    <AnimatePresence>{visible && <motion.div id={id} className="profile-menu" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: .12 }}><Link href="/dashboard/settings" onClick={() => setOpen(false)}>Profile & account</Link><SignOutButton /></motion.div>}</AnimatePresence>
  </div>
}
