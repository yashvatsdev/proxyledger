'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'

const friends = [
  { name: 'Rahul Sharma', initial: 'R', detail: 'You owe 2', balance: -2 },
  { name: 'Aryan Mehta', initial: 'A', detail: 'Owes you 4', balance: 4 },
  { name: 'Karan Singh', initial: 'K', detail: 'All settled', balance: 0 },
  { name: 'Neha Patel', initial: 'N', detail: 'Owes you 2', balance: 2 },
]

const activity = [
  { person: 'Rahul covered a favor for you', subject: 'DBMS', time: 'Today, 11:42 AM', amount: '-1', negative: true, initial: 'R' },
  { person: 'You covered a favor for Aryan', subject: 'Mathematics', time: 'Yesterday, 4:20 PM', amount: '+1', negative: false, initial: 'A' },
  { person: 'Karan confirmed your favor', subject: 'Java', time: 'Mon, 9:12 AM', amount: '0', negative: false, initial: 'K' },
]

export default function Page() {
  const [active, setActive] = useState('Overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  }, [])

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Friends', icon: Users },
    { label: 'Transactions', icon: ArrowUpRight },
    { label: 'Subjects', icon: BookOpen },
    { label: 'Notifications', icon: Bell, count: 2 },
  ]

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><ArrowRight aria-hidden="true" /></div>
          <div><strong>proxyledger</strong><span>your favor network</span></div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {nav.map(({ label, icon: Icon, count }) => (
            <motion.button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => setActive(label)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
              <Icon aria-hidden="true" /> <span>{label}</span>{count ? <b>{count}</b> : null}{active === label && <motion.i className="nav-active-indicator" layoutId="nav-active-indicator" />}
            </motion.button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setActive('Settings')}><Settings aria-hidden="true" /><span>Settings</span></button>
          <button className="profile-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
            <div className="avatar avatar-small">A</div><span><strong>Alex Morgan</strong><small>@alexm</small></span><ChevronDown aria-hidden="true" />
          </button>
          {menuOpen && <div className="profile-menu"><button onClick={() => setToast(true)}>Profile settings</button><button onClick={() => setToast(true)}>Sign out</button></div>}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><ArrowRight /></div><strong>proxyledger</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Search" onClick={() => setSearchOpen(!searchOpen)}><Search /></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell /><i /></button>
            <div className="avatar avatar-small">A</div>
            <button className="button primary top-action" onClick={() => setToast(true)}><Plus aria-hidden="true" /> Record a favor</button>
            <button className="mobile-menu" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><Menu /></button>
          </div>
        </header>
        {searchOpen && <div className="search-popover"><Search /><input autoFocus placeholder="Search your circle..." /><kbd>esc</kbd></div>}
        <AnimatePresence>{mobileMenuOpen && <motion.div className="mobile-dashboard-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{nav.slice(0, 4).map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setMobileMenuOpen(false) }}><Icon />{label}</button>)}</motion.div>}</AnimatePresence>

        <div className="page-content">
          <div className="eyebrow">YOUR NETWORK OVERVIEW <span className="live-pill"><i /> Live ledger</span></div>
          <div className="hero-row"><div><h1>{greeting}, Alex.</h1><p>Here&apos;s where things stand with your circle.</p></div><time>Wednesday, October 9, 2026</time></div>

          <motion.section className="stats-grid" aria-label="Ledger summary" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } }}>
            <StatCard label="You owe" value="03" description="Outstanding favors" tone="negative" />
            <StatCard label="Owed to you" value="07" description="Friends owe you" tone="positive" />
            <StatCard label="Active friends" value="08" description="In your circle" />
            <StatCard label="Total exchanges" value="24" description="Confirmed favors" />
          </motion.section>

          <div className="dashboard-grid">
            <section className="panel circle-panel"><div className="section-heading"><div><h2>Your circle</h2><p>Stay on top of favors across your network.</p></div><button className="text-button" onClick={() => setActive('Friends')}>View all <ArrowUpRight /></button></div>
              <div className="friend-list">{friends.map((friend) => <motion.button className="friend-row" key={friend.name} onClick={() => setToast(true)} whileHover={{ x: 4 }} whileTap={{ scale: 0.99 }}><div className="avatar">{friend.initial}</div><span className="friend-info"><strong>{friend.name}</strong><small>{friend.detail}</small></span><strong className={`balance ${friend.balance > 0 ? 'positive' : friend.balance < 0 ? 'negative' : 'neutral'}`}>{friend.balance > 0 ? '+' : ''}{friend.balance || '0'}</strong><ArrowRight className="row-arrow" /></motion.button>)}</div>
              <button className="button primary full-button" onClick={() => setToast(true)}><Plus /> Record a favor</button>
            </section>
            <section className="panel activity-panel"><div className="section-heading"><div><h2>Recent activity</h2><p>The latest from your ledger.</p></div><button className="icon-button small" aria-label="Activity help"><CircleHelp /></button></div>
              <div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.person}><div className="avatar avatar-tiny">{item.initial}</div><div className="activity-copy"><strong>{item.person}</strong><span>{item.subject} <em>·</em> {item.time}</span></div><div className={`activity-amount ${item.negative ? 'negative' : 'positive'}`}>{item.amount}</div></div>)}</div>
              <button className="text-button activity-link" onClick={() => setActive('Transactions')}>View all activity <ArrowRight /></button>
            </section>
          </div>
          <section className="pending-strip"><div className="pending-icon"><Bell /></div><div><strong>2 favors need your attention</strong><span>Review pending confirmations to keep your ledger accurate.</span></div><button className="button outline" onClick={() => { setToast(true); }}>Review requests <ArrowRight /></button></section>
        </div>
      </section>
      <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.22 }}><div className="toast-check"><Check /></div><span><strong>Everything is up to date</strong><small>Your ledger action was saved locally.</small></span><button aria-label="Dismiss" onClick={() => setToast(false)}><X /></button></motion.div>}</AnimatePresence>
    </main>
  )
}

function StatCard({ label, value, description, tone = '' }: { label: string; value: string; description: string; tone?: string }) {
  return <motion.article className="stat-card" variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } } }}><span>{label}</span><strong className={tone}>{value}</strong><small>{description}</small></motion.article>
}
