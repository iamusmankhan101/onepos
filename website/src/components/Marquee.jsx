import { LOGOS } from '../data.js'

export default function Marquee() {
  const track = [...LOGOS, ...LOGOS]
  return (
    <section className="marquee" id="customers">
      <p className="marquee__cap">Trusted by operators running 4,800+ outlets across Pakistan</p>
      <div className="marquee__viewport">
        <div className="marquee__track">
          {track.map((name, i) => (
            <span className="chip" key={`${name}-${i}`} aria-hidden={i >= LOGOS.length}>
              <i />
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
