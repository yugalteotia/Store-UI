import { useEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'

/** GSAP section reveal. If reduced motion is on, or GSAP fails, content is simply shown. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
    }, el)
    return () => ctx.revert()
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
