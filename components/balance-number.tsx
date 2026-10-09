'use client'

import { motion } from 'motion/react'
// Fade the authoritative value directly; never tween through invented balances.
export default function BalanceNumber({value,tone=''}:{value:number;tone?:string}) {
  return <motion.strong className={tone} key={value} initial={{opacity:.4}} animate={{opacity:1}} transition={{duration:.18}}>{value}</motion.strong>
}
