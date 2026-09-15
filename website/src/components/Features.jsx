import { FeatureIcon } from './Icons.jsx'
import { FEATURES, STATS } from '../data.js'

export default function Features() {
  return (
    <section className="section section--warm">
      <div className="shell">
        <div className="section-head">
          <div className="eyebrow">
            <span className="eyebrow__pill">
              <span className="eyebrow__dot" />
              The whole back office
            </span>
          </div>
          <h2>
            Six modules. One login. <span className="nowrap">No re-entry.</span>
          </h2>
          <p>
            Everything a multi-outlet operator needs between the counter and the closing balance.
          </p>
        </div>

        <div className="features">
          {FEATURES.map((f) => (
            <article className="feature" key={f.title}>
              <div className="feature__icon">
                <FeatureIcon name={f.icon} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>

        <div className="stats" style={{ marginTop: 56 }}>
          {STATS.map(([value, label]) => (
            <div className="stat" key={label}>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
