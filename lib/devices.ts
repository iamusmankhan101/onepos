/**
 * lib/devices.ts
 *
 * Turns a session's user-agent string into something an admin can read —
 * "Chrome on Windows", "Safari on iPhone". Deliberately small: it names the
 * common browsers and platforms and falls back to "Unknown device" rather
 * than guessing. Free of server imports so the console can use it too.
 */

export type DeviceKind = "phone" | "tablet" | "desktop" | "unknown";

export interface SessionDevice {
  /** SHA-256 of the session token — the sessions row id. Never the token itself. */
  id: string;
  userAgent: string | null;
  ip: string | null;
  /** When the session was created; null for sessions from before devices were tracked. */
  createdAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
}

export function describeDevice(userAgent: string | null | undefined): { label: string; kind: DeviceKind } {
  const ua = userAgent ?? "";
  if (!ua) return { label: "Unknown device", kind: "unknown" };

  const platform =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua)) ? "iPad"
      : /iPhone/.test(ua) ? "iPhone"
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
      : /Windows/.test(ua) ? "Windows"
      : /CrOS/.test(ua) ? "ChromeOS"
      : /Mac OS X|Macintosh/.test(ua) ? "macOS"
      : /Linux/.test(ua) ? "Linux"
      : null;

  const browser =
    /Edg\//.test(ua) ? "Edge"
      : /OPR\/|Opera/.test(ua) ? "Opera"
      : /SamsungBrowser/.test(ua) ? "Samsung Internet"
      : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
      : /Chrome\/|CriOS/.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari"
      : null;

  const kind: DeviceKind =
    platform === "iPhone" || platform === "Android phone" ? "phone"
      : platform === "iPad" || platform === "Android tablet" ? "tablet"
      : platform ? "desktop"
      : "unknown";

  const label = browser && platform ? `${browser} on ${platform}` : browser ?? platform ?? "Unknown device";
  return { label, kind };
}
