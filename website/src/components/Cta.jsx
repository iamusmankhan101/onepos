import { Arrow } from './Icons.jsx'

export default function Cta() {
  return (
    <section className="section" id="demo">
      <div className="shell">
        <div className="cta">
          <h2>Close your next month in an afternoon.</h2>
          <p>
            Bring one outlet&rsquo;s data. In 45 minutes we&rsquo;ll load your catalogue and show you
            its closing balance live — not a slide deck.
          </p>
          <div className="cta__actions">
            <a className="btn btn--onOrange btn--lg" href="#demo">
              Book a demo
              <Arrow className="btn__arrow" />
            </a>
            <a className="btn btn--onOrangeGhost btn--lg" href="#demo">
              Download the buyer&rsquo;s guide
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
