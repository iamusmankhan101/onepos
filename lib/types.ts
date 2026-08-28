// ─── Core Types ───────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "arrived"
  | "in-progress"
  | "completed"
  | "no-show"
  | "cancelled";

export type PaymentMethod =
  | "cash"
  | "jazzcash"
  | "easypaisa"
  | "raast"
  | "card"
  | "bank";

export type StaffRole =
  | "owner"
  | "manager"
  | "senior-stylist"
  | "junior-stylist"
  | "receptionist"
  | "trainee"
  | "hair"
  | "aesthetic";

export type ServiceCategory = "hair" | "skin" | "nails" | "bridal" | "piercing" | "other";
// Services also accept arbitrary custom category names entered by the user.
export type ServiceCategoryValue = ServiceCategory | (string & {});

export type StaffPayType = "commission" | "salary" | "both";

export interface Staff {
  id: string;
  name: string;
  phone: string;
  photo?: string;
  role: StaffRole;
  /** Which business section this staff member belongs to (e.g. "Men's", "Women's"), for businesses that run both from one branch. Free text, cosmetic only. */
  section?: string;
  specialties: string[];
  color: string;
  isActive: boolean;
  email?: string;
  /** How this staff member is paid. Defaults to "commission" when unset. */
  payType?: StaffPayType;
  /** Commission percentage of revenue generated (e.g. 30 for 30%). Used when payType is "commission" or "both". */
  commissionRate?: number;
  /** Fixed pay-period amount (PKR). Used when payType is "salary" or "both". */
  baseSalary?: number;
  /** How many "Leave" attendance days per month/pay period count as fully paid before further leaves start reducing salary. Defaults to 0 (unpaid) when unset. */
  paidLeavesPerMonth?: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  category: ServiceCategoryValue;
  /** Which business section this service belongs to (e.g. "Men's", "Women's"). Free text, cosmetic only. */
  section?: string;
  durationMin: number;
  price: number;
  variablePrice?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
  /** When present (2+ ids), this Service is a Deal/Package bundling these other service ids under one price. */
  packageServiceIds?: string[];
  /** Ad-hoc services bundled into this Deal/Package that aren't part of the master service list. */
  customServices?: { name: string; price?: number; durationMin?: number }[];
  assignedStaffIds: string[];
  /** When true, all of assignedStaffIds work together as a team on this service (e.g. bridal hair + makeup done jointly), rather than assignedStaffIds being a pool of individually-eligible stylists. Informational only — doesn't affect booking, calendar, or payroll. */
  multiStylist?: boolean;
  isActive: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  locationId?: string;
  email?: string;
  gender?: "female" | "male" | "other";
  dob?: string;
  photo?: string;
  preferredStaffId?: string;
  tags: string[];
  /** Which business section this client is associated with (e.g. "Men's", "Women's"). Free text, cosmetic only. */
  section?: string;
  source: "whatsapp" | "walk-in" | "web" | "manual" | "agent";
  createdAt: string;
  totalVisits: number;
  totalSpend: number;
  lastVisitDate?: string;
  averageRating?: number;
  notes?: string;
  loyaltyPoints?: number;
  loyaltyPointsEarned?: number;
  /** Client has opted out of marketing WhatsApp messages (birthday offers, cancellation win-back). Transactional messages (confirmations, reminders) are unaffected. */
  whatsappOptedOut?: boolean;
}

export type LoyaltyTxType = "earn" | "redeem" | "adjust";

export interface LoyaltyTransaction {
  id: string;
  clientId: string;
  type: LoyaltyTxType;
  points: number;
  note: string;
  date: string;
  appointmentId?: string;
}

export interface BeautyProfile {
  clientId: string;
  hairFormulas: {
    brand: string;
    shade: string;
    developer: string;
    ratio: string;
    processingTime: number;
    notes?: string;
  }[];
  skinType?: "oily" | "dry" | "combination" | "sensitive";
  allergies: string[];
  nailPrefs?: string;
  notes?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  staffId: string;
  staffName: string;
  serviceIds: string[];
  serviceNames: string[];
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  totalAmount: number;
  notes?: string;
  source: "whatsapp" | "walk-in" | "web" | "manual" | "agent";
  createdAt?: string;
  /** Which business section this appointment belongs to — derived from the assigned staff member's section. Free text, cosmetic only. */
  section?: string;
}

export interface Payment {
  id: string;
  appointmentId: string;
  serviceAmount: number;
  tip: number;
  discountAmount: number;
  method: PaymentMethod;
  createdAt: string;
}

export interface DailyRevenue {
  date: string;
  total: number;
  appointments: number;
  avgTicket: number;
  byMethod: Partial<Record<PaymentMethod, number>>;
  tips: number;
}

export type InventoryCategory = "hair-color" | "skin-care" | "nail" | "tools" | "consumables" | "retail";
export type InventoryUnit = "ml" | "g" | "pcs" | "box" | "bottle" | "tube";

export interface InventoryItem {
  id: string;
  name: string;
  brand: string;
  category: InventoryCategory;
  /** Which business section this item belongs to (e.g. "Men's", "Women's"). Free text, cosmetic only. */
  section?: string;
  unit: InventoryUnit;
  currentStock: number;
  minStock: number;
  costPrice: number;
  retailPrice?: number;
  variablePrice?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
  barcode?: string;
  supplier?: string;
  lastRestocked?: string;
  notes?: string;
}
