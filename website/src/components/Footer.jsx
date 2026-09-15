import { FOOTER } from '../data.js'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer__top">
          <div>
            <a className="logo" href="#top" aria-label="Pointly, powered by Salon Central">
              <img src="/pointly-lockup.png" alt="Pointly" />
            </a>
            <p className="footer__blurb">
              POS, inventory and accounting on one ledger — for operators who would rather trade than
              reconcile.
            </p>
            <div className="footer__cities">Karachi · Lahore · Islamabad</div>
          </div>

          {FOOTER.map((col) => (
            <div className="footer__col" key={col.title}>
              <h4>{col.title}</h4>
              {col.links.map((l) => (
                <a href="#top" key={l}>
                  {l}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Pointly Systems. All rights reserved.</span>
          <span>support@pointly.pk · +92 21 3456 7000</span>
        </div>
      </div>
    </footer>
  )
}
