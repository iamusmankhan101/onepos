/**
 * The Pointly logo.
 *
 * The supplied artwork (public/logo.png) is white on transparency, so it only
 * reads on a dark surface. `tone="dark"` swaps in the inverted copy for white
 * backgrounds — printed invoices, PDF reports. Both variants are trimmed of
 * the transparent padding the original carried, so `height` is the real
 * rendered height and the width follows the artwork's own ratio.
 */
export default function Wordmark({
  tone = "light",
  height = 34,
}: {
  tone?: "light" | "dark";
  height?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "light" ? "/logo-light.png" : "/logo-dark.png"}
      alt="Pointly"
      style={{ height, width: "auto", display: "block", userSelect: "none" }}
    />
  );
}
