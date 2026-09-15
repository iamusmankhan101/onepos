import { FOOTER } from '../data.js'

export default function HomeFooter() {
  return (
    <footer className="hp-foot">
      <div className="hp-shell">
        <div className="hp-foot__top">
          <div>
            <a className="hp-nav__mark" href="#top">
              <span className="hp-nav__badge" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L12 7l6 11" />
                </svg>
              </span>
              Pointly
            </a>
            <p className="hp-foot__blurb">
              POS, inventory and accounting on one ledger — for restaurant groups, salon chains and
              clinics across Pakistan.
            </p>
          </div>

          {FOOTER.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#top">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hp-foot__rule" aria-hidden="true" />

        <div className="hp-foot__base">
          <span>© {new Date().getFullYear()} Pointly · Powered by Salon Central</span>
          <span>Karachi · Lahore · Islamabad</span>
        </div>
      </div>
    </footer>
  )
}
