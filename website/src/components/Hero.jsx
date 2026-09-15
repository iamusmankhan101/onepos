import ProductMock from './ProductMock.jsx'
import { Arrow, Play } from './Icons.jsx'

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero__glow" />
      <div className="hero__scrim" />
      <div className="hero__grid" />

      <div className="shell">
        <div className="eyebrow">
          <span className="eyebrow__pill">
            <span className="eyebrow__dot" />
            POS · Inventory · Accounting
          </span>
        </div>

        <h1 className="hero__title">
          <span className="hero__titleLead">Stop syncing software.</span> Run your checkout,
          inventory, and accounting in <em>one place</em>.
        </h1>

        <p className="hero__sub">
          Pointly connects your front counter straight to your general ledger. Automate daily sales
          posting, stock adjustments, and tax compliance without manual entry. Built for
          multi-location restaurants, cafes, retail stores, auto centers and clinics in Pakistan.
        </p>

        <div className="hero__cta">
          <a className="btn btn--primary btn--lg" href="#demo">
            Book a demo
            <Arrow className="btn__arrow" />
          </a>
          <a className="btn btn--ghost btn--lg" href="#platform">
            <Play />
            Watch 3-min tour
          </a>
        </div>

        <p className="hero__note">No card required · Live in 48 hours · FBR POS integrated</p>

        <div className="hero__stage">
          <div className="hero__stageGlow" />
          <ProductMock />
          <div className="hero__fade" />
        </div>
      </div>
    </section>
  )
}
