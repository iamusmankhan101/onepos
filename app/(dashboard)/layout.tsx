"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShoppingCart, ReceiptText, BarChart3, UserCog, Users, WifiOff, X } from "lucide-react";
import Sidebar from "@/components/sidebar";
import { getCurrentUser, checkServerSession, signOut } from "@/lib/auth";
import { applyAppearanceSettings, SETTINGS_CHANGED_EVENT, reloadSettings } from "@/lib/settings-store";
import { syncFromDB, syncLocalDataToDB, SESSION_EXPIRED_EVENT } from "@/lib/turso-sync";
import { getStoredStaff, getStoredServices } from "@/lib/storage";
import { getActiveSection, setActiveSection, getSectionOptions } from "@/lib/sections";
import { setActiveLocationFilter } from "@/lib/locations";

// Settings is the one owner-only screen; the four modules are reachable by
// any staff login whose permission list names them.
const OWNER_ONLY = ["settings"];

// ─── Section switcher (Men's / Women's split within one branch) ───────────────

function DashboardSectionSwitcher({ onSectionChange }: { onSectionChange: (section: string) => void }) {
  const [options, setOptions] = useState<string[]>(() => getSectionOptions([...getStoredStaff(), ...getStoredServices()]));
  const [hasTagged, setHasTagged] = useState(() => [...getStoredStaff(), ...getStoredServices()].some((r) => r.section));
  const [activeSection, setActiveSectionState] = useState(() => getActiveSection());

  useEffect(() => {
    function refresh() {
      const records = [...getStoredStaff(), ...getStoredServices()];
      setOptions(getSectionOptions(records));
      setHasTagged(records.some((r) => r.section));
      setActiveSectionState(getActiveSection());
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!hasTagged) return null;

  function changeSection(section: string) {
    if (section === activeSection) return;
    setActiveSection(section);
    setActiveSectionState(section);
    onSectionChange(section);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      margin: "10px 20px 0", padding: "12px 14px",
      border: "1px solid rgba(234,88,12,0.13)", borderRadius: 16,
      background: "linear-gradient(135deg, rgba(234,88,12,0.06), rgba(255,255,255,0.95))",
      boxShadow: "0 10px 28px rgba(70,38,18,0.045)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 12, display: "grid", placeItems: "center",
          background: "var(--accent-gradient)", boxShadow: "0 5px 16px var(--accent-glow)", flexShrink: 0,
        }}>
          <Users size={17} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 850, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            Active Section
          </div>
          <div style={{ fontSize: 12, color: "#777792", fontWeight: 650, marginTop: 2 }}>
            Everything, including revenue, filters to this section. Switch to All Sections to see both combined.
          </div>
        </div>
      </div>

      <select
        value={activeSection}
        onChange={(e) => changeSection(e.target.value)}
        style={{
          minWidth: 160, padding: "9px 34px 9px 12px", borderRadius: 12,
          border: "1px solid #fed7aa", background: "#fff", color: "#1a1a2e",
          fontSize: 13, fontWeight: 800, outline: "none", cursor: "pointer",
          boxShadow: "0 3px 10px rgba(75,40,20,0.04)",
        }}
        aria-label="Select active dashboard section"
      >
        <option value="all">All Sections</option>
        {options.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady]           = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [offline, setOffline]           = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [sectionRenderKey, setSectionRenderKey] = useState(getActiveSection());

  // Remount the page subtree when the section changes so every list re-reads
  // its filtered data instead of keeping the previous section's snapshot.
  const handleSectionChange = useCallback((section: string) => setSectionRenderKey(section), []);

  // ── Access gate ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Deferred a tick so localStorage is readable (this runs after hydration).
    const timer = window.setTimeout(() => {
      const user = getCurrentUser();
      if (!user) {
        router.replace("/sign-in");
        return;
      }

      const key = pathname === "/dashboard"
        ? "pos"
        : pathname.replace("/dashboard/", "").split("/")[0];

      if (user.role === "staff" || user.role === "manager") {
        // Both are pinned to their assigned branch client-side, matching the
        // server-side pin in resolveActor() — otherwise a stale local selection
        // could point reads/writes at a branch the server won't scope them to.
        if (user.locationId) setActiveLocationFilter(user.locationId);
      }
      if (user.role !== "owner" && user.role !== "admin" && OWNER_ONLY.includes(key)) {
        router.replace("/dashboard/pos");
        return;
      }
      if (user.role === "staff") {
        const permissions = user.permissions || [];
        if (!permissions.includes("*") && !permissions.includes(key)) {
          router.replace("/dashboard/pos");
          return;
        }
      }
      setIsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, pathname]);

  // Session liveness — getCurrentUser() only reads a local cache and can't tell
  // the session cookie has died server-side, so a tab left open past expiry
  // would keep rendering while every background save silently 401s.
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;

    async function verify() {
      const alive = await checkServerSession();
      if (cancelled || alive) return;
      await signOut();
      router.replace("/sign-in?expired=1");
    }

    verify();
    const interval = window.setInterval(verify, 30 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isReady, router]);

  // A save rejected as unauthenticated means the session died under an open
  // tab. Rather than let every subsequent write 401 into the console, clear
  // the local session and send them to sign in.
  useEffect(() => {
    async function onExpired() {
      await signOut();
      router.replace("/sign-in?expired=1");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);

  // Appearance (brand accent CSS variables)
  useEffect(() => {
    applyAppearanceSettings();
    window.addEventListener(SETTINGS_CHANGED_EVENT, applyAppearanceSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, applyAppearanceSettings);
  }, []);

  // Pull shared business data down from Turso, then push anything this device
  // saved while it was the only copy. Settings reload last so the synced
  // values are already in localStorage when it reads them.
  useEffect(() => {
    if (!isReady) return;
    syncFromDB().then(async () => {
      await syncLocalDataToDB();
      reloadSettings();
      window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
    });
  }, [isReady]);

  // Offline banner — a checkout still completes offline (it is written to
  // localStorage first), but it won't reach the other devices until sync.
  useEffect(() => {
    function update() {
      setOffline(!navigator.onLine);
      if (navigator.onLine) setOfflineDismissed(false);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!isReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f7fb", color: "#EA580C", fontSize: 13, fontWeight: 700 }}>
        Loading workspace...
      </div>
    );
  }

  // POS has its own Customer/Catalog/Cart tab bar on mobile — the global
  // bottom nav on top of it would stack two toolbars in a tight checkout.
  const isPosPage = pathname === "/dashboard/pos";

  const bottomTabs = [
    { href: "/dashboard/pos",      icon: ShoppingCart, label: "POS"      },
    { href: "/dashboard/invoices", icon: ReceiptText,  label: "Invoices" },
    { href: "/dashboard/revenue",  icon: BarChart3,    label: "Revenue"  },
    { href: "/dashboard/staff",    icon: UserCog,      label: "Staff"    },
  ];
  const leftTabs  = bottomTabs.slice(0, 2);
  const rightTabs = bottomTabs.slice(2);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div
        className={`mobile-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className={isPosPage ? "pos-page-main" : ""} style={{
        marginLeft: "var(--sidebar-width)",
        flex: 1,
        minHeight: "100vh",
        background: "#ffffff",
        overflow: "auto",
        borderRadius: "20px 0 0 20px",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      }}>
        {offline && !offlineDismissed && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 20px",
            background: "linear-gradient(90deg,#78350f,#92400e)",
            borderRadius: "20px 0 0 0",
          }}>
            <WifiOff size={16} color="#fcd34d" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: "#fef3c7", fontWeight: 600 }}>
              You&apos;re offline. Sales still go through and are saved on this device — they sync to your other devices once the connection is back.
            </div>
            <button
              type="button"
              onClick={() => setOfflineDismissed(true)}
              aria-label="Dismiss offline notice"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#fcd34d", padding: 4, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        <DashboardSectionSwitcher onSectionChange={handleSectionChange} />
        <div key={sectionRenderKey}>{children}</div>
      </main>

      {!isPosPage && (
        <nav className="bottom-nav">
          {leftTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className={`bottom-nav-item ${isActive ? "active" : ""}`}>
                <tab.icon size={20} />
                <span>{tab.label}</span>
                {isActive && <div className="bottom-nav-active-dot" />}
              </Link>
            );
          })}

          {/* Center logo badge — opens the sidebar */}
          <button onClick={() => setSidebarOpen(true)} className="bottom-nav-logo-badge" aria-label="Open menu">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-light.png" alt="Pointly" style={{ width: 34, height: "auto", display: "block" }} />
          </button>

          {rightTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className={`bottom-nav-item ${isActive ? "active" : ""}`}>
                <tab.icon size={20} />
                <span>{tab.label}</span>
                {isActive && <div className="bottom-nav-active-dot" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
