# Pointly — marketing site

Landing page for Pointly (POS + inventory + accounting, Pakistan market).
Built with React 19 + Vite. Standalone from the product app in the repo root.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

Requires Node 20+ (Vite 7). If your default `node` is 18:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build
```

## Design

A dark hero on near-black, with a wide orange bloom rising off the bottom edge
and dissolving into the white feature canvas below it. Centred headline, two
pill CTAs, and glass stat cards floating over the glow. Below the fold:
a centred section head, a grid of soft-grey cards each holding a white chart
panel that runs off the card's bottom edge, then the module grid, a full-bleed
orange band, a closing CTA and a dark footer.

Tokens live at the top of `src/home.css`, scoped to `.hp`. The four
`--hp-grad-*` variables drive every gradient surface (buttons, hero bloom,
band, footer rule); `--hp-o*` is the orange ramp.

### The hero bloom

`.hp-hero__glow` is four stacked radial gradients — **the first layer paints on
top**, so it runs near-white at the core out through orange to a deep ember at
the edges — blurred and animated on a slow breathe. `.hp-hero__floor` is the
white gradient the bloom dissolves into.

The two are easy to get wrong together: if the floor is too tall, or the
bloom's core sits too low, the floor washes the orange out to grey-brown.
Keep the bloom's core (`at 50% 74–84%`) above where the floor starts
(currently the bottom 12%).

### Scoping

`src/home.css` is scoped under `.hp` and every class is `hp-` prefixed, so it
cannot collide with `src/index.css` (the previous landing page, still intact —
render `AppLegacy.jsx` from `main.jsx` to get it back). Element resets in
`home.css` are wrapped in `:where()` on purpose: written as `.hp a { … }` they
out-specify real single-class rules like `.hp-btn--dark`, which silently
reverts colours and margins.

## Structure

```
src/
  home.css             tokens + every homepage style
  home/
    Home.jsx           section order
    HomeHero.jsx       dark hero: nav, headline, CTAs, floating figures
    HomeNav.jsx        transparent over the hero, solid once scrolled
    Till.jsx           CSS-built till panel (swap for a real screenshot)
    Ripple.jsx         concentric line-art at the hero edges
    HomeFeatures.jsx   three cards with inline SVG/CSS charts
    HomeModules.jsx    six modules from data.js
    HomeBand.jsx       orange band + the one-bill-three-consequences receipt
    HomeClose.jsx      closing CTA
    HomeFooter.jsx     dark footer
    copy.js            homepage-specific copy
    useReveal.js       one IntersectionObserver for every .hp-reveal
  data.js              shared copy — modules, FAQs, industries, plans
  AppLegacy.jsx        the previous landing page, unchanged
```

## Notes

- `Till` and the chart panels in `HomeFeatures` are CSS/SVG stand-ins for real
  product screenshots. Replace them when screenshots exist.
- Copy, pricing and the stat figures are placeholders and should be checked
  before launch.
- All CTAs point at `#demo`. Wire them to the real booking flow.
- `public/gradient.*` and `public/pointly-lockup.png` are only used by the
  legacy page now; the current homepage ships no raster art.
