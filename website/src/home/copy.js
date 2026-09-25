// Copy for the homepage. Product facts stay in sync with ../data.js —
// only the voice changes here.

export const NAV = [
  { label: 'Home', href: '#top' },
  { label: 'About', href: '#platform' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Screens', href: '#screens' },
]

// Capability figures, not usage claims — each one is something the build does.
export const BAND_STATS = [
  ['6', 'ways to take payment'],
  ['20', 'branches on one login'],
  ['80mm', 'receipt, printed or sent'],
  ['0', 'bars of signal needed'],
]

// ─── Contact ─────────────────────────────────────────────────────────────────
// Sales runs through WhatsApp. 0302 964 6928 in international, digits-only
// form, which is what a wa.me link takes.
export const WHATSAPP_NUMBER = '923029646928'

/** A wa.me deep link that opens the chat with `message` already typed. */
export function whatsAppLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
// Two tiers, monthly, in PKR. Basic is the whole counter for one shop; Pro adds
// loyalty and branches. Pro lists only what it adds on top of Basic, so the
// ladder reads in one pass.
export const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '3,499',
    blurb: 'The whole counter for one shop. Selling, stock, invoices and reporting.',
    lead: 'Everything you need to trade',
    points: [
      'Point of sale for services and products',
      'Barcode scanning, discounts and credit sales',
      'Cash, card, JazzCash, EasyPaisa, Raast and bank',
      'Products, stock levels and a restock list',
      'Invoices with 80mm receipts, PDF and WhatsApp',
      'Client records with visit and spend history',
      'Revenue, expenses and net profit reports',
      'Staff logins with per-module access',
      'Works offline, syncs when the line returns',
    ],
    cta: 'Start with Basic',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '5,999',
    featured: true,
    blurb: 'Basic, plus a loyalty programme and every branch you run on a single login.',
    lead: 'Everything in Basic, and',
    points: [
      'Loyalty points earned and redeemed at the till',
      'Bronze, Silver, Gold and Platinum tiers',
      'Your own earn rate and tier thresholds',
      'Points balance and history on each client',
      'Up to 20 branches on one account',
      'Separate stock, staff, clients and takings per branch',
      'Switch branch without signing out',
      'Staff logins pinned to their own branch',
      'Sections to split one floor in two',
    ],
    cta: 'Choose Pro',
  },
]
