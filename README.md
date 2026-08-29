# Pointly

A trimmed build of [saloncore-werzio](https://github.com/iamusmankhan101/saloncore-werzio-) that keeps
only the point-of-sale side of the product:

| Module | Route | What it does |
| --- | --- | --- |
| **Products** | `/dashboard/products` | The POS catalogue — add/edit products, categories, stock levels, cost and selling price, barcodes, Excel/CSV import & export, restock list |
| **POS** | `/dashboard/pos` | Catalogue (services + products), barcode scanning, cart, discounts, loyalty redeem, split payment methods, credit sales, receipt printing, WhatsApp receipt |
| **Invoices** | `/dashboard/invoices` | Every sale as an invoice — search, filter, edit, mark paid, print, PDF |
| **Receipts** | — | Printed and PDF output is an 80mm till-roll receipt (not A4): shop header, items, totals, a Code 39 barcode of the receipt number, and the Pointly mark. `@page { size: 80mm auto }` for the browser; `lib/invoice-pdf.tsx` computes the page height from the content so a receipt is never a second page or a tail of blank paper. LAN thermal printers go through `/api/print` (ESC/POS) |
| **Revenue** | `/dashboard/revenue` | Revenue, expenses, net profit, channel split, month drill-down, PDF report |
| **Cash Flow** | `/dashboard/cash-flow` | Where expenses and manual cash income are recorded — the figures Revenue reports on |
| **Staff** | `/dashboard/staff` | Team list, roles, pay types, commissions, per-staff performance, import/export |
| **Settings** | `/dashboard/settings` | Business profile & logo, business hours, WhatsApp receipt message, thermal printer, staff logins, password |

Everything else from the original app — appointments, calendar, clients, inventory, services, loyalty
campaigns, attendance, payouts, virtual try-on, online booking, feedback, the marketing website, the
platform-admin console, subscription billing, the WhatsApp provider integrations and all their cron
jobs — has been removed, along with the libraries and API routes that only served them.

The product is **Pointly** and the interface is worded for any kind of business. The upstream
"Salon Central" / "Werzio" vocabulary is gone from the code as well as the screens:

| Was | Now |
| --- | --- |
| `werzio_session` cookie, `werzio_*` localStorage keys | `pointly_session`, `pointly_*` |
| `salon_data`, `salon_data_backups`, `salon_backup_bundles` tables | `business_data`, `business_data_backups`, `business_backup_bundles` |
| `salon_name`, `salon_owner_id` columns | `business_name`, `business_owner_id` |
| `salon_invoices` sync entity | `invoices` |
| `salonName` / `salonOwnerId` API fields | `businessName` / `businessOwnerId` |
| `SalonInvoice`, `SalonLocation`, `lib/salon-invoices.ts` | `Invoice`, `BusinessLocation`, `lib/invoices.ts` |
| `{{salon_name}}` message variable | `{{business_name}}` |

There is no compatibility shim for any of it: the rename assumes a database with no accounts in it yet.
Pointing this build at a database created by an older one will not find its data.

## Branding

Accent colour is orange, defined once as CSS custom properties in [`app/globals.css`](app/globals.css)
and re-applied at runtime by `applyAppearanceSettings()` in [`lib/settings-store.ts`](lib/settings-store.ts):

| Token | Value | Role |
| --- | --- | --- |
| `--accent` | `#EA580C` | buttons, links, active states |
| `--accent-dark` | `#9A3412` | gradient start, headings on tint |
| `--accent-end` | `#F97316` | gradient end |
| `--accent-light` | `#FB923C` | hover borders, muted accents |
| `--accent-dim` / `--accent-glow` | `rgba(234,88,12,…)` | tints and shadows |

Surface tints run the same scale (`#FFF7ED`, `#FFEDD5`, `#FED7AA`, `#FDBA74`). Changing all of it means
changing those two files plus the literals that inline the scale. Categorical colours (chart series, role
badges, service categories, status pills) are deliberately not brand-coloured.

The logo is the supplied artwork in `public/logo.png` — white on transparency. Two variants are
derived from it and are what the app actually references: `logo-light.png` (trimmed, for dark
surfaces) and `logo-dark.png` (inverted, for white surfaces such as printed invoices and PDF
reports), plus `logo-dark-sm.png`, a 360px copy embedded into generated invoice PDFs so a receipt
shared over WhatsApp stays small. [`components/wordmark.tsx`](components/wordmark.tsx) picks the
right one from its `tone` prop. App icons at `app/icon.png` / `app/apple-icon.png` are the logo on
the brand tile. Regenerate all of them from a new `public/logo.png` if the artwork changes.

## WhatsApp receipts

WhatsApp is **link-based only** — there is no provider account, API key, or server-side send queue.

Completing a sale opens `https://wa.me/<number>?text=<receipt>` in a new tab, which hands the client's
chat, with the message already typed, to WhatsApp Web on desktop or the WhatsApp app on mobile. The
business presses send from their own WhatsApp, so the number that appears to the client is the business's own.

* The message is the thank-you template from **Settings → WhatsApp Receipt** (`{{name}}`, `{{business_name}}`)
  followed by the invoice number, date, line items and total.
* Emoji are stripped: a wa.me link carries text through a URL, where WhatsApp Web has been seen garbling them.
* Numbers are normalised to international digits (`0300-1234567` → `923001234567`); see `lib/whatsapp-link.ts`.
* If the browser suppresses the new tab (popup blocker, or the click's user-activation window was spent
  during checkout), the success banner shows **WhatsApp tab blocked** and its **Send on WhatsApp** button
  opens the same link from a real click.
* **Send PDF** in the same banner attaches the invoice PDF itself through the OS share sheet where the
  browser supports it, and otherwise downloads the PDF and opens the chat so it can be attached by hand.

Keep the business's number signed in at [web.whatsapp.com](https://web.whatsapp.com) on the till machine.

## Running it

Requires Node 20.9+ (see `.nvmrc`).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

### Environment

Create `.env.local`:

```
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token>
SESSION_SECRET=<random 32+ char string>
```

`SESSION_SECRET` signs the session cookie and **must** be set in production — the app refuses to verify
sessions against the built-in development fallback when `NODE_ENV=production`.

Turso holds the accounts, sessions and the shared business data. The browser keeps a localStorage copy of
that data and syncs both ways on load, so a sale still completes while the connection is down and
reaches the other devices once it returns.

### Accounts

Sign-up at `/sign-up` creates a business owner account and signs straight in — this build has no
platform-admin console, so accounts are no longer held for approval. Staff logins (created by an owner)
sign in through the **Staff** tab at `/sign-in` and only see the modules their permission list names.
