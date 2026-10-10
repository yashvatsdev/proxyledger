'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import CircleDialog from './circle-dialog'
import { searchWorkspace } from '@/app/dashboard/search/actions'
import type { SearchGroup } from '@/lib/search-types'

export default function WorkspaceSearch() {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SearchGroup[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const results = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.repeat && !document.querySelector('dialog[open]')) { event.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => {
    if (!open || query.trim().length < 2) return
    let canceled = false
    const timer = setTimeout(async () => {
      try {
        const result = await searchWorkspace({ query })
        if (canceled) return
        setLoading(false)
        if (result.ok) { setGroups(result.data); setError('') } else setError(result.error)
      } catch { if (!canceled) { setLoading(false); setError('Could not connect. Retry your search.') } }
    }, 300)
    return () => { canceled = true; clearTimeout(timer) }
  }, [open, query, attempt])
  return <>
    <button type="button" className="icon-button" aria-label="Search your workspace" aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k" onClick={() => setOpen(true)}><Search aria-hidden="true" /></button>
    <CircleDialog open={open} onClose={() => setOpen(false)} title="Search your workspace" description="Find your friends, private subjects and shared transactions. Use Tab or arrow keys to browse results, Enter to open, and Escape to close.">
      <label htmlFor={id}>Search your workspace</label>
      <input autoFocus data-dialog-autofocus id={id} type="search" className="favor-input" maxLength={80} placeholder="Friend or subject name" aria-describedby={`${id}-feedback`} value={query} onChange={event => { setQuery(event.target.value); setGroups(null); setError(''); setLoading(event.target.value.trim().length >= 2) }} onKeyDown={event => { if (event.key === 'ArrowDown') { const first = results.current?.querySelector<HTMLAnchorElement>('a'); if (first) { event.preventDefault(); first.focus() } } }} />
      <p id={`${id}-feedback`} role={error ? 'alert' : 'status'} className="circle-muted">{error || (loading ? 'Searching your workspace…' : query.trim().length < 2 ? 'Type at least 2 characters. Shortcut: Ctrl+K or ⌘K.' : groups ? `${groups.reduce((total, group) => total + group.count, 0)} matching results.` : '')}</p>
      {error && <button type="button" className="button outline" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Retry search</button>}
      <div ref={results} className="workspace-search-results" aria-busy={loading} onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>('a') || [])
        const index = links.indexOf(document.activeElement as HTMLAnchorElement)
        if (index < 0) return
        event.preventDefault()
        if (event.key === 'ArrowUp' && index === 0) document.getElementById(id)?.focus()
        else links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus()
      }}>
        {groups?.filter(group => group.count > 0).map(group => <section key={group.label}><div className="section-heading"><h3>{group.label}</h3>{group.count > group.items.length && <Link href={group.href} onClick={() => setOpen(false)}>View all {group.count}</Link>}</div>{group.items.map(item => <Link className="workspace-search-result" key={item.id} href={item.href} onClick={() => setOpen(false)}><strong>{item.title}</strong><span>{item.description}</span></Link>)}</section>)}
        {groups && !groups.some(group => group.count) && <div className="circle-empty"><h3>No matches in your workspace</h3><p>Try a different friend or subject name.</p><Link className="text-button" href="/dashboard/friends" onClick={() => setOpen(false)}>Find new connections in Friends</Link></div>}
      </div>
    </CircleDialog>
  </>
}

