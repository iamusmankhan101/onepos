import { FEATURES } from '../data.js'
import { FeatureIcon } from '../components/Icons.jsx'

export default function HomeModules() {
  return (
    <section className="hp-sec" id="platform" style={{ paddingTop: 0 }}>
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <p className="hp-label">The platform</p>
          <h2 style={{ marginTop: 12 }}>Six modules, one system of record</h2>
          <p>
            Turn on what you need today. Everything you add later reads from the same ledger, so the
            numbers never fork.
          </p>
        </div>

        <div className="hp-mods">
          {FEATURES.map((f, i) => (
            <article className="hp-mod hp-reveal" key={f.title} style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <div className="hp-mod__icon">
                <FeatureIcon name={f.icon} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
