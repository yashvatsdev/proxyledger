'use client'

import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import CircleDialog from './circle-dialog'
import { resolveSettlement } from '@/app/dashboard/settlements/actions'
import type { SettlementRecord } from '@/lib/settlement-types'

export default function SettlementActions({ row,actor }: { row:SettlementRecord;actor:string }) {
  const router=useRouter()
  const [operation,setOperation]=useState<'confirm'|'reject'|'cancel'|null>(null)
  const [pending,startTransition]=useTransition()
  const [error,setError]=useState('')
  if(row.status!=='PENDING')return null
  const debtor=row.debtor.id===actor?'You':row.debtor.name||'Your friend'
  const creditor=row.creditor.id===actor?'you':row.creditor.name||'your friend'
  return <div className="favor-actions">{row.requester.id===actor?<button className="button outline" onClick={()=>{setError('');setOperation('cancel')}}>Cancel request</button>:<><motion.button className="button primary" whileTap={{scale:.98}} onClick={()=>{setError('');setOperation('confirm')}}>Confirm</motion.button><button className="button outline" onClick={()=>{setError('');setOperation('reject')}}>Reject</button></>}
    <CircleDialog open={!!operation} onClose={()=>{if(!pending)setOperation(null)}} title={operation==='confirm'?'Confirm this debt reduction?':operation==='reject'?'Reject this settlement?':'Cancel your request?'} description={`${debtor} owe${row.debtor.id===actor?'':'s'} ${creditor} the recorded debt. This request proposes reducing it by ${row.amount} ${row.amount===1?'proxy':'proxies'}.`}>
      <p>Submitted by {row.requester.id===actor?'you':row.requester.name||'your friend'}. {operation==='confirm'?'The server rechecks the current debt. This cannot exceed it or reverse who owes whom.':'This request will remain in history without changing your balance.'}</p>{row.reason&&<p className="favor-note">{row.reason}</p>}{error&&<p className="circle-feedback" role="alert">{error}</p>}
      <div className="circle-card-actions"><button className="button outline" disabled={pending} onClick={()=>setOperation(null)}>Go back</button><motion.button className="button primary" disabled={pending} whileTap={{scale:.98}} onClick={()=>startTransition(async()=>{
        if(!operation)return
        try{const result=await resolveSettlement({id:row.id,operation});if(!result.ok){setError(result.error);return}setOperation(null);router.refresh()}catch{setError('Unable to complete the action. Refresh before retrying.')}
      })}>{pending?'Saving…':operation==='confirm'?'Confirm settlement':operation==='reject'?'Reject settlement':'Cancel settlement'}</motion.button></div>
    </CircleDialog>
  </div>
}
