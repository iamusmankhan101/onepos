import { BAND_STATS } from './copy.js'
import { Arrow, Check } from '../components/Icons.jsx'

// One bill, three consequences — the claim in the headline, shown.
const FLOW = [
  ['Sale posted', 'Rs 5,130 · card', '+0.0s'],
  ['Stock deducted', '9 SKUs across 4 recipes', '+0.1s'],
  ['Journal written', 'JV #40118 · sales + tax', '+0.1s'],
  ['FBR invoice returned', '7742-0093', '+0.8s'],
]

export default function HomeBand() {
  return (
    <section className="hp-bandWrap" id="customers">
      <div className="hp-band">
        <div className="hp-band__in">
          <div className="hp-band__grid">
            <div>
              <h2 className="hp-band__title hp-reveal">
                Every bill writes to stock and the ledger in the same second
              </h2>

              <p className="hp-band__sub hp-reveal">
                The till stops being a separate island. Month-end goes from four days of reconciling
                three systems to one afternoon of reading a report that was already right.
              </p>

              <div className="hp-close__cta hp-reveal" style={{ justifyContent: 'flex-start', marginTop: 26 }}>
                <a className="hp-btn hp-btn--white hp-btn--lg" href="#demo">
                  See it on your data
                  <Arrow />
                </a>
              </div>
            </div>

            <div className="hp-flow hp-reveal">
              <div className="hp-flow__head">
                <b>Bill #40118</b>
                <span>12:04:22</span>
              </div>
              {FLOW.map(([title, meta, t]) => (
                <div className="hp-flow__row" key={title}>
                  <span className="hp-flow__tick" aria-hidden="true">
                    <Check width="12" height="12" />
                  </span>
                  <p>
                    {title}
                    <small>{meta}</small>
                  </p>
                  <em>{t}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="hp-band__stats">
            {BAND_STATS.map(([figure, label], i) => (
              <div className="hp-band__stat hp-reveal" key={label} style={{ transitionDelay: `${i * 80}ms` }}>
                <b>{figure}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
