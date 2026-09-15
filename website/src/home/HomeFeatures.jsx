const BARS = [
  { month: 'September', values: [42, 64], hot: 1 },
  { month: 'December', values: [58, 88], hot: 1 },
]

const BOARD_ROWS = [
  ['Gulberg · Lahore', [1, 1, 0, 1, 0]],
  ['Clifton · Karachi', [1, 1, 1, 0, 0]],
  ['F-7 · Islamabad', [1, 0, 1, 1, 1]],
  ['Saddar · Karachi', [1, 1, 0, 0, 1]],
  ['DHA · Lahore', [1, 0, 0, 1, 0]],
]

export default function HomeFeatures() {
  return (
    <section className="hp-sec" id="features">
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <h2>
            Powerful Features
            <br />
            Built For Smarter Retail
          </h2>
          <p>
            Everything you need to bill, stock and reconcile — securely and efficiently — from one
            platform.
          </p>
        </div>

        <div className="hp-grid">
          {/* --- sales line chart --- */}
          <article className="hp-card hp-reveal">
            <h3>Innovative Counter Tools</h3>
            <p>Modern tools that make the day's decisions obvious, not arithmetic.</p>

            <div className="hp-panel">
              <div className="hp-panel__top">
                <div>
                  <p className="hp-panel__k">Sold this day</p>
                  <p className="hp-panel__v">Rs 287,650</p>
                </div>
              </div>

              <div className="hp-spark">
                <span className="hp-spark__tip">89.75%</span>
                <svg viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-label="Daily sales trend, peaking mid-month">
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

          {/* --- outlet bar chart --- */}
          <article className="hp-card hp-reveal">
            <h3>Scalable Infrastructure</h3>
            <p>Built to hold growing transaction volumes without losing a beat at the counter.</p>

            <div className="hp-panel">
              <div className="hp-panel__top">
                <div>
                  <p className="hp-panel__v" style={{ fontSize: '1rem' }}>
                    Sales Statistics
                  </p>
                  <p className="hp-panel__k">Updated 1 day ago</p>
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
                Bills
              </p>
              <p className="hp-panel__v">26,954</p>
            </div>
          </article>

          {/* --- wide insight card --- */}
          <article className="hp-card hp-card--wide hp-reveal">
            <div className="hp-wide">
              <div className="hp-wide__copy">
                <h3>
                  Insights That Drive Better
                  <br />
                  Decisions &amp; Smarter Choices
                </h3>
                <p>Clear, data-backed reporting across every outlet.</p>
              </div>

              <div className="hp-wide__art">
                <div className="hp-board">
                  <div className="hp-board__bar">
                    <b>Outlets</b>
                    <span>Sales</span>
                    <span>Stock</span>
                    <span>Ledger</span>
                    <span>Tax</span>
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
                  <p className="hp-pop__k">Active tills</p>
                  <p className="hp-pop__v">
                    258 <small>right now</small>
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
