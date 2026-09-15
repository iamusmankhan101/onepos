import { useEffect } from 'react'

// Adds .is-in to every .hp-reveal once it crosses into view. One observer for
// the whole page; elements are unobserved after firing so it never re-animates.
export function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('.hp-reveal')
    if (!nodes.length) return

    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-in'))
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.add('is-in')
          obs.unobserve(e.target)
        })
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    nodes.forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
}
