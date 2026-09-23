// CSS-built stand-in for the hero product shot — the real screens are further
// down the page in HomeScreens.jsx. Keep the figures here matching that POS
// screenshot so the two never contradict each other.
const LINES = [
  ['Root touch-up', 'Service · Hina', '1 × 5,500'],
  ['Hydra facial', 'Service · Ayesha', '1 × 8,500'],
  ['Care shampoo 250ml', 'Product · 24 left', '1 × 2,600'],
]

export default function Till() {
  return (
    <div className="hp-till">
      <div className="hp-till__bar">
        <span className="hp-till__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="hp-till__name">Clifton branch · Till 02</span>
        <span className="hp-till__live">
          <i aria-hidden="true" />
          Posting live
        </span>
      </div>

      <div className="hp-till__body">
        <div className="hp-till__lines">
          {LINES.map(([name, station, qty]) => (
            <div className="hp-till__line" key={name}>
              <div>
                <b>{name}</b>
                <small>{station}</small>
              </div>
              <span>{qty}</span>
            </div>
          ))}
        </div>

        <div className="hp-till__side">
          <div className="hp-till__row">
            Subtotal <span>16,600</span>
          </div>
          <div className="hp-till__row">
            Points · 1,845 <span>-1,845</span>
          </div>
          <div className="hp-till__total">
            <b>Due</b>
            <span>Rs 14,755</span>
          </div>
          <div className="hp-till__charge">Charge</div>
          <p className="hp-till__post">Stock, points and profit move on settle</p>
        </div>
      </div>
    </div>
  )
}
