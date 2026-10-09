'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import CircleDialog from './circle-dialog'
import { resolveFavor } from '@/app/dashboard/transactions/actions'
import { attendanceLabel, type FavorRecord } from '@/lib/favor-types'

export default function FavorActions({ row, actor }: { row: FavorRecord; actor: string }) {
  const router = useRouter()
  const [operation, setOperation] = useState<'confirm' | 'reject' | 'cancel' | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  if (row.status !== 'PENDING') return null
  const submitter = row.createdBy.id === actor
  const performer = row.provider.id === actor ? 'You' : row.provider.name || 'Your friend'
  const receiver = row.beneficiary.id === actor ? 'you' : row.beneficiary.name || 'your friend'
  return <div className="favor-actions">
    {submitter ? <button className="button outline" onClick={() => { setError(''); setOperation('cancel') }}>Cancel pending favor</button> : <><motion.button className="button primary" onClick={() => { setError(''); setOperation('confirm') }} whileTap={{ scale: .98 }}>Confirm</motion.button><button className="button outline" onClick={() => { setError(''); setOperation('reject') }}>Reject</button></>}
    {feedback && <p role="status" className="circle-feedback">{feedback}</p>}
    <CircleDialog open={operation !== null} onClose={() => { if (!pending) setOperation(null) }} title={operation === 'confirm' ? 'Confirm this attendance favor?' : operation === 'reject' ? 'Reject this favor?' : 'Cancel your pending favor?'} description={`${performer} marked attendance for ${receiver} in ${row.subject?.name || 'the recorded subject'} on ${attendanceLabel(row.attendanceDate)}.`}>
      <p className="circle-muted">Submitted by {row.createdBy.name || 'your friend'}. {operation === 'confirm' ? `After confirmation, ${row.beneficiary.id === actor ? 'you owe' : `${row.beneficiary.name || 'your friend'} owes`} ${row.provider.id === actor ? 'you' : row.provider.name || 'your friend'} one proxy.` : 'The record stays in history and will not count toward balances.'}</p>
      {row.note && <p className="favor-note">{row.note}</p>}
      {error && <p className="circle-feedback" role="alert">{error}</p>}
      <div className="circle-card-actions"><button className="button outline" disabled={pending} onClick={() => setOperation(null)}>Go back</button><motion.button className="button primary" disabled={pending} whileTap={{ scale: .98 }} onClick={() => startTransition(async () => {
        if (!operation) return
        try { const result = await resolveFavor({ id: row.id, operation }); if (!result.ok) { setError(result.error); return } setFeedback(operation === 'confirm' ? 'Favor confirmed.' : operation === 'reject' ? 'Favor rejected.' : 'Favor canceled.'); setOperation(null); router.refresh() } catch { setError('Unable to complete the action. Please refresh before retrying.') }
      })}>{pending ? 'Saving…' : operation === 'confirm' ? 'Confirm favor' : operation === 'reject' ? 'Reject favor' : 'Cancel favor'}</motion.button></div>
    </CircleDialog>
  </div>
}
