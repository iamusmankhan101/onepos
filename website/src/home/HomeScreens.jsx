import { useState } from 'react'

// Real screenshots of the running app, captured at 1440x900 on a demo account.
const SCREENS = [
  {
    id: 'pos',
    tab: 'Point of sale',
    title: 'The till',
    body: 'Customer on the left, catalogue in the middle, cart on the right. Scan a barcode, stack two discounts, spend loyalty points and settle, all without leaving the screen.',
    src: '/screens/pos.webp',
  },
  {
    id: 'products',
    tab: 'Products',
    title: 'Stock that tells you first',
    body: 'Cost and retail price, supplier, barcode and units per item. Low and out-of-stock rows flag themselves and collect into a restock list you can send on WhatsApp.',
    src: '/screens/products.webp',
  },
  {
    id: 'invoices',
    tab: 'Invoices',
    title: 'Every sale, filed',
    body: 'Each settle becomes a numbered invoice with its client, staff member, payment method and status. Search it, reprint it, or send the PDF again.',
    src: '/screens/invoices.webp',
  },
  {
    id: 'revenue',
    tab: 'Revenue',
    title: 'What the day actually made',
    body: 'Takings, transaction count and average ticket over any period, with the day broken down line by line and the whole report exportable as a PDF.',
    src: '/screens/revenue.webp',
  },
  {
    id: 'cashflow',
    tab: 'Cash flow',
    title: 'Cash and online, side by side',
    body: 'Income against expenses for the month, split into what came in as cash and what came through card, bank and mobile wallets. Pending bills are counted separately.',
    src: '/screens/cashflow.webp',
  },
  {
    id: 'clients',
    tab: 'Clients',
    title: 'Who keeps coming back',
    body: 'Visit count, lifetime spend, loyalty points and notes on every customer, with their whole history one tap from the billing screen.',
    src: '/screens/clients.webp',
  },
]

export default function HomeScreens() {
  const [active, setActive] = useState(0)
  const screen = SCREENS[active]

  return (
    <section className="hp-sec" id="screens">
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <p className="hp-label">The software</p>
          <h2 style={{ marginTop: 12 }}>Not a mockup. This is the app.</h2>
          <p>
            Six screens your counter lives in, exactly as they ship. No slide deck, no artist's
            impression.
          </p>
        </div>

        <div className="hp-shots hp-reveal">
          <div className="hp-shots__tabs" role="tablist" aria-label="App screens">
            {SCREENS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                id={`shot-tab-${s.id}`}
                aria-selected={i === active}
                aria-controls={`shot-panel-${s.id}`}
                className={`hp-shots__tab${i === active ? ' is-on' : ''}`}
                onClick={() => setActive(i)}
              >
                {s.tab}
              </button>
            ))}
          </div>

          <div
            className="hp-shots__stage"
            role="tabpanel"
            id={`shot-panel-${screen.id}`}
            aria-labelledby={`shot-tab-${screen.id}`}
          >
            <div className="hp-shots__frame">
              <div className="hp-shots__bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>pointly.app/dashboard/{screen.id === 'cashflow' ? 'cash-flow' : screen.id}</span>
              </div>
              <img
                key={screen.id}
                className="hp-shots__img"
                src={screen.src}
                width="1600"
                height="1000"
                alt={`Pointly ${screen.tab} screen`}
                loading="lazy"
                decoding="async"
              />
            </div>

            <div className="hp-shots__cap">
              <h3>{screen.title}</h3>
              <p>{screen.body}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
