import { ScanLine } from "lucide-react";

/**
 * The OnePOS wordmark, drawn rather than shipped as an image so it stays sharp
 * at any size and picks up the surrounding text colour.
 *
 * `tone="light"` is for the dark hero panel on the auth pages; `tone="dark"`
 * is for a white background.
 */
export default function Wordmark({
  tone = "light",
  size = 26,
}: {
  tone?: "light" | "dark";
  size?: number;
}) {
  const isLight = tone === "light";
  const tile = Math.round(size * 1.45);

  return (
    <span
      aria-label="OnePOS"
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.42) }}
    >
      <span
        aria-hidden
        style={{
          width: tile,
          height: tile,
          borderRadius: Math.round(tile * 0.3),
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          background: isLight
            ? "rgba(255,255,255,0.16)"
            : "linear-gradient(135deg,#9A3412,#F97316)",
          border: isLight ? "1px solid rgba(255,255,255,0.28)" : "none",
          boxShadow: isLight ? "none" : "0 4px 14px rgba(234,88,12,0.35)",
          backdropFilter: isLight ? "blur(12px)" : undefined,
        }}
      >
        <ScanLine size={Math.round(tile * 0.55)} color="#fff" strokeWidth={2.2} />
      </span>
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: isLight ? "#fff" : "#1a1a2e",
          whiteSpace: "nowrap",
        }}
      >
        One<span style={{ color: isLight ? "#fdba74" : "#EA580C" }}>POS</span>
      </span>
    </span>
  );
}
