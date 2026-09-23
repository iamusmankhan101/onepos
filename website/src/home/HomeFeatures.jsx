const BARS = [
  { month: 'July', values: [46, 72], hot: 1 },
  { month: 'August', values: [52, 88], hot: 1 },
]

const BOARD_ROWS = [
  ['Gulberg · Lahore', [1, 1, 1, 1, 0]],
  ['Clifton · Karachi', [1, 1, 1, 0, 1]],
  ['F-7 · Islamabad', [1, 1, 0, 1, 1]],
  ['Saddar · Karachi', [1, 1, 1, 1, 0]],
  ['DHA · Lahore', [1, 0, 1, 1, 1]],
]

const RECEIPT_LINES = [
  ['Haircut & beard trim', '1', '1,800'],
  ['Keune shampoo 250ml', '2', '2,400'],
  ['Colour touch-up', '1', '3,500'],
]

// Code 39 element widths: n = narrow, w = wide; even positions are bars, odd are gaps.
const BARCODE = 'nwnnwnwnnwnnwnnnnwnnwwnnnnwnwnnwnwnnnwnnwnnwwnnnwnwnnwnnwnwnnwnwnn'

const TIERS = [
  ['Silver', 'Rs 25k spent · reached', 100],
  ['Gold', 'Rs 80k spent · reached', 100],
  ['Platinum', 'Rs 200k spent · 54% there', 54],
]

export default function HomeFeatures() {
  return (
    <section className="hp-sec" id="features">
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <h2>
            Everything The Counter Does
            <br />
            On One Screen
          </h2>
          <p>
            Ring up the sale, print the receipt, move the stock, credit the points and post the
            profit, from a single tap on a single login.
          </p>
        </div>

        <div className="hp-grid">
          {/* --- sales line chart --- */}
          <article className="hp-card hp-reveal">
            <h3>A sale takes one screen</h3>
            <p>
              Services and products in one cart. Scan a barcode, discount a line, split the payment
              across cash, card, JazzCash, EasyPaisa or Raast, or put it on credit.
            </p>

            <div className="hp-panel">
              <div className="hp-panel__top">
                <div>
                  <p className="hp-panel__k">Taken today · 84 sales</p>
                  <p className="hp-panel__v">Rs 287,650</p>
                </div>
                <span className="hp-panel__sel">Live</span>
              </div>

              <div className="hp-spark">
                <span className="hp-spark__tip">Busiest hour · 7pm</span>
                <svg viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-label="Sales through the day, peaking in the evening">
                  <defs>
                    <linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f2681f" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#f2681f" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 84 C 24 80, 40 62, 62 66 C 84 70, 92 86, 112 84 C 130 82, 138 24, 152 16 C 166 8, 176 62, 196 74 C 214 85, 226 58, 244 54 C 262 50, 272 74, 288 78 C 302 81, 312 72, 320 68"
                    fill="none"
                    stroke="#f2681f"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M0 84 C 24 80, 40 62, 62 66 C 84 70, 92 86, 112 84 C 130 82, 138 24, 152 16 C 166 8, 176 62, 196 74 C 214 85, 226 58, 244 54 C 262 50, 272 74, 288 78 C 302 81, 312 72, 320 68 L 320 110 L 0 110 Z"
                    fill="url(#hpFill)"
                    stroke="none"
                  />
                  <line x1="152" y1="16" x2="152" y2="110" stroke="#f2681f" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                  <circle cx="152" cy="16" r="4.5" fill="#fff" stroke="#f2681f" strokeWidth="2.5" />
                </svg>
              </div>
            </div>
          </article>

          {/* --- profit bar chart --- */}
          <article className="hp-card hp-reveal">
            <h3>Profit, not just takings</h3>
            <p>
              Log rent, salaries, utilities and supplies against the month they belong to. Revenue
              reports the difference, split by payment channel.
            </p>

            <div className="hp-panel">
              <div className="hp-panel__top">
                <div>
                  <p className="hp-panel__v" style={{ fontSize: '1rem' }}>
                    Income vs expenses
                  </p>
                  <p className="hp-panel__k">Last two months</p>
                </div>
                <span className="hp-panel__sel">
                  Monthly
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </div>

              <div className="hp-bars">
                {BARS.map((g) => (
                  <div className="hp-bars__grp" key={g.month}>
                    {g.values.map((v, i) => (
                      <span
                        key={i}
                        className={`hp-bars__b${i === g.hot ? ' hp-bars__b--hot' : ''}`}
                        style={{ height: `${v}%` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="hp-bars__x">
                {BARS.map((g) => (
                  <span key={g.month}>{g.month}</span>
                ))}
              </div>

              <p className="hp-panel__k" style={{ marginTop: 14 }}>
                Net profit in August
              </p>
              <p className="hp-panel__v">Rs 1,204,900</p>
            </div>
          </article>

          {/* --- receipt card --- */}
          <article className="hp-card hp-reveal">
            <h3>Receipt in their hand before they leave</h3>
            <p>
              An 80mm till roll with your logo and a scannable Code 39 number. Print it, send the PDF
              on WhatsApp, or fire it straight at a LAN thermal printer.
            </p>

            <div className="hp-panel">
              <div className="hp-rcpt">
                <div className="hp-rcpt__head">
                  <b>Invoice SI-2026-0148</b>
                  <span>Paid · Card</span>
                </div>

                {RECEIPT_LINES.map(([name, qty, amount]) => (
                  <div className="hp-rcpt__line" key={name}>
                    <span>{name}</span>
                    <i>×{qty}</i>
                    <b>{amount}</b>
                  </div>
                ))}

                <div className="hp-rcpt__total">
                  <span>Total</span>
                  <b>Rs 7,700</b>
                </div>

                <div className="hp-rcpt__code" aria-hidden="true">
                  {BARCODE.split('').map((c, i) => (
                    <i
                      key={i}
                      className={`${i % 2 === 0 ? 'bar' : ''}${c === 'w' ? ' wide' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div className="hp-tags">
                <span>Print</span>
                <span>WhatsApp</span>
                <span>PDF</span>
                <span>Thermal</span>
              </div>
            </div>
          </article>

          {/* --- loyalty card --- */}
          <article className="hp-card hp-reveal">
            <h3>Loyalty that runs itself</h3>
            <p>
              Points earn on every sale at the rate you set and redeem at the till. Tiers move on
              their own as lifetime spend crosses your thresholds.
            </p>

            <div className="hp-panel">
              <div className="hp-panel__top">
                <div>
                  <p className="hp-panel__k">Ayesha K. · 24 visits</p>
                  <p className="hp-panel__v">1,840 pts</p>
                </div>
                <span className="hp-panel__sel">Gold</span>
              </div>

              <div className="hp-tiers">
                {TIERS.map(([name, rule, pct]) => (
                  <div className="hp-tier" key={name}>
                    <div className="hp-tier__row">
                      <b>{name}</b>
                      <span>{rule}</span>
                    </div>
                    <div className="hp-tier__meter">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <p className="hp-panel__k" style={{ marginTop: 'auto', paddingTop: 16 }}>
                Redeemed at this counter this month
              </p>
              <p className="hp-panel__v" style={{ fontSize: '1.25rem' }}>
                Rs 62,400
              </p>
            </div>
          </article>

          {/* --- wide branches card --- */}
          <article className="hp-card hp-card--wide hp-reveal">
            <div className="hp-wide">
              <div className="hp-wide__copy">
                <h3>
                  Up To Twenty Branches
                  <br />
                  On One Login
                </h3>
                <p>
                  Each branch keeps its own stock, staff, clients and takings. Switch between them
                  without signing out, and pin a staff login to the branch they actually work at.
                </p>
              </div>

              <div className="hp-wide__art">
                <div className="hp-board">
                  <div className="hp-board__bar">
                    <b>Branch</b>
                    <span>POS</span>
                    <span>Stock</span>
                    <span>Staff</span>
                    <span>Reports</span>
                  </div>
                  {BOARD_ROWS.map(([name, cells]) => (
                    <div className="hp-board__row" key={name}>
                      <span className="hp-board__lbl">{name}</span>
                      {cells.map((c, i) => (
                        <i key={i} className={c ? (i === 0 ? 'hot' : 'on') : ''} />
                      ))}
                    </div>
                  ))}
                </div>

                <div className="hp-pop">
                  <p className="hp-pop__k">Offline queue</p>
                  <p className="hp-pop__v">
                    Synced <small>a moment ago</small>
                  </p>
                  <div className="hp-pop__meter" aria-hidden="true">
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
