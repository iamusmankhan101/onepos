// Three things the counter does in one tap, each shown on a CSS-built phone.
// The figures follow the POS screenshot in the hero (Maryam Siddiqui, 1,845
// points, a PKR 16,600 cart) so the page tells one story end to end.

const RINGS = [0, 1, 2, 3, 4]

function Rings({ className }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true">
      {RINGS.map((i) => (
        <circle key={i} cx="200" cy="200" r={70 + i * 32} stroke="currentColor" strokeWidth="1" />
      ))}
    </svg>
  )
}

function StatusBar() {
  return (
    <div className="hp-phone__status" aria-hidden="true">
      <span>9:41</span>
      <span className="hp-phone__notch" />
      <span className="hp-phone__sys">
        <i />
        <i />
        <b />
      </span>
    </div>
  )
}

// Code 39-ish bars for the scanner viewfinder — decorative only.
const BARS = [3, 1, 1, 3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 1, 1, 3, 2, 1, 1, 2, 1, 3, 1, 1, 2, 1, 3, 1]

function ScanScreen() {
  return (
    <div className="hp-phone__screen">
      <StatusBar />
      <div className="hp-app__bar">
        <b>Scan item</b>
        <span className="hp-app__pill">Till 02</span>
      </div>
      <div className="hp-scan">
        <div className="hp-scan__bars" aria-hidden="true">
          {BARS.map((w, i) => (
            <i key={i} style={{ width: w * 2, opacity: i % 2 ? 0 : 1 }} />
          ))}
        </div>
        <span className="hp-scan__laser" aria-hidden="true" />
      </div>
      <div className="hp-scan__hit">
        <div>
          <b>Keune Care Shampoo 250ml</b>
          <small>Product · 24 left</small>
        </div>
        <span>2,600</span>
      </div>
      <div className="hp-app__btn">Added to cart · 3 items</div>
    </div>
  )
}

function ReceiptScreen() {
  return (
    <div className="hp-phone__screen hp-phone__screen--grey">
      <div className="hp-sent">
        <span className="hp-sent__tick" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <b>Receipt sent on WhatsApp</b>
        <small>Maryam will see it in her chat</small>
      </div>
      <div className="hp-sent__card">
        <p className="hp-sent__title">SI-2026-0148</p>
        <div className="hp-sent__row">
          Subtotal <span>16,600</span>
        </div>
        <div className="hp-sent__row">
          Points · 1,845 <span>-1,845</span>
        </div>
        <div className="hp-sent__row hp-sent__row--total">
          Paid · JazzCash <span>Rs 14,755</span>
        </div>
        <p className="hp-sent__note">Stock and profit already updated</p>
        <div className="hp-app__btn">Done</div>
      </div>
    </div>
  )
}

function LoyaltyScreen() {
  return (
    <div className="hp-phone__screen">
      <StatusBar />
      <div className="hp-app__bar hp-app__bar--center">
        <span aria-hidden="true">‹</span>
        <b>Loyalty Card</b>
        <span aria-hidden="true">⋮</span>
      </div>
      <div className="hp-lcard">
        <div className="hp-lcard__top">
          <small>Loyalty member</small>
          <span>🥇 Gold</span>
        </div>
        <p className="hp-lcard__pts">1,845</p>
        <small className="hp-lcard__sub">≈ Rs 1,845 to spend</small>
        <div className="hp-lcard__foot">
          <span>Maryam Siddiqui</span>
          <span>24 visits</span>
        </div>
      </div>
      <div className="hp-lstats">
        <div>
          <small>Earned</small>
          <b>3,760</b>
        </div>
        <div>
          <small>Redeemed</small>
          <b>1,915</b>
        </div>
        <div>
          <small>Spent</small>
          <b>184.5k</b>
        </div>
      </div>
      <div className="hp-lnext">
        <small>Platinum in</small>
        <b>1,240 pts</b>
        <span aria-hidden="true">
          <i style={{ width: '75%' }} />
        </span>
      </div>
    </div>
  )
}

const CARDS = [
  { title: ['Scan it,', 'it’s on the bill.'], Screen: ScanScreen, place: 'bottom' },
  { title: ['Their receipt, on WhatsApp', 'in a second.'], Screen: ReceiptScreen, place: 'top' },
  { title: ['Points that bring', 'them back.'], Screen: LoyaltyScreen, place: 'bottom' },
]

export default function HomeServices() {
  return (
    <section className="hp-svcWrap" id="services">
      <div className="hp-svc">
        <Rings className="hp-svc__arcs" />

        <h2 className="hp-svc__title hp-reveal">
          We Made The Counter <mark>Easier!</mark>
        </h2>

        <div className="hp-svc__grid">
          {CARDS.map(({ title, Screen, place }, i) => (
            <article
              className={`hp-svcCard hp-svcCard--${place} hp-reveal`}
              key={title[0]}
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <h3>
                {title[0]}
                <br />
                {title[1]}
              </h3>
              <div className="hp-svcCard__stage">
                <Rings className="hp-svcCard__rings" />
                <div className="hp-phone">
                  <Screen />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
