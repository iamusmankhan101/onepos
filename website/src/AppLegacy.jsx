import './index.css'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Marquee from './components/Marquee.jsx'
import Narrative from './components/Narrative.jsx'
import Industries from './components/Industries.jsx'
import Features from './components/Features.jsx'
import Pricing from './components/Pricing.jsx'
import Faq from './components/Faq.jsx'
import Cta from './components/Cta.jsx'
import Footer from './components/Footer.jsx'

// The original landing page, kept intact. Render this from main.jsx to go back to it.
export default function AppLegacy() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Narrative />
        <Industries />
        <Features />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  )
}
