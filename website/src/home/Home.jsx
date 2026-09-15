import HomeHero from './HomeHero.jsx'
import HomeFeatures from './HomeFeatures.jsx'
import HomeModules from './HomeModules.jsx'
import HomeBand from './HomeBand.jsx'
import HomeClose from './HomeClose.jsx'
import HomeFooter from './HomeFooter.jsx'
import { useReveal } from './useReveal.js'
import '../home.css'

export default function Home() {
  useReveal()

  return (
    <div className="hp">
      <main>
        <HomeHero />
        <HomeFeatures />
        <HomeModules />
        <HomeBand />
        <HomeClose />
      </main>
      <HomeFooter />
    </div>
  )
}
