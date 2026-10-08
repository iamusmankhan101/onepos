import { useEffect, useState } from 'react'
import { NAV, whatsAppLink } from './copy.js'
import { FEATURES } from '../data.js'
import { Arrow, FeatureIcon } from '../components/Icons.jsx'

// The Features mega-menu: opens on hover or keyboard focus (CSS :focus-within),
// and the trigger itself still links to the section for touch.
function FeaturesMenu({ href }) {
  return (
    <div className="hp-drop">
      <a className="hp-drop__trigger" href={href} aria-haspopup="true">
        Features
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>

      <div className="hp-drop__panel">
        <div className="hp-drop__intro">
          <p className="hp-label">Features</p>
          <h3>Everything Pointly runs at your counter</h3>
          <p>One connected system, from the till to the stock room to tonight's profit.</p>
          <a href="/#platform">
            Explore all
            <Arrow />
          </a>
        </div>

        <ul className="hp-drop__grid">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <a className="hp-drop__item" href="/#platform">
                <span className="hp-drop__icon">
                  <FeatureIcon name={f.icon} />
                </span>
                <span>
                  <b>{f.title}</b>
                  <small>{f.tags.join(' · ')}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

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
              src="/pointly-lockup-orange.png"
              width="321"
              height="120"
              alt="Pointly, powered by Salon Central"
            />
          </a>

          <nav className="hp-nav__links" aria-label="Primary">
            {NAV.map((l) =>
              l.label === 'Features' ? (
                <FeaturesMenu key={l.href} href={l.href} />
              ) : (
                <a key={l.href} href={l.href} aria-current={l.href === window.location.pathname ? 'page' : undefined}>
                  {l.label}
                </a>
              ),
            )}
          </nav>

          <div className="hp-nav__end">
            <a
              className="hp-btn hp-btn--orange hp-btn--sm"
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
