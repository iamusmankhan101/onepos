const SIDE = [
  {
    label: 'Counter',
    items: [
      ['Billing', true],
      ['Tickets', false],
      ['Day close', false],
    ],
  },
  {
    label: 'Back office',
    items: [
      ['Inventory', false],
      ['Purchase', false],
      ['Ledgers', false],
      ['Reports', false],
    ],
  },
]

const BARS = [38, 52, 44, 68, 58, 82, 71, 94, 76, 88, 62, 79]

/**
 * A CSS-built stand-in for the product screenshot. `compact` drops the
 * chart panel so it sits comfortably beside the industry copy.
 */
export default function ProductMock({
  url = 'app.pointly.pk/dashboard',
  title = 'Today at the counter',
  meta = 'Clifton branch · 6 Sep',
  kpis = [
    ['Sales today', 'Rs 486,200', '+14.2%'],
    ['Bills', '318', '+26'],
    ['Avg. ticket', 'Rs 1,529', '+3.1%'],
  ],
  rows = [
    ['Chicken Karahi ×2', 'Table 12 · settled', 'Rs 2,480'],
    ['Zinger Burger ×4', 'Takeaway · card', 'Rs 3,160'],
    ['Family Deal', 'Foodpanda · online', 'Rs 4,750'],
    ['Cold drinks ×6', 'Table 07 · cash', 'Rs 720'],
  ],
  compact = false,
}) {
  return (
    <div className="mock">
      <div className="mock__bar">
        <div className="mock__dots">
          <i />
          <i />
          <i />
        </div>
        <span className="mock__url">{url}</span>
      </div>

      <div className="mock__body">
        <aside className="mock__side">
          {SIDE.map((group) => (
            <div className="mock__sideGroup" key={group.label}>
              <div className="mock__sideLabel">{group.label}</div>
              {group.items.map(([name, on]) => (
                <div className={`mock__navItem${on ? ' mock__navItem--on' : ''}`} key={name}>
                  <i />
                  {name}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="mock__main">
          <div className="mock__mainHead">
            <h4>{title}</h4>
            <span>{meta}</span>
          </div>

          <div className="mock__kpis">
            {kpis.map(([label, value, delta], i) => (
              <div className="mock__kpi" key={label}>
                <small>{label}</small>
                <b>{value}</b>
                <span className={`mock__delta${i === 2 ? ' mock__delta--warm' : ''}`}>{delta}</span>
              </div>
            ))}
          </div>

          <div className="mock__split" style={compact ? { gridTemplateColumns: '1fr' } : undefined}>
            {!compact && (
              <div className="mock__panel">
                <div className="mock__panelHead">
                  <b>Hourly sales</b>
                  <span>10am – 10pm</span>
                </div>
                <div className="mock__chart">
                  {BARS.map((h, i) => (
                    <i key={i} className={i > 6 ? 'on' : ''} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            )}

            <div className="mock__panel">
              <div className="mock__panelHead">
                <b>Recent activity</b>
                <span>live</span>
              </div>
              <div className="mock__rows">
                {rows.map(([name, sub, amount]) => (
                  <div className="mock__row" key={name}>
                    <i />
                    <div>
                      <strong>{name}</strong>
                      <small>{sub}</small>
                    </div>
                    <b>{amount}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
