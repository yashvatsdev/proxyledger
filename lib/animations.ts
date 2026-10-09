import { gsap } from 'gsap'

export const easeOut = 'power3.out'
export const revealFrom = { opacity: 0, y: 32 }
export const revealTo = { opacity: 1, y: 0 }

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function createMagneticEffect(element: HTMLElement) {
  if (prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return () => {}
  const move = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 10
    gsap.to(element, { x, y, duration: 0.35, ease: 'power2.out', overwrite: true })
  }
  const reset = () => gsap.to(element, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.55)', overwrite: true })
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerleave', reset)
  return () => {
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerleave', reset)
    gsap.killTweensOf(element)
  }
}

export const counterTransition = { type: 'spring' as const, stiffness: 360, damping: 30, mass: 0.7 }
