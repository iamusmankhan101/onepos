import { Arrow, FeatureIcon } from '../components/Icons.jsx'
import { whatsAppLink } from './copy.js'

// The six ways the till takes payment, strung along an arc above the screens.
// `t` is the position along the curve, left to right.
const RAIL = [
  { t: 0.05, logo: '/pay/cash.jpg', label: 'Cash', wide: true },
  { t: 0.2, logo: '/pay/card.png', label: 'Card' },
  { t: 0.35, logo: '/pay/jazzcash.png', label: 'JazzCash' },
  { t: 0.5, icon: 'receipt', label: 'Receipt', hub: true },
  { t: 0.65, logo: '/pay/easypaisa.png', label: 'EasyPaisa' },
  { t: 0.8, logo: '/pay/raast.png', label: 'Raast' },
  { t: 0.95, logo: '/pay/bank.png', label: 'Bank' },
]

// Height of the arc path below at t, as a % of its 120-unit viewBox, so the
// bubbles sit exactly on the drawn line at any width.
const arcTop = (t) => ((120 - 360 * t + 360 * t * t) / 120) * 100

export default function HomeHero() {
  return (
    <section className="hp-hero" id="top">
      <h1 className="hp-hero__title">
        Sell, Stock And Get Paid <br />
        <em>From One Screen</em>
      </h1>

      <p className="hp-hero__sub">
        Pointly is the point of sale for salons, clinics and shops. Ring up services and
        products, take cash, card or a wallet, and hand over the receipt. Stock, loyalty points
        and today's profit update themselves.
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
        <a className="hp-btn hp-btn--line hp-btn--lg" href="#features">
          See Features
        </a>
      </div>

      <div className="hp-rail">
        <svg className="hp-rail__line" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 Q500 -60 1000 120" />
        </svg>
        <ul aria-label="Ways to take payment">
          {RAIL.map((r) => (
            <li
              key={r.label}
              className={`hp-rail__dot${r.hub ? ' hp-rail__dot--hub' : ''}${r.wide ? ' hp-rail__dot--wide' : ''}`}
              style={{ left: `${r.t * 100}%`, top: `${arcTop(r.t)}%` }}
            >
              {r.logo ? <img src={r.logo} alt="" /> : <FeatureIcon name={r.icon} />}
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Real captures of the app (the same ones HomeScreens.jsx shows), the
          till up front and two more screens fanned out behind it. */}
      <div className="hp-stage">
        <img className="hp-stage__side hp-stage__side--l" src="/screens/revenue.webp" width="1600" height="1000" alt="" decoding="async" />
        <img className="hp-stage__side hp-stage__side--r" src="/screens/clients.webp" width="1600" height="1000" alt="" decoding="async" />

        <ScreenFrame
          src="/screens/pos.webp"
          alt="The Pointly point-of-sale screen: a selected customer with 1,845 loyalty points, the service and product catalogue, and a three-item cart totalling PKR 16,600"
        />
      </div>
    </section>
  )
}

// A screenshot in a slim app-window frame. Also used by the industry pages.
export function ScreenFrame({ src, alt }) {
  return (
    <figure className="hp-stage__main">
      <div className="hp-stage__bar" aria-hidden="true">
        <span className="hp-stage__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="hp-stage__live">
          <i />
          Posting live
        </span>
      </div>
      <img src={src} width="1600" height="1000" alt={alt} fetchPriority="high" decoding="async" />
    </figure>
  )
}
