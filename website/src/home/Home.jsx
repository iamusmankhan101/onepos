import HomeNav from './HomeNav.jsx'
import HomeHero from './HomeHero.jsx'
import HomeFeatures from './HomeFeatures.jsx'
import HomeServices from './HomeServices.jsx'
import HomeModules from './HomeModules.jsx'
import HomeScreens from './HomeScreens.jsx'
import HomePricing from './HomePricing.jsx'
import HomeBand from './HomeBand.jsx'
import HomeFooter from './HomeFooter.jsx'
import { useReveal } from './useReveal.js'
import '../home.css'

export default function Home() {
  useReveal()

  return (
    <div className="hp">
      <HomeNav />
      <main>
        <HomeHero />
        <HomeFeatures />
        <HomeServices />
        <HomeModules />
        <HomeScreens />
        <HomePricing />
        <HomeBand />
      </main>
      <HomeFooter />
    </div>
  )
}
