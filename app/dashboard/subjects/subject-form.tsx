'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { addSubject } from '../transactions/actions'

export default function SubjectForm() {
  const id = useId()
  const router = useRouter()
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, startTransition] = useTransition()
  return <form className="panel favor-subject-form" onSubmit={event => { event.preventDefault(); setFeedback(''); startTransition(async () => {
    try { const result = await addSubject({ name }); if (!result.ok) { setFeedback(result.error); return } setFeedback(`Created ${result.data.name}.`); setName(''); router.refresh() } catch { setFeedback('Unable to create the subject. Please try again.') }
  }) }}><label htmlFor={id}>Create a subject</label><div className="favor-inline"><input id={id} className="favor-input" required maxLength={100} placeholder="Subject name" disabled={pending} value={name} onChange={event => setName(event.target.value)} /><motion.button className="button primary" type="submit" disabled={pending || !name.trim()} whileTap={{ scale: .98 }}>{pending ? 'Creating…' : 'Create subject'}</motion.button></div>{feedback && <p role="status" className="circle-feedback">{feedback}</p>}</form>
}
