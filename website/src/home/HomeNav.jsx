import { useEffect, useState } from 'react'
import { NAV, whatsAppLink } from './copy.js'

export default function HomeNav() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 140)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the panel on Escape, and when the desktop layout takes over.
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
    <header className={`hp-nav${stuck ? ' hp-nav--stuck' : ''}${open ? ' hp-nav--open' : ''}`}>
      <div className="hp-shell">
        <div className="hp-nav__row">
          <a className="hp-nav__mark" href="#top" aria-label="Pointly, back to top">
            <img
              className="hp-lockup"
              src="/pointly-lockup.png"
              width="965"
              height="362"
              alt="Pointly, powered by Salon Central"
            />
          </a>

          <nav className="hp-nav__links" aria-label="Primary">
            {NAV.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hp-nav__end">
            <a
              className="hp-btn hp-btn--white hp-btn--sm"
              href={whatsAppLink('Hi Pointly, I have a question about the point of sale.')}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contact Us
            </a>
            <button
              className={`hp-burger${open ? ' hp-burger--on' : ''}`}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="hp-nav__panel">
          <div>
            <nav className="hp-nav__panelInner" aria-label="Mobile">
              {NAV.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              ))}
              <a
                href={whatsAppLink('Hi Pointly, I have a question about the point of sale.')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
              >
                Contact Us
              </a>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
