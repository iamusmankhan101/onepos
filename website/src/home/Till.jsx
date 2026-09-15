// CSS-built stand-in for the hero product shot. Swap for a real
// screenshot when one exists.
const LINES = [
  ['Chicken Karahi · full', 'Hot line', '2 × 1,450'],
  ['Garlic naan', 'Tandoor', '4 × 120'],
  ['Mint margarita', 'Bar', '2 × 390'],
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
            Subtotal <span>4,240</span>
          </div>
          <div className="hp-till__row">
            Sales tax 16% <span>678</span>
          </div>
          <div className="hp-till__total">
            <b>Due</b>
            <span>Rs 5,130</span>
          </div>
          <div className="hp-till__charge">Charge</div>
          <p className="hp-till__post">Posts to stock + ledger on settle</p>
        </div>
      </div>
    </div>
  )
}
