// The hero product shot: the real POS screen (the same capture HomeScreens.jsx
// shows further down), in a slim browser frame that runs off the hero's
// bottom edge into the white floor.
export default function Till() {
  return (
    <figure className="hp-till">
      <div className="hp-till__bar">
        <span className="hp-till__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="hp-till__live">
          <i aria-hidden="true" />
          Posting live
        </span>
      </div>

      <img
        className="hp-till__shot"
        src="/screens/pos.webp"
        width="1600"
        height="1000"
        alt="The Pointly point-of-sale screen: a selected customer with 1,845 loyalty points, the service and product catalogue, and a three-item cart totalling PKR 16,600"
        fetchPriority="high"
        decoding="async"
      />
    </figure>
  )
}
