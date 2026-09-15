import { useState } from 'react'
import { Plus } from './Icons.jsx'
import { FAQS } from '../data.js'

export default function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section className="section section--warm">
      <div className="shell">
        <div className="section-head">
          <div className="eyebrow">
            <span className="eyebrow__pill">
              <span className="eyebrow__dot" />
              Before the demo
            </span>
          </div>
          <h2>Questions we get asked first</h2>
        </div>

        <div className="faq">
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div className={`faq__item${isOpen ? ' faq__item--open' : ''}`} key={item.q}>
                <button
                  className="faq__q"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  {item.q}
                  <span className="faq__icon">
                    <Plus />
                  </span>
                </button>
                <div className="faq__a">
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
