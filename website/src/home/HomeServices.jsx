// The Features section's opening: five features, each on a CSS-built phone,
// in a strip that scrolls without end. The figures follow the POS screenshot in
// the hero (Maryam Siddiqui, 1,845 points, a PKR 16,600 cart) and the Revenue
// screenshot further down, so the page tells one story end to end.

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

function Row({ label, value, tone, dot }) {
  return (
    <div className={`hp-mrow${tone ? ` hp-mrow--${tone}` : ''}`}>
      <span>
        {dot && <i style={{ background: dot }} />}
        {label}
      </span>
      <b>{value}</b>
    </div>
  )
}

// Every screen works both ways up: rising from the card's bottom edge (status
// bar showing) or hung from its top edge (status bar hidden, content sitting
// at the bottom of the glass). See .hp-svcCard--top in home.css.

function SaleScreen() {
  return (
    <div className="hp-phone__screen hp-phone__screen--grey">
      <StatusBar />
      <div className="hp-sent__card">
        <p className="hp-mhead">
          Checkout <span>3 items</span>
        </p>
        <p className="hp-mbig">Rs 14,755</p>
        <Row label="Cash" value="5,000" dot="#16a34a" />
        <Row label="JazzCash" value="6,755" dot="#dc2626" />
        <Row label="Card" value="3,000" dot="#2563eb" />
        <Row label="Remaining" value="0" tone="total" />
        <div className="hp-mchips">
          <span>EasyPaisa</span>
          <span>Raast</span>
          <span>Credit</span>
        </div>
        <div className="hp-app__btn">Settle sale</div>
      </div>
    </div>
  )
}

const MONTHS = [
  ['July', 46, 72],
  ['August', 52, 88],
]

function ProfitScreen() {
  return (
    <div className="hp-phone__screen">
      <StatusBar />
      <div className="hp-app__bar">
        <b>Income vs expenses</b>
        <span className="hp-app__pill">Monthly</span>
      </div>
      <div className="hp-mbars" aria-hidden="true">
        {MONTHS.map(([month, spend, income]) => (
          <div className="hp-mbars__grp" key={month}>
            <i style={{ height: `${spend}%` }} />
            <i className="hot" style={{ height: `${income}%` }} />
            <small>{month}</small>
          </div>
        ))}
      </div>
      <Row label="Income" value="1,812,400" />
      <Row label="Expenses" value="607,500" />
      <Row label="Net profit · Aug" value="Rs 1,204,900" tone="good" />
    </div>
  )
}

function ReceiptScreen() {
  return (
    <div className="hp-phone__screen hp-phone__screen--grey">
      <StatusBar />
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
        <Row label="Subtotal" value="16,600" />
        <Row label="Points · 1,845" value="-1,845" />
        <Row label="Paid · JazzCash" value="Rs 14,755" tone="total" />
        <div className="hp-mchips">
          <span>Print</span>
          <span>PDF</span>
          <span>Thermal</span>
        </div>
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

const BRANCHES = [
  ['Clifton · Karachi', 'Rs 47,250', true],
  ['Gulberg · Lahore', 'Rs 38,900', false],
  ['F-7 · Islamabad', 'Rs 29,400', false],
]

function BranchScreen() {
  return (
    <div className="hp-phone__screen hp-phone__screen--grey">
      <StatusBar />
      <div className="hp-sent__card">
        <p className="hp-mhead">
          Switch branch <span>3 of 20</span>
        </p>
        {BRANCHES.map(([name, today, on]) => (
          <div className={`hp-mbranch${on ? ' is-on' : ''}`} key={name}>
            <i aria-hidden="true" />
            <div>
              <b>{name}</b>
              <small>Today {today}</small>
            </div>
          </div>
        ))}
        <p className="hp-sent__note">Stock, staff and clients stay separate</p>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    title: ['A sale takes', 'one screen'],
    body: 'Scan, discount a line, then split across cash, card, JazzCash, EasyPaisa or Raast, or put it on credit.',
    Screen: SaleScreen,
  },
  {
    title: ['Profit, not', 'just takings'],
    body: 'Rent, salaries and supplies logged against their month. Revenue reports the difference.',
    Screen: ProfitScreen,
  },
  {
    title: ['Receipt in their hand', 'before they leave'],
    body: 'An 80mm till roll with your logo. Print it, or send the PDF on WhatsApp.',
    Screen: ReceiptScreen,
  },
  {
    title: ['Loyalty that', 'runs itself'],
    body: 'Points earn on every sale and redeem at the till. Tiers move up on their own.',
    Screen: LoyaltyScreen,
  },
  {
    title: ['Up To Twenty Branches', 'On One Login'],
    body: 'Each branch keeps its own stock, staff and takings. Switch without signing out.',
    Screen: BranchScreen,
  },
]

// One loop is the features twice over, alternating bottom/top by position.
// With an odd number of features that puts each one in both orientations, and
// an even-length loop keeps the alternation unbroken across the seam.
const LOOP = [...FEATURES, ...FEATURES].map((f, i) => ({
  ...f,
  place: i % 2 ? 'top' : 'bottom',
  repeat: i >= FEATURES.length,
}))

function Card({ title, body, Screen, place, hidden }) {
  return (
    <article className={`hp-svcCard hp-svcCard--${place}`} aria-hidden={hidden || undefined}>
      <div className="hp-svcCard__copy">
        <h3>
          {title[0]}
          <br />
          {title[1]}
        </h3>
        <p>{body}</p>
      </div>
      <div className="hp-svcCard__stage">
        <Rings className="hp-svcCard__rings" />
        <div className="hp-phone">
          <Screen />
        </div>
      </div>
    </article>
  )
}

// The dark opening block of the Features section: its heading (passed in as
// children) over the strip. The strip is rendered twice and slid by exactly one
// copy's width, so the loop never jumps. Only the first pass through the five
// features is exposed to assistive tech; every repeat is aria-hidden.
export default function HomeServices({ children }) {
  return (
    <div className="hp-svcWrap">
      <div className="hp-svc">
        <Rings className="hp-svc__arcs" />

        <div className="hp-svc__head hp-reveal">{children}</div>

        <div className="hp-svc__rail hp-reveal">
          <div className="hp-svc__track">
            {[0, 1].map((copy) => (
              <div className="hp-svc__set" key={copy}>
                {LOOP.map((c, i) => (
                  <Card key={i} {...c} hidden={copy > 0 || c.repeat} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
