import { FOOTER, FEATURES } from '../data.js'
import { INDUSTRY_PAGES } from './industries.js'

// Features lists the homepage's module grid, Industries links to the industry
// pages, and Company still points home.
const COLUMNS = [
  { title: 'Features', links: FEATURES.map((f) => ({ label: f.title, href: '/#platform' })) },
  { title: 'Industries', links: INDUSTRY_PAGES.map((p) => ({ label: p.label, href: `/${p.slug}/` })) },
  ...FOOTER.filter((col) => col.title === 'Company').map((col) => ({
    title: col.title,
    links: col.links.map((label) => ({ label, href: '/' })),
  })),
]

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

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href}>{l.label}</a>
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
