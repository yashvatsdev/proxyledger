'use client'

import { useEffect, useId, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'

export default function CircleDialog({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const reduce = useReducedMotion()
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal() }, [open])
  return <dialog ref={ref} className="circle-dialog" data-closing={!open || undefined} aria-labelledby={id} aria-describedby={`${id}-description`} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <AnimatePresence onExitComplete={() => ref.current?.close()}>
      {open && <motion.div className="circle-dialog-content" initial={{ opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : 8 }} transition={{ duration: reduce ? 0 : .18 }}>
        <button type="button" className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}><X /></button>
        <h2 id={id}>{title}</h2><p id={`${id}-description`}>{description}</p>{children}
      </motion.div>}
    </AnimatePresence>
  </dialog>
}
