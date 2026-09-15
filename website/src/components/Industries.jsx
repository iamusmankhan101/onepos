import { useState } from 'react'
import ProductMock from './ProductMock.jsx'
import { Check } from './Icons.jsx'
import { INDUSTRIES } from '../data.js'

export default function Industries() {
  const [active, setActive] = useState(INDUSTRIES[0].id)
  const current = INDUSTRIES.find((i) => i.id === active)

  return (
    <section className="section" id="industries">
      <div className="shell">
        <div className="section-head">
          <div className="eyebrow">
            <span className="eyebrow__pill">
              <span className="eyebrow__dot" />
              Built for your floor
            </span>
          </div>
          <h2>One platform, shaped to how you actually trade</h2>
          <p>The ledger underneath is the same. What sits on top of it is not.</p>
        </div>

        <div className="tabs" role="tablist" aria-label="Industries">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.id}
              role="tab"
              aria-selected={active === ind.id}
              className={`tab${active === ind.id ? ' tab--on' : ''}`}
              onClick={() => setActive(ind.id)}
            >
              {ind.tab}
            </button>
          ))}
        </div>

        <div className="industry" key={current.id}>
          <div>
            <div className="label-mono">{current.tab}</div>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
            <ul className="industry__list">
              {current.points.map((p) => (
                <li key={p}>
                  <span className="industry__check">
                    <Check />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="industry__visual">
            <ProductMock
              compact
              url={`app.pointly.pk/${current.id}`}
              title={current.mock.title}
              meta={current.mock.meta}
              kpis={current.mock.kpis}
              rows={current.mock.rows}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
