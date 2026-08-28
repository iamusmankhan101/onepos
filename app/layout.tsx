import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "OnePOS — Point of Sale",
    template: "%s | OnePOS",
  },
  description: "Point of sale, invoices, revenue and staff — with WhatsApp receipts",
  // Icons come from the app/icon.png and app/apple-icon.png file conventions.
};

// viewportFit: "cover" lets content draw under the notch/home-indicator area on
// iOS so the env(safe-area-inset-*) values globals.css already reads (bottom nav,
// mobile app bar) actually resolve to something non-zero instead of silently no-op'ing.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the nonce injected by middleware so Next.js can apply it to its
  // internal inline hydration scripts, satisfying the nonce-based CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <head>
        {/* Propagate nonce so any manually-added scripts can use it */}
        {nonce && <meta name="csp-nonce" content={nonce} />}
      </head>
      <body className={montserrat.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
