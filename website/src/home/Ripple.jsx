// Concentric line-art used as a quiet decoration at the hero edges.
const RINGS = [0, 1, 2, 3, 4, 5, 6, 7]

export default function Ripple({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 260" fill="none" aria-hidden="true">
      {RINGS.map((i) => (
        <path
          key={i}
          d={`M ${18 + i * 11} 20
              C ${100 + i * 8} ${34 + i * 4}, ${150 + i * 6} ${96 - i * 2}, ${150 + i * 6} 130
              C ${150 + i * 6} ${164 + i * 2}, ${100 + i * 8} ${226 - i * 4}, ${18 + i * 11} 240`}
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
