import type { Staff, Service, Client, Appointment, BeautyProfile, DailyRevenue, InventoryItem } from "./types";

export function getOffsetDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const STAFF: Staff[] = [];
export const SERVICES: Service[] = [];
export const CLIENTS: Client[] = [];
export const BEAUTY_PROFILES: BeautyProfile[] = [];
export const APPOINTMENTS: Appointment[] = [];
export const INVENTORY: InventoryItem[] = [];

export const REVENUE_LAST_7_DAYS: DailyRevenue[] = [
  { date: getOffsetDate(-6), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, card: 0 }, tips: 0 },
  { date: getOffsetDate(-5), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, easypaisa: 0 }, tips: 0 },
  { date: getOffsetDate(-4), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, card: 0 }, tips: 0 },
  { date: getOffsetDate(-3), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, card: 0 }, tips: 0 },
  { date: getOffsetDate(-2), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, card: 0 }, tips: 0 },
  { date: getOffsetDate(-1), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0, card: 0 }, tips: 0 },
  { date: getOffsetDate(0), total: 0, appointments: 0, avgTicket: 0, byMethod: { cash: 0, jazzcash: 0 }, tips: 0 },
];
