import { NARRATIVE } from '../data.js'

export default function Narrative() {
  return (
    <section className="section section--warm" id="platform">
      <div className="shell">
        <div className="section-head">
          <div className="eyebrow">
            <span className="eyebrow__pill">
              <span className="eyebrow__dot" />
              How it changes the month
            </span>
          </div>
          <h2>One ledger, from the first bill to the filed return</h2>
          <p>
            Most back offices are three systems pretending to agree. Pointly collapses them into a
            single chain of documents.
          </p>
        </div>

        <div className="narrative">
          {NARRATIVE.map((n) => (
            <article className="narrative__card" key={n.num}>
              <div className="narrative__num">
                {n.num} / {n.kicker.toUpperCase()}
              </div>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
