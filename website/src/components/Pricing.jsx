import { useState } from 'react'
import { Check, Arrow } from './Icons.jsx'
import { PLANS } from '../data.js'

export default function Pricing() {
  const [annual, setAnnual] = useState(true)

  return (
    <section className="section" id="pricing">
      <div className="shell">
        <div className="section-head">
          <div className="eyebrow">
            <span className="eyebrow__pill">
              <span className="eyebrow__dot" />
              Pricing
            </span>
          </div>
          <h2>Per outlet, per month</h2>
          <p>Every plan includes onboarding, data migration and free read-only auditor logins.</p>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
            <div className="toggle" role="group" aria-label="Billing period">
              <button className={annual ? '' : 'on'} onClick={() => setAnnual(false)}>
                Monthly
              </button>
              <button className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>
                Annual
                <span className="toggle__save">Save 20%</span>
              </button>
            </div>
          </div>
        </div>

        <div className="plans">
          {PLANS.map((plan) => (
            <article
              className={`plan${plan.featured ? ' plan--featured' : ''}`}
              key={plan.name}
            >
              {plan.tag && <span className="plan__tag">{plan.tag}</span>}

              <div className="plan__name">{plan.name}</div>
              <div className="plan__desc">{plan.desc}</div>

              <div className="plan__price">
                <b>Rs {(annual ? plan.annual : plan.monthly).toLocaleString('en-PK')}</b>
                <span>/ mo</span>
              </div>
              <div className="plan__meta">
                per outlet · billed {annual ? 'annually' : 'monthly'}
              </div>

              <ul className="plan__list">
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                className={`btn ${plan.featured ? 'btn--onOrange' : 'btn--ink'}`}
                href="#demo"
              >
                {plan.cta}
                <Arrow className="btn__arrow" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
