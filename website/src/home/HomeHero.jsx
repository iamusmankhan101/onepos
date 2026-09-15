import HomeNav from './HomeNav.jsx'
import Ripple from './Ripple.jsx'
import Till from './Till.jsx'
import { Arrow } from '../components/Icons.jsx'

const Info = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
  </svg>
)

export default function HomeHero() {
  return (
    <section className="hp-hero" id="top">
      <HomeNav />

      <div className="hp-hero__glow" aria-hidden="true" />
      <Ripple className="hp-ripple hp-ripple--l" />
      <Ripple className="hp-ripple hp-ripple--r" />

      <div className="hp-shell">
        <h1 className="hp-hero__title">
          One Ledger For <br />
          Running Your <em>Whole Business</em>
        </h1>

        <p className="hp-hero__sub">
          Bill, stock and books in one system. Every sale posts its own stock movement and journal
          entry — without friction or complexity.
        </p>

        <div className="hp-hero__cta">
          <a className="hp-btn hp-btn--orange hp-btn--lg" href="#demo">
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
              <span className="hp-faces" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              12k+ tills
            </span>

            <Till />
          </div>
        </div>
      </div>

      <div className="hp-hero__floor" aria-hidden="true" />
    </section>
  )
}
