import HomeNav from './HomeNav.jsx'
import { ScreenFrame } from './HomeHero.jsx'
import { trackGlow } from './HomeModules.jsx'
import HomePricing from './HomePricing.jsx'
import HomeBand from './HomeBand.jsx'
import HomeFooter from './HomeFooter.jsx'
import { FeatureIcon, Arrow } from '../components/Icons.jsx'
import { whatsAppLink } from './copy.js'
import { useReveal } from './useReveal.js'
import '../home.css'

// /restaurants/, /coffee-shops/ and the rest: the homepage hero and sections,
// with the copy and screenshot of one entry from industries.js.
export default function IndustryPage({ page }) {
  useReveal()

  return (
    <div className="hp">
      <HomeNav />
      <main>
        <section className="hp-hero" id="top">
          <p className="hp-label hp-hero__eyebrow">{page.eyebrow}</p>
          <h1 className="hp-hero__title">
            {page.title} <br />
            <em>{page.em}</em>
          </h1>
          <p className="hp-hero__sub">{page.sub}</p>

          <div className="hp-hero__cta">
            <a
              className="hp-btn hp-btn--orange hp-btn--lg"
              href={whatsAppLink(`Hi Pointly, I run a business (${page.label}). Can you show me the app?`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Started
              <Arrow />
            </a>
            <a className="hp-btn hp-btn--line hp-btn--lg" href="#features">
              See Features
            </a>
          </div>

          <div className="hp-stage hp-stage--solo">
            <ScreenFrame src={page.screen.src} alt={page.screen.alt} />
          </div>
        </section>

        <section className="hp-sec" id="features">
          <div className="hp-shell">
            <div className="hp-head hp-reveal">
              <p className="hp-label">{page.eyebrow}</p>
              <h2 style={{ marginTop: 12 }}>What Pointly handles for you</h2>
            </div>

            <div className="hp-mods">
              {page.points.map((f, i) => (
                <article
                  className="hp-mod hp-reveal"
                  key={f.title}
                  style={{ transitionDelay: `${(i % 3) * 80}ms` }}
                  onPointerMove={trackGlow}
                >
                  <div className="hp-mod__top">
                    <div className="hp-mod__icon">
                      <FeatureIcon name={f.icon} />
                    </div>
                    <span className="hp-mod__num">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <HomePricing />
        <HomeBand />
      </main>
      <HomeFooter />
    </div>
  )
}
