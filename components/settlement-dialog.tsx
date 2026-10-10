'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import CircleDialog from './circle-dialog'
import UserAvatar from './user-avatar'
import { proposeSettlement } from '@/app/dashboard/settlements/actions'
import { balanceExplanation, signedUnits, type BalanceCard } from '@/lib/settlement-types'

export default function SettlementDialog({ relationship }: { relationship: BalanceCard }) {
  const router = useRouter()
  const id = useId()
  const key = useRef('')
  const [open,setOpen] = useState(false)
  const [amount,setAmount] = useState('1')
  const [note,setNote] = useState('')
  const [error,setError] = useState('')
  const [toast,setToast] = useState(false)
  const [pending,startTransition] = useTransition()
  const max = Math.min(Math.abs(relationship.balance),2147483647)
  if (!relationship.balance) return null
  const numeric = Number(amount)
  const valid = Number.isInteger(numeric)&&numeric>0&&numeric<=max
  const predicted = relationship.balance + (relationship.balance>0 ? -numeric : numeric)
  return <>
    <motion.button className="button primary" type="button" whileTap={{ scale:.98 }} onClick={() => { key.current=crypto.randomUUID(); setAmount('1');setNote('');setError('');setOpen(true) }}>Settle</motion.button>
    <CircleDialog open={open} onClose={() => { if(!pending)setOpen(false) }} title="Agree on a settlement" description="Reduce an existing proxy debt together. Original favors stay in your history.">
      <div className="circle-card-header"><UserAvatar user={{...relationship.person,email:null}} /><strong>{relationship.person.name||'Your friend'}</strong></div><p>{balanceExplanation(relationship.balance,relationship.person.name)}</p>
      <form className="favor-form" aria-busy={pending} onSubmit={event => { event.preventDefault();setError('');startTransition(async()=>{
        try { const result=await proposeSettlement({friendId:relationship.person.id,amount:numeric,direction:relationship.balance>0?'owes-me':'i-owe',note,submissionKey:key.current});if(!result.ok){setError(result.error);return}setOpen(false);setToast(true);router.refresh() }catch{setError('Unable to submit. Retry with this form to avoid a duplicate request.')}
      }) }}>
        <label htmlFor={`${id}-amount`}>Proxies to settle (maximum {max})</label><input className="favor-input" id={`${id}-amount`} type="number" inputMode="numeric" min={1} max={max} step={1} required aria-describedby={error ? `${id}-preview ${id}-error` : `${id}-preview`} disabled={pending} value={amount} onChange={event=>setAmount(event.target.value)} />
        <label htmlFor={`${id}-note`}>Note (optional, {note.length}/2000)</label><textarea className="favor-input" id={`${id}-note`} rows={3} maxLength={2000} disabled={pending} value={note} onChange={event=>setNote(event.target.value)} />
        <p id={`${id}-preview`} className="ledger-explanation" role="status">{valid ? `After the other participant confirms, your balance would be ${signedUnits(predicted)}, assuming no other balance-changing activity occurs.` : 'Choose a positive whole number within the current debt.'} Pending requests do not change your balance.</p>
        {error&&<p id={`${id}-error`} className="circle-feedback" role="alert">{error}</p>}<motion.button type="submit" className="button primary full-button" disabled={pending||!valid} whileTap={{scale:.98}}>{pending?'Saving…':'Send settlement request'}</motion.button>
      </form>
    </CircleDialog>
    <AnimatePresence>{toast&&<motion.div className="toast" role="status" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}><Check aria-hidden="true"/><span><strong>Settlement requested</strong><small>Your balance stays unchanged until confirmation.</small></span><button aria-label="Dismiss" onClick={()=>setToast(false)}><X/></button></motion.div>}</AnimatePresence>
  </>
}
