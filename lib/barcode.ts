/**
 * lib/barcode.ts
 *
 * Code 39 — the simplest symbology every cheap scanner reads, and enough for
 * an invoice number (digits, A-Z, and a few symbols including "-"). Encoding
 * it here rather than pulling in a barcode package keeps the receipt renderers
 * dependency-free and works the same in the DOM and in @react-pdf.
 *
 * Each character is nine alternating elements — bar, space, bar, … — that are
 * either narrow or wide. Characters are separated by one narrow space.
 */

const PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw",
  E: "wnnnwwnnn", F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn",
  I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn",
  Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn",
  $: "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
  "*": "nwnnwnwnn", // start / stop
};

export interface BarcodeElement {
  /** Width in narrow-unit multiples. */
  units: number;
  /** A bar when true, a gap when false. */
  bar: boolean;
}

/**
 * Encode `value` as Code 39 elements. Unsupported characters are dropped, so
 * an invoice number like "SI-2026-0001" survives while stray punctuation does
 * not break the symbol. Returns an empty array when nothing is encodable.
 */
export function code39(value: string, wideRatio = 3): BarcodeElement[] {
  const chars = value
    .toUpperCase()
    .split("")
    .filter((c) => c !== "*" && PATTERNS[c] !== undefined);

  if (chars.length === 0) return [];

  const elements: BarcodeElement[] = [];
  const sequence = ["*", ...chars, "*"];

  sequence.forEach((char, index) => {
    PATTERNS[char].split("").forEach((size, position) => {
      elements.push({ units: size === "w" ? wideRatio : 1, bar: position % 2 === 0 });
    });
    // inter-character gap, but not trailing off the end of the symbol
    if (index < sequence.length - 1) elements.push({ units: 1, bar: false });
  });

  return elements;
}

/** Total width of an encoded symbol, in narrow units. */
export function code39Width(elements: BarcodeElement[]): number {
  return elements.reduce((sum, e) => sum + e.units, 0);
}
