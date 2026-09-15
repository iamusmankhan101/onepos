import { Arrow } from '../components/Icons.jsx'

export default function HomeClose() {
  return (
    <section className="hp-sec hp-close" id="demo">
      <div className="hp-close__wash" aria-hidden="true" />
      <div className="hp-shell">
        <h2 className="hp-reveal">Close the month in an afternoon</h2>
        <p className="hp-reveal">
          Thirty minutes on a call, your own catalogue loaded, and a till you can bill from the same
          day. Bring last month's numbers — we'll close them in front of you.
        </p>
        <div className="hp-close__cta hp-reveal">
          <a className="hp-btn hp-btn--orange hp-btn--lg" href="#demo">
            Get Started
            <Arrow />
          </a>
          <a className="hp-btn hp-btn--line hp-btn--lg" href="#pricing">
            See pricing
          </a>
        </div>
      </div>
    </section>
  )
}
