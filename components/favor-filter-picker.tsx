'use client'

import { useEffect, useId, useState } from 'react'
import { historyChoices } from '@/app/dashboard/transactions/actions'

export default function FavorFilterPicker({ kind, initialId, initialLabel }: { kind: 'friend' | 'subject'; initialId?: string; initialLabel?: string | null }) {
  const id = useId()
  const [selected, setSelected] = useState({ id: initialId || '', name: initialLabel || `Selected ${kind}` })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [options, setOptions] = useState<Awaited<ReturnType<typeof historyChoices>> | null>(null)
  useEffect(() => {
    if (!open) return
    let canceled = false
    const timer = setTimeout(async () => {
      try { const result = await historyChoices({ kind, query, page }); if (!canceled) setOptions(result) } catch { if (!canceled) setOptions({ ok: false, error: 'Unable to load filters.' }) }
    }, 250)
    return () => { canceled = true; clearTimeout(timer) }
  }, [kind, query, page, open])
  return <div className="favor-filter-picker"><span id={id}>{kind === 'friend' ? 'Friend' : 'Subject'}</span><input type="hidden" name={kind} value={selected.id} /><button type="button" className="favor-input" aria-labelledby={id} aria-expanded={open} onClick={() => setOpen(value => !value)}>{selected.id ? selected.name : `All ${kind === 'friend' ? 'friends' : 'subjects'}`} ▾</button>
    {open && <div className="favor-filter-options"><label className="sr-only" htmlFor={`${id}-search`}>Search {kind} in your history</label><input id={`${id}-search`} className="favor-input" maxLength={80} placeholder={`Search ${kind} names`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); setOptions(null) }} /><button className="favor-choice" type="button" onClick={() => { setSelected({ id: '', name: '' }); setOpen(false) }}>All {kind === 'friend' ? 'friends' : 'subjects'}</button>{options?.ok ? options.data.rows.map(option => <button type="button" className="favor-choice" key={option.id} onClick={() => { setSelected({ id: option.id, name: option.name || 'Your friend' }); setOpen(false) }}>{option.name || 'Your friend'}</button>) : <p role={options ? 'alert' : 'status'}>{options?.error || 'Loading…'}</p>}{options?.ok && !options.data.rows.length && <p className="circle-muted">No matches in your history.</p>}<div className="favor-choice-pages">{page > 1 && <button type="button" className="text-button" onClick={() => { setPage(value => value - 1); setOptions(null) }}>Previous</button>}{options?.ok && options.data.hasMore && <button type="button" className="text-button" onClick={() => { setPage(value => value + 1); setOptions(null) }}>More</button>}</div></div>}
  </div>
}
