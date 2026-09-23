import { PLANS, whatsAppLink } from './copy.js'
import { Arrow, Check } from '../components/Icons.jsx'

export default function HomePricing() {
  return (
    <section className="hp-sec" id="pricing">
      <div className="hp-shell">
        <div className="hp-head hp-reveal">
          <p className="hp-label">Pricing</p>
          <h2 style={{ marginTop: 12 }}>Three plans. No surprises.</h2>
          <p>
            Every plan runs the counter in full. What changes above Basic is loyalty, and then how
            many branches you run.
          </p>
        </div>

        <div className="hp-plans">
          {PLANS.map((plan, i) => (
            <article
              className={`hp-plan hp-reveal${plan.featured ? ' hp-plan--hot' : ''}`}
              key={plan.id}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <header className="hp-plan__top">
                <h3>{plan.name}</h3>
                <p className="hp-plan__blurb">{plan.blurb}</p>

                <p className="hp-plan__price">
                  <small>PKR</small>
                  {plan.price}
                  <span>/month</span>
                </p>
              </header>

              <a
                className={`hp-btn hp-btn--lg hp-plan__cta ${plan.featured ? 'hp-btn--white' : 'hp-btn--orange'}`}
                href={whatsAppLink(
                  `Hi Pointly, I'd like to get started on the ${plan.name} plan (PKR ${plan.price}/month).`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                {plan.cta}
                <Arrow />
              </a>

              <p className="hp-plan__lead">{plan.lead}</p>
              <ul className="hp-plan__list">
                {plan.points.map((point) => (
                  <li key={point}>
                    <span className="hp-plan__tick" aria-hidden="true">
                      <Check width="11" height="11" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="hp-plans__foot hp-reveal">
          Prices are per month in Pakistani rupees. Every plan includes offline selling, receipts,
          reports and cloud backup.
        </p>
      </div>
    </section>
  )
}
