import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import IndustryPage from './home/IndustryPage.jsx'
import { INDUSTRY_PAGES } from './home/industries.js'

// Industry pages are their own index.html (see vite.config.js) with the slug on #root.
const root = document.getElementById('root')
const industry = INDUSTRY_PAGES.find((p) => p.slug === root.dataset.industry)

createRoot(root).render(
  <StrictMode>{industry ? <IndustryPage page={industry} /> : <App />}</StrictMode>,
)
