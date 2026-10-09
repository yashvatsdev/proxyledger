'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { ledgerEntryLabel,signedUnits,type LedgerEntry } from '@/lib/settlement-types'
import { attendanceLabel } from '@/lib/favor-types'

export default function LedgerTimeline({rows}:{rows:LedgerEntry[]}) {
  return <motion.div className="ledger-timeline" initial={{opacity:0}} animate={{opacity:1}}>{rows.map((row,index)=><motion.article key={`${row.kind}:${row.id}`} className="ledger-event" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:Math.min(index,5)*.03}}><div className={`ledger-event-dot ${row.delta>0?'positive':row.delta<0?'negative':''}`} aria-hidden="true"/><div className="ledger-event-copy"><div className="ledger-event-title"><h3>{ledgerEntryLabel(row)}</h3><span className={`ledger-units ${row.delta>0?'positive':row.delta<0?'negative':''}`}>{signedUnits(row.delta)}</span></div><p>{row.kind==='favor'?(row.subject||'Subject not recorded'):'Settlement'} · {row.status.charAt(0)+row.status.slice(1).toLowerCase()}{row.attendanceDate?` · Attendance ${attendanceLabel(row.attendanceDate)}`:''}</p><time dateTime={row.effectiveAt}>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(row.effectiveAt))}</time>{row.note&&<p className="favor-note favor-note-preview">{row.note}</p>}<div className="ledger-event-footer"><span>Balance after this activity: {signedUnits(row.resultingBalance)}</span><Link className="text-button" href={`/dashboard/${row.kind==='favor'?'transactions':'settlements'}/${row.id}`}>View details →</Link></div></div></motion.article>)}{!rows.length&&<motion.div className="circle-empty" initial={{opacity:0}} animate={{opacity:1}}><h2>A fresh ledger</h2><p>Confirmed favors and agreed settlements build your shared story. Pending activity counts as zero.</p><Link className="button outline" href="/dashboard/transactions">Record your first favor</Link></motion.div>}</motion.div>
}
