'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { historyChoices } from '@/app/dashboard/transactions/actions'

export default function FavorFilterPicker({ kind, initialId, initialLabel }: { kind: 'friend' | 'subject'; initialId?: string; initialLabel?: string | null }) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState({ id: initialId || '', name: initialLabel || `Selected ${kind}` })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [options, setOptions] = useState<Awaited<ReturnType<typeof historyChoices>> | null>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss) }
  }, [open])
  useEffect(() => {
    if (!open) return
    let canceled = false
    const timer = setTimeout(async () => {
      try { const result = await historyChoices({ kind, query, page }); if (!canceled) setOptions(result) } catch { if (!canceled) setOptions({ ok: false, error: 'Unable to load filters.' }) }
    }, 250)
    return () => { canceled = true; clearTimeout(timer) }
  }, [kind, query, page, open])
  return <div ref={root} className="favor-filter-picker" onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus() } }}><span id={id}>{kind === 'friend' ? 'Friend' : 'Subject'}</span><input type="hidden" name={kind} value={selected.id} /><button ref={trigger} type="button" className="favor-input" aria-label={`${kind === 'friend' ? 'Friend' : 'Subject'} filter: ${selected.id ? selected.name : 'All'}`} aria-controls={`${id}-options`} aria-expanded={open} onClick={() => { setOpen(value => !value); setOptions(null) }}>{selected.id ? selected.name : `All ${kind === 'friend' ? 'friends' : 'subjects'}`} ▾</button>
    {open && <div id={`${id}-options`} className="favor-filter-options"><label className="sr-only" htmlFor={`${id}-search`}>Search {kind} in your history</label><input autoFocus id={`${id}-search`} className="favor-input" maxLength={80} placeholder={`Search ${kind} names`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); setOptions(null) }} /><button className="favor-choice" type="button" onClick={() => { setSelected({ id: '', name: '' }); setOpen(false); trigger.current?.focus() }}>All {kind === 'friend' ? 'friends' : 'subjects'}</button>{options?.ok ? options.data.rows.map(option => <button type="button" className="favor-choice" key={option.id} onClick={() => { setSelected({ id: option.id, name: option.name || 'Your friend' }); setOpen(false); trigger.current?.focus() }}>{option.name || 'Your friend'}</button>) : <p role={options ? 'alert' : 'status'}>{options?.error || 'Loading…'}</p>}{options?.ok && !options.data.rows.length && <p className="circle-muted">No matches in your history.</p>}<div className="favor-choice-pages">{page > 1 && <button type="button" className="text-button" onClick={() => { setPage(value => value - 1); setOptions(null) }}>Previous</button>}{options?.ok && options.data.hasMore && <button type="button" className="text-button" onClick={() => { setPage(value => value + 1); setOptions(null) }}>More</button>}</div></div>}
  </div>
}
