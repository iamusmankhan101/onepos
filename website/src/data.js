export const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Industries', href: '#industries' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Customers', href: '#customers' },
]

export const LOGOS = [
  'Kolachi Group',
  'Tandoor House',
  'Glow Studios',
  'Meraki Clinics',
  'Chai Wala Co.',
  'Urban Cuts',
  'Bahria Mart',
  'The Bake Room',
]

export const NARRATIVE = [
  {
    num: '01',
    kicker: 'The problem',
    title: 'Three systems, one truth, and none agree',
    body: 'The till says one number, the stock register another, the auditor a third. Month-end becomes an argument instead of a report.',
  },
  {
    num: '02',
    kicker: 'The shift',
    title: 'Every bill writes to stock and the ledger at once',
    body: 'One document, three consequences, no re-entry. The sale, the stock movement and the journal post in the same second.',
  },
  {
    num: '03',
    kicker: 'The result',
    title: 'Month-end goes from four days to one afternoon',
    body: 'Returns file from source documents, your auditor logs in read-only, and the closing balance is already there.',
  },
]

export const INDUSTRIES = [
  {
    id: 'restaurants',
    tab: 'Restaurants & cafés',
    title: 'The kitchen never waits for the counter',
    body: "Orders route to the right station the second they're punched, and every plate deducts its recipe from stock.",
    points: [
      'Table maps, merges, split bills and part payments',
      'Aggregator orders land in the same ticket queue',
      'Wastage and yield tracked per outlet',
      'Shift-wise cash reconciliation at day-close',
    ],
    mock: {
      title: 'Kitchen display',
      meta: 'Clifton branch · live',
      kpis: [
        ['Open tickets', '14', '+3 in 10 min'],
        ['Avg. prep', '8m 20s', '-45s'],
        ['Covers today', '312', '+18%'],
      ],
      rows: [
        ['Table 12 · Karahi, 2 naan', 'Grill station', 'Rs 2,480'],
        ['Foodpanda #8841', 'Fry station', 'Rs 1,150'],
        ['Table 04 · Biryani ×3', 'Hot line', 'Rs 2,070'],
        ['Takeaway #219', 'Packing', 'Rs 890'],
      ],
    },
  },
  {
    id: 'chains',
    tab: 'Multi-outlet chains',
    title: 'Twelve outlets, one closing balance',
    body: 'A central catalogue with local overrides, transfers you can track in transit, and a P&L that consolidates itself.',
    points: [
      'Central catalogue with per-outlet price overrides',
      'Stock transfers with in-transit visibility',
      'Consolidated P&L and per-outlet margin',
      'Franchise royalty runs on scheduled cycles',
    ],
    mock: {
      title: 'Group overview',
      meta: '12 outlets · this month',
      kpis: [
        ['Group sales', 'Rs 41.2M', '+12.4%'],
        ['In transit', '86 SKUs', '4 outlets'],
        ['Best margin', 'Gulberg', '31.8%'],
      ],
      rows: [
        ['Gulberg · Lahore', 'Closed 30 Sep', 'Rs 6.4M'],
        ['Clifton · Karachi', 'Closed 30 Sep', 'Rs 5.9M'],
        ['F-7 · Islamabad', 'Closing…', 'Rs 4.1M'],
        ['Saddar · Karachi', 'Closed 30 Sep', 'Rs 3.8M'],
      ],
    },
  },
  {
    id: 'salons',
    tab: 'Salons & clinics',
    title: 'Appointments that bill themselves',
    body: 'Memberships, prepaid packages and per-staff commissions settle on the billing screen, with client history one tap away.',
    points: [
      'Memberships and prepaid package balances',
      'Per-staff commission calculated on settle',
      'Client history on the billing screen',
      'Product consumption deducted per service',
    ],
    mock: {
      title: 'Front desk',
      meta: 'Today · 9 staff on shift',
      kpis: [
        ['Booked', '48', '6 walk-ins'],
        ['Packages due', '12', 'Rs 214k'],
        ['Utilisation', '86%', '+9%'],
      ],
      rows: [
        ['Ayesha K. · Colour', 'Package · 3 left', 'Rs 0'],
        ['Hina M. · Facial', 'Card', 'Rs 6,500'],
        ['Sana R. · Cut & style', 'Membership', 'Rs 2,200'],
        ['Zara A. · Consult', 'Cash', 'Rs 3,000'],
      ],
    },
  },
]

export const FEATURES = [
  {
    title: 'Point of sale',
    body: 'Services and products in one cart. Scan a barcode, apply a discount, split the payment across cash, card, JazzCash, EasyPaisa or Raast, or put it on credit.',
    icon: 'bolt',
  },
  {
    title: 'Products & stock',
    body: 'Catalogue with cost and retail price, units, photos and barcodes. Low-stock and out-of-stock flags, a restock list, and Excel or CSV import and export.',
    icon: 'box',
  },
  {
    title: 'Invoices & receipts',
    body: 'Every sale files itself as a numbered invoice. Print an 80mm till roll with a Code 39 barcode, send the PDF over WhatsApp, or push it to a LAN thermal printer.',
    icon: 'receipt',
  },
  {
    title: 'Clients & loyalty',
    body: 'Visit count, spend and notes on every customer. Points earn on each sale and redeem at the till, with Bronze to Platinum tiers set by your own thresholds.',
    icon: 'star',
  },
  {
    title: 'Revenue & cash flow',
    body: 'Takings, expenses by category and real net profit, split by payment channel. Log cash income and bills, then export the period as a PDF report.',
    icon: 'chart',
  },
  {
    title: 'Staff & access',
    body: 'Team list with roles, commission or salary pay, paid leave and per-person revenue. Each login opens only the modules you tick for it.',
    icon: 'users',
  },
  {
    title: 'Branches & sections',
    body: 'Run up to 20 locations from one account, each with its own stock, staff, clients and takings. Switch branch without signing out, or split one floor into sections.',
    icon: 'store',
  },
  {
    title: 'Works offline, syncs itself',
    body: 'The till keeps selling on a dead connection because it reads and writes locally first, then syncs to the cloud, deletes included, so nothing comes back.',
    icon: 'cloud',
  },
  {
    title: 'Safe by default',
    body: 'Signed-in staff logins, rate-limited sign-in, an audit trail on the admin console, and a backup taken before every write your data can be restored from.',
    icon: 'shield',
  },
]

export const STATS = [
  ['4,800+', 'outlets billing daily'],
  ['Rs 340bn', 'processed last year'],
  ['99.98%', 'counter uptime'],
  ['6 min', 'median support reply'],
]

export const PLANS = [
  {
    name: 'Counter',
    desc: 'For a single till that has to be right.',
    monthly: 3999,
    annual: 3199,
    features: [
      'Offline billing, cards and wallets',
      'Day-close and basic stock',
      'FBR-compliant invoices',
      'Two staff logins',
    ],
    cta: 'Start with Counter',
  },
  {
    name: 'Operate',
    desc: 'Billing, stock and books on one ledger.',
    monthly: 9999,
    annual: 7999,
    featured: true,
    tag: 'Most chosen',
    features: [
      'Everything in Counter',
      'Purchase, vendors and ageing',
      'Full ledgers and FBR returns',
      'Unlimited staff with role limits',
      'Scheduled reports',
    ],
    cta: 'Book a demo',
  },
  {
    name: 'Chain',
    desc: 'For groups running many outlets.',
    monthly: 19999,
    annual: 15999,
    features: [
      'Everything in Operate',
      'Central catalogue and transfers',
      'Consolidated P&L and royalty runs',
      'Free read-only auditor logins',
      'Priority onboarding',
    ],
    cta: 'Talk to sales',
  },
]

export const FAQS = [
  {
    q: 'Does billing keep working without internet?',
    a: 'Yes. The till holds a local catalogue and keeps issuing bills offline, queueing every document. When the line returns the queue syncs in order, so invoice numbers and stock movements stay sequential.',
  },
  {
    q: 'Can we migrate from our current POS?',
    a: 'Items, vendors, opening stock and balances import from CSV or a database dump. For most single outlets that is one evening; a twelve-outlet group is typically a week including staff training.',
  },
  {
    q: 'Which hardware does it run on?',
    a: 'Android tablets, Windows tills or the Pointly terminal. Printers, scanners, scales and cash drawers auto-detect. If it speaks ESC/POS, it works.',
  },
  {
    q: 'Do auditors get their own access?',
    a: 'Free read-only logins on every plan, scoped to the periods you choose, plus QuickBooks and Xero exports when your accountant prefers their own tools.',
  },
  {
    q: 'How does FBR integration actually work?',
    a: 'Pointly registers each invoice with FBR at the moment of sale and prints the returned invoice number on the receipt. Sales tax returns are then generated from those same posted documents, with no separate workbook.',
  },
]

export const FOOTER = [
  {
    title: 'Product',
    links: ['Counter billing', 'Inventory', 'Accounting', 'Purchase', 'Reporting', 'Open API'],
  },
  {
    title: 'Industries',
    links: ['Restaurants & cafés', 'Multi-outlet chains', 'Salons & clinics', 'Retail & marts'],
  },
  {
    title: 'Company',
    links: ['About', 'Customers', 'Partners', 'Status', 'Docs', 'Support'],
  },
]
