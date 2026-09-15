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
