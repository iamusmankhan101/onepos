import { FEATURES } from '../data.js'
import { FeatureIcon } from '../components/Icons.jsx'

// The glow under the cursor: each card tracks the pointer in two custom
// properties the CSS paints a radial gradient from. Pointer-only, so touch and
// keyboard users simply don't get it.
function trackGlow(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function HomeModules() {
  return (
    <section className="hp-sec" id="platform" style={{ paddingTop: 0 }}>
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <p className="hp-label">The platform</p>
          <h2 style={{ marginTop: 12 }}>Nine modules, one system of record</h2>
          <p>
            Everything reads and writes the same records, so a sale at the till is already in the
            stock count, the client's history and tonight's profit figure.
          </p>
        </div>

        <div className="hp-mods">
          {FEATURES.map((f, i) => (
            <article
              className="hp-mod hp-reveal"
              key={f.title}
              style={{ transitionDelay: `${(i % 3) * 80}ms` }}
              onPointerMove={trackGlow}
            >
              <div className="hp-mod__top">
                <div className="hp-mod__icon">
                  <FeatureIcon name={f.icon} />
                </div>
                <span className="hp-mod__num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.short}</p>
              <ul className="hp-mod__tags">
                {f.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
