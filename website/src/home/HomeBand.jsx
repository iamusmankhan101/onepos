import { BAND_STATS, whatsAppLink } from './copy.js'
import { Arrow, Check } from '../components/Icons.jsx'

// One settle at the till, and everything it touches — the claim in the
// headline, shown. These are the writes a POS sale actually makes.
const FLOW = [
  ['Sale settled', 'Rs 5,130 · card', 'now'],
  ['Stock deducted', '3 product lines', 'now'],
  ['Invoice filed', 'SI-2026-0148 · paid', 'now'],
  ['Points credited', '+513 pts · Gold', 'now'],
  ['Receipt away', 'Printed · sent on WhatsApp', '2s'],
]

export default function HomeBand() {
  return (
    <section className="hp-bandWrap" id="customers">
      <div className="hp-band">
        <div className="hp-band__in">
          <div className="hp-band__grid">
            <div>
              <p className="hp-band__eyebrow hp-reveal">One tap at the till</p>

              <h2 className="hp-band__title hp-reveal">
                Settle the sale. Everything else is already written.
              </h2>

              <p className="hp-band__sub hp-reveal">
                The stock count, the invoice, the customer's points and tonight's profit figure all
                move on the same tap. Nothing is typed twice, and nothing waits for the end of the
                day to be true.
              </p>

              <div className="hp-ctaRow hp-reveal" style={{ justifyContent: 'flex-start', marginTop: 26 }}>
                <a
                  className="hp-btn hp-btn--white hp-btn--lg"
                  href={whatsAppLink("Hi Pointly, I'd like to see it running on my own counter.")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See it on your counter
                  <Arrow />
                </a>
              </div>
            </div>

            <div className="hp-flow hp-reveal">
              <div className="hp-flow__head">
                <b>Till 02 · Clifton</b>
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

              <div className="hp-flow__foot">
                <span className="hp-flow__pulse" aria-hidden="true" />
                Saved on this device, synced to the cloud
              </div>
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
