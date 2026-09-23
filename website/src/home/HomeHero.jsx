import Ripple from './Ripple.jsx'
import Till from './Till.jsx'
import { Arrow } from '../components/Icons.jsx'
import { whatsAppLink } from './copy.js'

const Info = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
  </svg>
)

export default function HomeHero() {
  return (
    <section className="hp-hero" id="top">
      <div className="hp-hero__glow" aria-hidden="true" />
      <Ripple className="hp-ripple hp-ripple--l" />
      <Ripple className="hp-ripple hp-ripple--r" />

      <div className="hp-shell">
        <h1 className="hp-hero__title">
          Sell, Stock And Get Paid <br />
          From <em>One Screen</em>
        </h1>

        <p className="hp-hero__sub">
          Pointly is the point of sale for salons, clinics and shops. Ring up services and products,
          take cash, card or a wallet, and hand over the receipt. Stock, loyalty points and
          today's profit update themselves.
        </p>

        <div className="hp-hero__cta">
          <a
            className="hp-btn hp-btn--orange hp-btn--lg"
            href={whatsAppLink("Hi Pointly, I'd like to get started. Can you show me the app?")}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get Started
            <Arrow />
          </a>
          <a className="hp-btn hp-btn--dark hp-btn--lg" href="#features">
            See Features
          </a>
        </div>

        <div className="hp-float">
          <div className="hp-float__inner">
            <span className="hp-chip hp-chip--a">
              <i aria-hidden="true">↑</i>
              347.23%
            </span>

            {/* display:contents on desktop, a real row once the layout narrows */}
            <div className="hp-statRow">
              <div className="hp-stat hp-stat--a">
                <p className="hp-stat__k">
                  Total Sales
                  <Info />
                </p>
                <p className="hp-stat__v">Rs 234.98K</p>
                <p className="hp-stat__d">↑ 25.45%</p>
              </div>

              <div className="hp-stat hp-stat--b">
                <p className="hp-stat__k">
                  Monthly GMV
                  <Info />
                </p>
                <p className="hp-stat__v">Rs 567.34K</p>
              </div>
            </div>

            <span className="hp-chip hp-chip--b">
              <i aria-hidden="true">●</i>
              Sells offline
            </span>

            <Till />
          </div>
        </div>
      </div>

      <div className="hp-hero__floor" aria-hidden="true" />
    </section>
  )
}
