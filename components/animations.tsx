'use client'

import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { counterTransition } from '@/lib/animations'

export function AnimatedCounter({ value, className = '' }: { value: number; className?: string }) {
  return <AnimatePresence mode="popLayout" initial={false}><motion.span key={value} className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={counterTransition}>{value > 0 ? '+' : ''}{value}</motion.span></AnimatePresence>
}

export function AnimatedButton({ children, className = '', ...props }: { children: ReactNode; className?: string } & React.ComponentProps<typeof motion.a>) {
  return <motion.a className={className} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.18 }} {...props}>{children}</motion.a>
}

export function AnimatedCard({ children, className = '', ...props }: { children: ReactNode; className?: string } & React.ComponentProps<typeof motion.article>) {
  return <motion.article className={className} whileHover={{ y: -3 }} transition={{ duration: 0.2, ease: 'easeOut' }} {...props}>{children}</motion.article>
}
