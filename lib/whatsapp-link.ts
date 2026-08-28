/**
 * lib/whatsapp-link.ts
 *
 * WhatsApp sending in this POS is link-based only: every message goes out
 * through a `https://wa.me/<number>?text=<message>` deep link opened in a new
 * tab, which hands the prefilled chat to WhatsApp Web (desktop) or the
 * WhatsApp app (mobile). There is no provider account, API key, or server-side
 * queue — the business presses send in their own WhatsApp.
 */

/**
 * Normalize a locally-typed phone number into the digits-only international
 * form wa.me expects (no `+`, no spaces, no dashes).
 *
 * Pakistani numbers are the common case here: `0300-1234567` and `3001234567`
 * both mean +92 300 1234567. Anything already carrying a country code is left
 * as its digits.
 */
export function normalizePhone(raw: string, defaultCountryCode = "92"): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `${defaultCountryCode}${digits}`;
  return digits;
}

/** Replace `{{placeholder}}` tokens in a message template. */
export function fillTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Emoji survive a JSON API body fine, but a wa.me link passes the message
 * through a URL query string and several redirects — WhatsApp Web has been
 * seen garbling astral-plane characters picked up there into mojibake, so
 * they are stripped from anything sent over a link.
 */
export function sanitizeForLink(message: string): string {
  return message
    .replace(/\p{Extended_Pictographic}/gu, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

/** Build the wa.me deep link for a number + message. */
export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(sanitizeForLink(message))}`;
}

/**
 * Open the prefilled WhatsApp chat in a new tab. Returns false when there is
 * no usable number, or when the browser blocked the popup — callers surface a
 * manual "Send on WhatsApp" button for that case, since a window opened
 * outside a click's user-activation window can be silently suppressed.
 */
export function openWhatsAppChat(phone: string, message: string): boolean {
  const number = normalizePhone(phone);
  if (!number) return false;
  const win = window.open(buildWhatsAppLink(number, message), "_blank");
  return win !== null;
}
