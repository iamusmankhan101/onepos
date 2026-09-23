const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

export const Arrow = (p) => (
  <svg {...base} {...p} width="15" height="15">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const Check = (p) => (
  <svg {...base} {...p} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

export const Plus = (p) => (
  <svg {...base} {...p} width="12" height="12" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Play = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
)

const glyphs = {
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  box: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 8.3-8 9.5C7.2 20.3 4 16.5 4 12V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  ledger: (
    <>
      <path d="M5 4h13a1 1 0 011 1v15a1 1 0 01-1 1H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M8 8h7M8 12h7M8 16h4" />
    </>
  ),
  trail: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M6 9.5V15a3 3 0 003 3h6" />
    </>
  ),
  star: (
    <>
      <path d="M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8L12 3.6z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.1 2.7-5 6-5s6 1.9 6 5" />
      <path d="M16.5 5.4a3.2 3.2 0 010 5.4M18 19c0-2.4-.8-3.9-2-4.8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16V11M12.5 16V7M17 16v-6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2.2-1.6L13.6 21l-2.2-1.6L9.2 21 7 19.4 6 21V3z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v9a1 1 0 001 1h14a1 1 0 001-1v-9" />
      <path d="M3.5 10l1.6-5.3A1 1 0 016.1 4h11.8a1 1 0 011 .7l1.6 5.3a3 3 0 01-5.5 2 3 3 0 01-5 0 3 3 0 01-5.5-2z" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18h10a4 4 0 00.6-8A5.5 5.5 0 006.6 11 3.5 3.5 0 007 18z" />
      <path d="M12 9.5v5M9.8 12.4L12 14.6l2.2-2.2" />
    </>
  ),
  api: (
    <>
      <path d="M9 4H6a2 2 0 00-2 2v3M15 4h3a2 2 0 012 2v3M9 20H6a2 2 0 01-2-2v-3M15 20h3a2 2 0 002-2v-3" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
}

export const FeatureIcon = ({ name }) => (
  <svg {...base} width="19" height="19">
    {glyphs[name]}
  </svg>
)
