"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToStoredData } from "./storage";
import { syncEntitiesFromDB } from "./turso-sync";
import { RESTAURANT_CHANGED_EVENT, getOrders, getTables, getTickets, type DiningTable, type KitchenTicket, type RestaurantOrder } from "./restaurant";

export interface RestaurantSnapshot {
  tables: DiningTable[];
  orders: RestaurantOrder[];
  tickets: KitchenTicket[];
}

const EMPTY: RestaurantSnapshot = { tables: [], orders: [], tickets: [] };

/**
 * Tables, orders and tickets as this terminal holds them, re-read whenever
 * local data changes and pulled from the server every `pollMs` while the tab
 * is visible. The kitchen display and the floor plan sit open all service,
 * and the only way a ticket fired from the till reaches them is this poll.
 */
export function useRestaurantData(pollMs = 5000): RestaurantSnapshot & { refresh: () => void } {
  const [snapshot, setSnapshot] = useState<RestaurantSnapshot>(EMPTY);

  const refresh = useCallback(() => {
    setSnapshot({ tables: getTables(), orders: getOrders(), tickets: getTickets() });
  }, []);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToStoredData(refresh);
    window.addEventListener(RESTAURANT_CHANGED_EVENT, refresh);
    let stopped = false;
    let inFlight = false;
    const poll = window.setInterval(() => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      syncEntitiesFromDB(["dining_tables", "restaurant_orders", "kitchen_tickets"])
        .catch(() => {})
        .finally(() => { inFlight = false; });
    }, pollMs);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(poll);
      unsubscribe();
      window.removeEventListener(RESTAURANT_CHANGED_EVENT, refresh);
    };
  }, [pollMs, refresh]);

  return { ...snapshot, refresh };
}

let audio: AudioContext | null = null;

/** A short two-tone chime. Browsers only allow sound after the page has had a click. */
export function chime(kind: "new" | "ready" = "new"): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const tones = kind === "new" ? [880, 1175] : [660, 990, 1320];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  } catch { /* no audio on this device */ }
}
