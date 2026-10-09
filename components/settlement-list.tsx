'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import UserAvatar from './user-avatar'
import SettlementActions from './settlement-actions'
import type { SettlementRecord } from '@/lib/settlement-types'

export default function SettlementList({rows,actor}:{rows:SettlementRecord[];actor:string}) {
  return <motion.div className="favor-list" initial={{opacity:0}} animate={{opacity:1}}>{rows.map((row,index)=>{
    const friend=row.requester.id===actor?row.recipient:row.requester
    return <motion.article className="panel favor-card" key={row.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:Math.min(index,5)*.03}}><div className="favor-card-heading"><UserAvatar user={{...friend,email:null}}/><div><strong>{friend.name||'Your friend'}</strong><h2>Settle {row.amount} {row.amount===1?'proxy':'proxies'}</h2></div><span className={`circle-badge favor-status-${row.status.toLowerCase()}`}>{row.status==='PENDING'&&row.recipient.id===actor?'Awaiting you':row.status.charAt(0)+row.status.slice(1).toLowerCase()}</span></div><p className="circle-muted">Reduce the debt {row.debtor.id===actor?'you owe':`${row.debtor.name||'your friend'} owes`} {row.creditor.id===actor?'you':row.creditor.name||'your friend'}.</p><p className="circle-muted">Submitted by {row.requester.id===actor?'you':row.requester.name||'your friend'} · {new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(new Date(row.createdAt))}</p>{row.reason&&<p className="favor-note favor-note-preview">{row.reason}</p>}<div className="favor-card-footer"><Link className="text-button" href={`/dashboard/settlements/${row.id}`}>View details →</Link><SettlementActions row={row} actor={actor}/></div></motion.article>
  })}</motion.div>
}
