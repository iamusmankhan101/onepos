import { useEffect, useState } from 'react'
import { NAV_LINKS } from '../data.js'

export default function Nav() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight whichever section is crossing the middle band of the viewport.
  useEffect(() => {
    const targets = NAV_LINKS.map((l) => document.getElementById(l.href.slice(1))).filter(Boolean)
    if (!targets.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(`#${e.target.id}`)
        })
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    targets.forEach((t) => obs.observe(t))
    return () => obs.disconnect()
  }, [])

  // Close the panel on Escape, and if the desktop layout takes over mid-session.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const mq = window.matchMedia('(min-width: 981px)')
    const onChange = () => mq.matches && setOpen(false)
    window.addEventListener('keydown', onKey)
    mq.addEventListener('change', onChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onChange)
    }
  }, [open])

  return (
    <header className={`nav${stuck ? ' nav--stuck' : ''}${open ? ' nav--open' : ''}`}>
      <div className="shell">
        <div className="nav__bar">
          <div className="nav__row">
            <a className="logo logo--ink" href="#top" aria-label="Pointly, powered by Salon Central">
              <img src="/pointly-lockup.png" alt="Pointly" />
            </a>

            <nav className="nav__links" aria-label="Primary">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={active === l.href ? 'is-active' : undefined}
                  aria-current={active === l.href ? 'page' : undefined}
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="nav__actions">
              <a className="nav__signin" href="#top">
                Sign in
              </a>
              <a className="btn btn--primary btn--sm" href="#demo">
                Book a demo
              </a>
              <button
                className={`nav__burger${open ? ' nav__burger--on' : ''}`}
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                <span />
              </button>
            </div>
          </div>

          <div className="nav__mobile">
            <div>
              <nav className="nav__mobileInner" aria-label="Mobile">
                {NAV_LINKS.map((l) => (
                  <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                    {l.label}
                  </a>
                ))}
                <a href="#top" onClick={() => setOpen(false)}>
                  Sign in
                </a>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
