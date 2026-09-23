import { FOOTER } from '../data.js'

export default function HomeFooter() {
  return (
    <footer className="hp-foot">
      <div className="hp-shell">
        <div className="hp-foot__top">
          <div>
            <a className="hp-nav__mark" href="#top" aria-label="Pointly, back to top">
              <img
                className="hp-lockup hp-lockup--foot"
                src="/pointly-lockup.png"
                width="965"
                height="362"
                alt="Pointly, powered by Salon Central"
              />
            </a>
            <p className="hp-foot__blurb">
              The point of sale for salons, clinics and shops across Pakistan. Selling, stock,
              clients and takings on one login.
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
          <span>© {new Date().getFullYear()} Pointly</span>
          <span>Karachi · Lahore · Islamabad</span>
        </div>
      </div>
    </footer>
  )
}
