'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { Plus, Search } from 'lucide-react'
import CircleDialog from './circle-dialog'
import UserAvatar from './user-avatar'
import { changeFriendship, searchPeople } from '@/app/dashboard/friends/actions'
import type { SearchPerson } from '@/lib/friend-types'

export default function AddFriend({ label = 'Add Friend', className = 'button primary' }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [people, setPeople] = useState<SearchPerson[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const generation = useRef(0)
  const feedbackId = useId()
  const router = useRouter()
  const reduce = useReducedMotion()
  useEffect(() => {
    const current = ++generation.current
    let cancelled = false
    if (!open || query.trim().length < 3) return
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await searchPeople({ query: query.trim(), page })
        if (cancelled || current !== generation.current) return
        setLoading(false)
        if (result.ok) { setPeople(result.data.people); setHasMore(result.data.hasMore) }
        else { setPeople([]); setHasMore(false); setMessage(result.error) }
      } catch {
        if (!cancelled && current === generation.current) { setLoading(false); setMessage('Search could not connect. Please try again.') }
      }
    }, 300)
    return () => { clearTimeout(timer); cancelled = true }
  }, [query, page, open])
  function send(person: SearchPerson) {
    startTransition(async () => {
      try {
        const result = await changeFriendship({ operation: 'send', id: person.id })
        setMessage(result.ok ? 'Invitation sent. They’ll see it in their incoming requests.' : result.error)
        if (result.ok) { setPeople((current) => current.map((row) => row.id === person.id ? { ...row, relationship: 'outgoing' } : row)); router.refresh() }
      } catch { setMessage('Your invitation could not connect. Please try again.') }
    })
  }
  return <>
    <motion.button className={className} onClick={() => { setOpen(true); setMessage('') }} whileHover={reduce ? undefined : { y: -1 }} whileTap={reduce ? undefined : { scale: .98 }}><Plus aria-hidden="true" />{label}</motion.button>
    <CircleDialog open={open} onClose={() => setOpen(false)} title="Grow your circle" description="Search a name prefix (at least 3 characters) or an exact email address.">
      <label className="circle-search"><Search aria-hidden="true" /><input autoFocus data-dialog-autofocus aria-label="Search registered users" aria-describedby={feedbackId} placeholder="Name or full email address" maxLength={80} value={query} onChange={(event) => { generation.current++; setQuery(event.target.value); setPage(1); setPeople([]); setHasMore(false); setLoading(false); setMessage('') }} /></label>
      <p id={feedbackId} role="status" className={message ? 'circle-feedback' : 'sr-only'}>{message || (loading ? 'Searching registered users…' : 'Use at least three characters, or a complete email address.')}</p>
      <div className="search-results" aria-busy={loading}>
        {loading ? Array.from({ length: 3 }, (_, index) => <div className="circle-skeleton" key={index} aria-hidden="true" />) : people.map((person, index) => <motion.div className="circle-search-result" key={person.id} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : index * .025 }}><UserAvatar user={{ ...person, email: null }} /><strong>{person.name || 'Google user'}</strong>{person.relationship === 'none' ? <button className="button primary" disabled={pending} onClick={() => send(person)}>{pending ? 'Sending…' : 'Invite'}</button> : person.relationship === 'incoming' ? <Link className="text-button" href="/dashboard/friends?tab=incoming" onClick={() => setOpen(false)}>Incoming request</Link> : <span className="circle-badge">{person.relationship === 'accepted' ? 'Already friends' : 'Invitation sent'}</span>}</motion.div>)}
        {!loading && !people.length && <div className="circle-empty"><Search /><h3>{query.trim().length < 3 ? 'Find someone you know' : 'No matching people'}</h3><p>{query.trim().length < 3 ? 'Enter their name or complete email address.' : 'Try their full email, or ask them to sign in with Google first.'}</p>{query && <button className="text-button" onClick={() => { setQuery(''); setPeople([]); setPage(1) }}>Clear search</button>}</div>}
      </div>
      <div className="circle-pagination">{page > 1 && <button className="button outline" disabled={loading || pending} onClick={() => setPage(page - 1)}>Previous</button>}{hasMore && <button className="button outline" disabled={loading || pending} onClick={() => setPage(page + 1)}>More matches</button>}</div>
    </CircleDialog>
  </>
}
