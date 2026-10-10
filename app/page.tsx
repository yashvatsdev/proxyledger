'use client'

import { useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, CircleAlert, Clock3, Menu, Minus, Plus, Sparkles, Users, X } from 'lucide-react'
import { AnimatedButton } from '@/components/animations'
import { createMagneticEffect, easeOut, prefersReducedMotion } from '@/lib/animations'

gsap.registerPlugin(ScrollTrigger)

const palette = ['#B8F56B', '#9AB8D5', '#FF9585']
const problems = [
  { icon: Clock3, title: 'Forgotten favors', copy: 'The little things add up quickly when nobody writes them down.' },
  { icon: CircleAlert, title: 'Awkward reminders', copy: 'Keep the conversation about the friendship, not the accounting.' },
  { icon: Users, title: 'Confusing balances', copy: 'A clear shared record makes every exchange easy to understand.' },
]
const steps = [
  { number: '01', title: 'Add your circle', copy: 'Connect with friends and keep your network organized.' },
  { number: '02', title: 'Record a favor', copy: 'Log who helped whom, with a subject and date.' },
  { number: '03', title: 'Settle naturally', copy: 'Return a favor whenever you can. Your balance updates automatically.' },
]
const features = [
  { title: 'Real-time balance overview', copy: 'See who owes whom at a glance.', className: 'feature-wide' },
  { title: 'Friend-to-friend ledger', copy: 'Every exchange stays organized.', className: '' },
  { title: 'Confirmation requests', copy: 'Both friends verify recorded favors.', className: '' },
  { title: 'Subject tracking', copy: 'Know exactly what every favor was for.', className: '' },
  { title: 'Complete activity history', copy: 'Review every confirmed exchange.', className: '' },
  { title: 'Simple settlements', copy: 'Clear balances without losing history.', className: 'feature-wide' },
]

const reveal = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } } }
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const pageRef = useRef<HTMLElement>(null)
  const { scrollY } = useScroll()

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const context = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: easeOut } })
      intro.from('.landing-nav', { opacity: 0, y: -18, duration: 0.55 })
        .from('.eyebrow-badge', { opacity: 0, y: 18, duration: 0.45 }, '-=0.2')
        .from('.hero-content h1', { opacity: 0, y: 32, duration: 0.7 }, '-=0.16')
        .from('.hero-content > p', { opacity: 0, y: 18, duration: 0.5 }, '-=0.35')
        .from('.hero-actions > *', { opacity: 0, y: 16, stagger: 0.1, duration: 0.4 }, '-=0.22')
        .from('.preview-frame', { opacity: 0, y: 70, scale: 0.94, rotateX: 5, duration: 0.85 }, '-=0.08')
      gsap.utils.toArray<HTMLElement>('.gsap-reveal').forEach((element) => {
        gsap.from(element, { opacity: 0, y: 28, duration: 0.65, ease: easeOut, scrollTrigger: { trigger: element, start: 'top 84%', once: true } })
      })
      gsap.from('.network-backdrop path', { strokeDasharray: 1200, strokeDashoffset: 1200, duration: 1.6, stagger: 0.18, ease: 'power2.out' })
      gsap.to('.network-backdrop', { y: -45, scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: 1 } })
    }, pageRef)
    return () => context.revert()
  }, { scope: pageRef })

  useGSAP(() => {
    const cta = document.querySelector<HTMLElement>('.hero-actions .primary')
    return cta ? createMagneticEffect(cta) : undefined
  }, { scope: pageRef })
  const navOpacity = useTransform(scrollY, [0, 80], [0, 1])

  const updateBalance = (delta: number) => setBalance((current) => current + delta)
  const balanceLabel = balance === 0 ? 'You and Rahul are all settled.' : balance < 0 ? 'You owe Rahul.' : 'Rahul owes you.'

  return (
    <main ref={pageRef} className="landing-shell">
      <motion.header className="landing-nav" style={{ backgroundColor: `rgba(10, 13, 17, ${navOpacity})` }}>
        <a className="landing-brand" href="#top" aria-label="Proxy Ledger home"><span className="brand-mark"><ArrowRight /></span><strong>proxyledger</strong></a>
        <nav className="desktop-links" aria-label="Main navigation">
          <a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#preview">Preview</a><a href="#faq">FAQ</a>
        </nav>
        <div className="nav-actions"><a className="login-link" href="/login">Log in</a><a className="button primary" href="/dashboard">Get started <ArrowRight /></a><button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>{mobileOpen ? <X /> : <Menu />}</button></div>
        {mobileOpen && <motion.nav className="mobile-links" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><a href="#features" onClick={() => setMobileOpen(false)}>Features</a><a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a><a href="#preview" onClick={() => setMobileOpen(false)}>Preview</a><a href="#faq" onClick={() => setMobileOpen(false)}>FAQ</a></motion.nav>}
      </motion.header>

      <section className="landing-hero" id="top">
        <NetworkBackdrop />
        <div className="hero-content">
          <div className="eyebrow-badge"><Sparkles /> YOUR CIRCLE. YOUR BALANCE.</div>
          <h1>Good friends.<br /><span>Clear balances.</span></h1>
          <p>Track every favor, settle every balance, and keep your friendships free from awkward reminders.</p>
          <div className="hero-actions"><AnimatedButton className="button primary large" href="/dashboard">Start tracking <ArrowRight /></AnimatedButton><AnimatedButton className="button outline large" href="#how-it-works">See how it works</AnimatedButton></div>
        </div>
        <DashboardPreview />
      </section>

      <section className="landing-section problem-section" id="features"><motion.div className="section-intro" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}><span className="section-kicker">THE PROBLEM</span><h2>Favors are easy.<br /><em>Remembering them isn&apos;t.</em></h2><p>One friend helps you today. You return the favor next week. Somewhere in between, everyone forgets who owes whom.</p></motion.div><motion.div className="problem-grid" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>{problems.map(({ icon: Icon, title, copy }) => <motion.article className="story-card" variants={reveal} key={title}><Icon /><h3>{title}</h3><p>{copy}</p></motion.article>)}</motion.div><motion.div className="solution-row"><div><span className="section-kicker">THE SOLUTION</span><h2>One shared ledger.<br /><em>Zero confusion.</em></h2></div><LedgerVisual /></motion.div></section>

      <section className="landing-section steps-section" id="how-it-works"><motion.div className="section-intro centered" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}><span className="section-kicker">HOW IT WORKS</span><h2>Three steps. <em>That&apos;s it.</em></h2></motion.div><motion.div className="steps-grid" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>{steps.map((step, index) => <motion.article className="step-card" variants={reveal} key={step.number}><span className="step-number">{step.number}</span><div className="step-line" aria-hidden="true">{index < 2 && <ArrowRight />}</div><h3>{step.title}</h3><p>{step.copy}</p></motion.article>)}</motion.div></section>

      <section className="landing-section demo-section"><motion.div className="section-intro centered" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true }}><span className="section-kicker">A LITTLE PROOF</span><h2>See how it <em>adds up.</em></h2><p>Try a favor exchange. This demo is separate from your real ledger.</p></motion.div><motion.div className="balance-demo" initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}><div className="demo-person"><div className="demo-avatar">A</div><strong>You</strong></div><div className="demo-connection"><div className="connection-line"><span /></div><motion.div className={`demo-balance ${balance < 0 ? 'negative' : balance > 0 ? 'positive' : ''}`} key={balance} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{balance > 0 ? '+' : ''}{balance}</motion.div><span className="demo-status">{balanceLabel}</span></div><div className="demo-person"><div className="demo-avatar rahul">R</div><strong>Rahul</strong></div><div className="demo-controls"><button className="button outline" onClick={() => updateBalance(-1)}><Minus /> Rahul helped me</button><button className="button primary" onClick={() => updateBalance(1)}><Plus /> I helped Rahul</button>{balance !== 0 && <button className="reset-button" onClick={() => setBalance(0)}>Reset demo</button>}</div></motion.div></section>

      <section className="landing-section bento-section" id="preview"><motion.div className="section-intro" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true }}><span className="section-kicker">MADE FOR YOUR CIRCLE</span><h2>Everything <em>in its place.</em></h2></motion.div><motion.div className="feature-grid" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>{features.map((feature, index) => <motion.article className={`feature-card ${feature.className}`} variants={reveal} key={feature.title}><div className="feature-visual"><span className="mini-dot" /><span className="mini-line" /><span className="mini-value">{index % 2 ? '+4' : '03'}</span></div><h3>{feature.title}</h3><p>{feature.copy}</p></motion.article>)}</motion.div></section>

      <section className="philosophy-section"><div className="philosophy-copy"><span className="section-kicker">OUR PHILOSOPHY</span><h2>Built for favors.<br /><em>Not awkward conversations.</em></h2><p>Good friendships shouldn&apos;t need complicated accounting. Proxy Ledger keeps the details organized so you don&apos;t have to.</p></div><div className="settled-visual"><div className="settled-avatar">A</div><div className="settled-line"><span>settled</span></div><div className="settled-avatar rahul">R</div><strong>0</strong></div></section>

      <section className="final-cta" id="faq"><div className="ambient-glow" /><span className="section-kicker">YOUR CIRCLE IS WAITING</span><h2>Keep the favors.<br /><em>Lose the confusion.</em></h2><p>Your circle deserves a better way to keep track.</p><a className="button primary large" href="/dashboard">Get started for free <ArrowRight /></a></section>
      <footer className="landing-footer"><div><a className="landing-brand" href="#top"><span className="brand-mark"><ArrowRight /></span><strong>proxyledger</strong></a><p>Every favor, accounted for.</p></div><div className="footer-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="/dashboard">Dashboard</a><a href="#faq">Privacy</a></div><span className="footer-note">Made for better friendships.</span></footer>
    </main>
  )
}

function NetworkBackdrop() { return <div className="network-backdrop" aria-hidden="true"><svg viewBox="0 0 1200 500" preserveAspectRatio="none"><path d="M90 330 C280 120 370 410 560 240 S900 60 1120 270" /><path d="M110 110 C320 240 450 70 670 350 S970 380 1150 110" /><path d="M250 470 C390 270 660 280 810 90" /></svg>{[...Array(14)].map((_, i) => <span key={i} className="network-node" style={{ left: `${8 + ((i * 29) % 84)}%`, top: `${18 + ((i * 37) % 62)}%`, animationDelay: `${i * -0.45}s`, backgroundColor: palette[i % 3] }} />)}</div> }
function DashboardPreview() { return <div className="preview-frame" id="preview-frame"><div className="browser-bar"><span /><span /><span /><small>app.proxyledger</small></div><div className="preview-app"><aside><div className="preview-logo"><span className="brand-mark"><ArrowRight /></span><strong>proxyledger</strong></div><div className="preview-nav active">Overview</div><div className="preview-nav">Friends</div><div className="preview-nav">Transactions</div><div className="preview-nav">Subjects</div></aside><div className="preview-main"><div className="preview-top"><span>YOUR NETWORK OVERVIEW</span><b>Live ledger</b></div><h3>Every favor, accounted for.</h3><p>Keep track of who owes whom, without awkward conversations.</p><div className="preview-stats"><div><span>You owe</span><strong className="negative">03</strong></div><div><span>Owed to you</span><strong className="positive">07</strong></div></div><div className="preview-friends"><div><span>Rahul Sharma</span><b className="negative">−2</b></div><div><span>Aryan Mehta</span><b className="positive">+4</b></div><div><span>Karan Singh</span><b>0</b></div></div><div className="preview-button">+ &nbsp; Record a favor <ArrowRight /></div></div></div></div> }
function LedgerVisual() { return <div className="ledger-visual"><div className="ledger-scatter"><span>−2</span><span>+4</span><span>+1</span></div><ArrowRight /><div className="ledger-organized"><div><span>Rahul</span><b className="negative">−2</b></div><div><span>Aryan</span><b className="positive">+4</b></div><div><span>Karan</span><b>0</b></div></div></div> }
