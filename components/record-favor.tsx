'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Check, X } from 'lucide-react'
import CircleDialog from './circle-dialog'
import UserAvatar from './user-avatar'
import { favorChoices, recordFavor, addSubject } from '@/app/dashboard/transactions/actions'
import { todayAttendance } from '@/lib/favor-types'
import type { PublicPerson } from '@/lib/friend-types'

export default function RecordFavor({ className = 'button primary' }: { className?: string }) {
  const router = useRouter()
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [pending, startTransition] = useTransition()
  const [friend, setFriend] = useState<PublicPerson | null>(null)
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null)
  const [direction, setDirection] = useState<'provided' | 'received'>('provided')
  const [friendQuery, setFriendQuery] = useState('')
  const [subjectQuery, setSubjectQuery] = useState('')
  const [friendPage, setFriendPage] = useState(1)
  const [subjectPage, setSubjectPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [date, setDate] = useState(todayAttendance)
  const [note, setNote] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof favorChoices>> | null>(null)
  const submission = useRef('')
  useEffect(() => {
    if (!open) return
    let canceled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await favorChoices({ friends: { query: friendQuery, page: friendPage }, subjects: { query: subjectQuery, page: subjectPage } })
        if (!canceled) { setChoices(result); setLoading(false) }
      } catch { if (!canceled) { setError('Unable to load your choices. Please try again.'); setLoading(false) } }
    }, 250)
    return () => { canceled = true; clearTimeout(timer) }
  }, [open, friendQuery, subjectQuery, friendPage, subjectPage, refresh])
  function launch() {
    submission.current = crypto.randomUUID()
    setFriend(null); setSubject(null); setDirection('provided'); setDate(todayAttendance()); setNote(''); setError(''); setChoices(null)
    setFriendQuery(''); setSubjectQuery(''); setFriendPage(1); setSubjectPage(1); setNewSubject(''); setOpen(true)
  }
  return <>
    <motion.button type="button" className={className} onClick={launch} whileHover={{ y: -1 }} whileTap={{ scale: .98 }}><Plus aria-hidden="true" /> Record a favor</motion.button>
    <CircleDialog open={open} onClose={() => { if (!pending) setOpen(false) }} title="Record a favor" description="Both of you acknowledge the same attendance proxy. It counts only after your friend confirms.">
      <form className="favor-form" aria-busy={pending} aria-describedby={error ? `${formId}-error` : undefined} onSubmit={event => {
        event.preventDefault(); setError('')
        if (!friend || !subject) { setError('Choose an accepted friend and a subject.'); return }
        startTransition(async () => {
          try {
            const result = await recordFavor({ friendId: friend.id, subjectId: subject.id, direction, attendanceDate: date, note, submissionKey: submission.current })
            if (!result.ok) { setError(result.error); return }
            setOpen(false); setToast(true); router.refresh()
          } catch { setError('Unable to submit. Retry with the same form to avoid a duplicate.'); }
        })
      }}>
        <fieldset disabled={pending}><legend>Friend</legend>
          <label className="sr-only" htmlFor={`${formId}-friend`}>Search accepted friends</label><input data-dialog-autofocus id={`${formId}-friend`} className="favor-input" aria-describedby={error ? `${formId}-error` : undefined} placeholder="Search your accepted friends" maxLength={80} value={friendQuery} onChange={event => { setFriendQuery(event.target.value); setFriendPage(1) }} />
          {friend && <p className="favor-selected">Selected: {friend.name || 'Your friend'}</p>}
          <div className="favor-choices" aria-busy={loading}>{choices?.ok && choices.data.friends.rows.map(person => <motion.button key={person.id} type="button" className={`favor-choice ${friend?.id === person.id ? 'selected' : ''}`} aria-pressed={friend?.id === person.id} onClick={() => setFriend(person)} whileTap={{ scale: .98 }}><UserAvatar user={{ ...person, email: null }} /><span>{person.name || 'Your friend'}</span>{friend?.id === person.id && <Check aria-hidden="true" />}</motion.button>)}</div>
          {!choices || loading ? <p className="circle-muted" role="status">Loading your choices…</p> : choices.ok && !choices.data.friends.rows.length ? <p className="circle-muted">No accepted friends match. Connect with someone from Friends first.</p> : !choices.ok ? <p role="alert">{choices.error}</p> : null}
          <div className="favor-choice-pages">{friendPage > 1 && <button type="button" className="text-button" onClick={() => setFriendPage(page => page - 1)}>Previous friends</button>}{choices?.ok && choices.data.friends.hasMore && <button type="button" className="text-button" onClick={() => setFriendPage(page => page + 1)}>More friends</button>}</div>
        </fieldset>
        <fieldset disabled={pending}><legend>Who marked attendance?</legend><div className="favor-directions">
          {(['provided', 'received'] as const).map(value => <motion.label key={value} className={direction === value ? 'selected' : ''} whileTap={{ scale: .99 }}><input type="radio" name={`${formId}-direction`} value={value} checked={direction === value} onChange={() => setDirection(value)} />{value === 'provided' ? 'I marked their attendance' : 'They marked my attendance'}</motion.label>)}
        </div><p className="circle-muted">{direction === 'provided' ? `${friend?.name || 'Your friend'} will owe you one proxy after confirmation.` : `You will owe ${friend?.name || 'your friend'} one proxy after confirmation.`}</p></fieldset>
        <fieldset disabled={pending}><legend>Subject</legend>
          <label className="sr-only" htmlFor={`${formId}-subject`}>Search your subjects</label><input id={`${formId}-subject`} className="favor-input" aria-describedby={error ? `${formId}-error` : undefined} placeholder="Search your subjects" maxLength={80} value={subjectQuery} onChange={event => { setSubjectQuery(event.target.value); setSubjectPage(1) }} />
          {subject && <p className="favor-selected">Selected: {subject.name}</p>}
          <div className="favor-choices">{choices?.ok && choices.data.subjects.rows.map(item => <button type="button" key={item.id} className={`favor-choice ${subject?.id === item.id ? 'selected' : ''}`} aria-pressed={subject?.id === item.id} onClick={() => setSubject(item)}>{item.name}{subject?.id === item.id && <Check aria-hidden="true" />}</button>)}</div>
          {choices?.ok && !choices.data.subjects.rows.length && <p className="circle-muted">No subjects found. Create one below.</p>}
          <div className="favor-choice-pages">{subjectPage > 1 && <button type="button" className="text-button" onClick={() => setSubjectPage(page => page - 1)}>Previous subjects</button>}{choices?.ok && choices.data.subjects.count > subjectPage * 20 && <button type="button" className="text-button" onClick={() => setSubjectPage(page => page + 1)}>More subjects</button>}</div>
          <label htmlFor={`${formId}-new`}>New subject</label><div className="favor-inline"><input id={`${formId}-new`} className="favor-input" maxLength={100} value={newSubject} onChange={event => setNewSubject(event.target.value)} placeholder="Subject name" /><button className="button outline" type="button" disabled={!newSubject.trim()} onClick={() => startTransition(async () => {
            try { const result = await addSubject({ name: newSubject }); if (!result.ok) { setError(result.error); return } setSubject(result.data); setNewSubject(''); setRefresh(value => value + 1); router.refresh() } catch { setError('Unable to create the subject. Please try again.') }
          })}>Create</button></div>
        </fieldset>
        <label htmlFor={`${formId}-date`}>Attendance date</label><input id={`${formId}-date`} className="favor-input" type="date" required min="1900-01-01" max={todayAttendance()} value={date} disabled={pending} onChange={event => setDate(event.target.value)} />
        <label htmlFor={`${formId}-note`}>Note <span className="circle-muted">(optional, {note.length}/2000)</span></label><textarea id={`${formId}-note`} className="favor-input" rows={3} maxLength={2000} value={note} disabled={pending} onChange={event => setNote(event.target.value)} />
        {error && <p id={`${formId}-error`} className="circle-feedback" role="alert">{error}</p>}
        <motion.button type="submit" className="button primary full-button" disabled={pending || !friend || !subject} whileTap={{ scale: .98 }}>{pending ? 'Saving…' : 'Send for confirmation'}</motion.button>
      </form>
    </CircleDialog>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check aria-hidden="true" /><span><strong>Favor recorded</strong><small>Awaiting your friend’s confirmation. See Transactions.</small></span><button aria-label="Dismiss" onClick={() => setToast(false)}><X /></button></motion.div>}</AnimatePresence>
  </>
}
