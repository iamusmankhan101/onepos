"use client";

import { CreditCard } from "lucide-react";
import PageTitle from "@/components/page-title";
import SubscriptionBilling from "@/components/subscription-billing";

/** The business owner's Pointly subscription and invoices. Staff and managers get the API's refusal. */
export default function BillingPage() {
  return (
    <div className="dash-page dashboard-polish" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header">
        <PageTitle icon={<CreditCard size={24} />} title="Billing" subtitle="Your Pointly plan, what's due next and every invoice." />
      </div>
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(226,223,235,.95)", boxShadow: "0 8px 28px rgba(75,40,20,.04)", padding: "24px clamp(16px, 3vw, 28px)" }}>
        <SubscriptionBilling />
      </div>
    </div>
  );
}
