'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ArrowRight, ArrowUpRight, Bell, BookOpen, ChevronDown, LayoutDashboard, Menu, Scale, Search, Settings, Users, X } from 'lucide-react'
import UserAvatar from './user-avatar'
import SignOutButton from './sign-out-button'
import AddFriend from './add-friend'
import CircleRefresh from './circle-refresh'
import RecordFavor from './record-favor'
import type { UserProfile } from '@/lib/auth-utils'
import type { CircleSummary } from '@/lib/friend-types'

const MotionLink = motion.create(Link)

export default function DashboardShell({ user, summary, children }: { user: UserProfile; summary: CircleSummary; children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState(false)
  const nav = [{ label: 'Overview', icon: LayoutDashboard, href: '/dashboard' }, { label: 'Friends', icon: Users, href: '/dashboard/friends' }, { label: 'Balances', icon: Scale, href: '/dashboard/balances' }, { label: 'Transactions', icon: ArrowUpRight, href: '/dashboard/transactions' }, { label: 'Subjects', icon: BookOpen, href: '/dashboard/subjects' }, { label: 'Notifications', icon: Bell, href: '/dashboard/notifications', count: summary.unread }]
  return <MotionConfig reducedMotion="user"><main className="app-shell">
    <CircleRefresh />
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><ArrowRight aria-hidden="true" /></div><div><strong>proxyledger</strong><span>your favor network</span></div></div>
      <nav className="nav-list" aria-label="Main navigation"><p className="nav-label">Workspace</p>{nav.map(({ label, icon: Icon, href, count }) => {
        const active = href && (href === '/dashboard' ? pathname === href : pathname.startsWith(href))
        const content = <><Icon aria-hidden="true" /><span>{label}</span>{count ? <b>{count}</b> : null}{active && <motion.i className="nav-active-indicator" layoutId="nav-active-indicator" />}</>
        return href ? <MotionLink key={label} href={href} whileHover={{ x: 2 }} whileTap={{ scale: .98 }} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>{content}</MotionLink> : <motion.button key={label} className="nav-item" onClick={() => setNotice(true)} whileHover={{ x: 2 }} whileTap={{ scale: .98 }}>{content}</motion.button>
      })}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setNotice(true)}><Settings aria-hidden="true" /><span>Settings</span></button><button className="profile-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><UserAvatar user={user} /><span><strong>{user.name || 'Your account'}</strong><small title={user.email || undefined}>{user.email}</small></span><ChevronDown aria-hidden="true" /></button>{menuOpen && <div className="profile-menu"><button onClick={() => setNotice(true)}>Profile settings</button><SignOutButton /></div>}</div>
    </aside>
    <section className="content"><header className="topbar"><div className="mobile-brand"><div className="brand-mark"><ArrowRight /></div><strong>proxyledger</strong></div><div className="topbar-actions"><button className="icon-button" aria-label="Search for friends" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search /></button><Link className="icon-button notification-button" href="/dashboard/notifications" aria-label={`Notifications, ${summary.unread} unread`}><Bell />{summary.unread > 0 && <i />}</Link><UserAvatar user={user} /><RecordFavor className="button primary top-action" /><button className="mobile-menu" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu /></button></div></header>
      {searchOpen && <div className="search-popover"><Search /><span>Find your next connection</span><AddFriend label="Search people" /></div>}
      <AnimatePresence>{mobileMenuOpen && <motion.div className="mobile-dashboard-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{nav.map(({ label, icon: Icon, href }) => href ? <Link key={label} href={href} onClick={() => setMobileMenuOpen(false)}><Icon />{label}</Link> : <button key={label} onClick={() => setNotice(true)}><Icon />{label}</button>)}<RecordFavor /><div className="mobile-auth-profile"><strong>{user.name || 'Your account'}</strong><small>{user.email}</small><SignOutButton /></div></motion.div>}</AnimatePresence>
      {children}
    </section>
    <AnimatePresence>{notice && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><span><strong>Coming in a later phase</strong><small>Your circle and favors are live now.</small></span><button aria-label="Dismiss" onClick={() => setNotice(false)}><X /></button></motion.div>}</AnimatePresence>
  </main></MotionConfig>
}

