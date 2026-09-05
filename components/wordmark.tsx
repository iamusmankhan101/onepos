/**
 * The Pointly logo.
 *
 * The supplied artwork (public/logo.png) is white on transparency, so it only
 * reads on a dark surface. `tone="dark"` swaps in the inverted copy for white
 * backgrounds — printed invoices, PDF reports.
 *
 * The brand lockup is the wordmark over the "powered by salon central" tagline.
 * That tagline is only legible from roughly 48px up, so `variant="mark"` serves
 * a wordmark-only crop for the small chrome — sidebar, admin header, document
 * footers — where the full lockup would render the tagline as a grey smudge.
 *
 * Every variant is trimmed of the transparent padding the original carried, so
 * `height` is the real rendered height and the width follows the artwork's ratio.
 */
export default function Wordmark({
  tone = "light",
  variant = "full",
  height = 34,
}: {
  tone?: "light" | "dark";
  variant?: "full" | "mark";
  height?: number;
}) {
  const src = variant === "mark"
    ? (tone === "light" ? "/logo-light-mark.png" : "/logo-dark-mark.png")
    : (tone === "light" ? "/logo-light.png" : "/logo-dark.png");

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Pointly"
      style={{ height, width: "auto", display: "block", userSelect: "none" }}
    />
  );
}
