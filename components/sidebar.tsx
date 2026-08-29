"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  UserCog, BarChart3, Banknote, Settings, ReceiptText, ShoppingCart, Package,
  X, LogOut, ChevronDown,
} from "lucide-react";
import { AuthUser, getCurrentUser, signOut } from "@/lib/auth";
import Wordmark from "@/components/wordmark";
import { SETTINGS_CHANGED_EVENT, settingsStore, reloadSettings } from "@/lib/settings-store";

const NAV_GROUPS: {
  label: string;
  items: { href: string; icon: React.ElementType; label: string }[];
}[] = [
  {
    label: "Sales",
    items: [
      { href: "/dashboard/pos",      icon: ShoppingCart, label: "POS"      },
      { href: "/dashboard/products", icon: Package,      label: "Products" },
      { href: "/dashboard/invoices", icon: ReceiptText,  label: "Invoices" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/dashboard/revenue",   icon: BarChart3, label: "Revenue"   },
      { href: "/dashboard/cash-flow", icon: Banknote,  label: "Cash Flow" },
      { href: "/dashboard/staff",     icon: UserCog,   label: "Staff"     },
    ],
  },
];

const SETTINGS_NAV = [
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [businessName, setBusinessName] = useState("OnePOS");
  const [businessLogo, setBusinessLogo] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function sync() {
      reloadSettings();
      setUser(getCurrentUser());
      setBusinessName(settingsStore.business.name || getCurrentUser()?.businessName || "OnePOS");
      setBusinessLogo(settingsStore.business.logo || "");
    }
    const t = window.setTimeout(sync, 0);
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync);
    return () => { window.clearTimeout(t); window.removeEventListener(SETTINGS_CHANGED_EVENT, sync); };
  }, [pathname]);

  useEffect(() => {
    function closeProfileMenu(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("pointerdown", closeProfileMenu);
    return () => document.removeEventListener("pointerdown", closeProfileMenu);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const initials = (user?.ownerName || businessName || "W")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const isStaffUser = user?.role === "staff";

  const canAccess = (href: string) => {
    if (!isStaffUser) return true;
    if (user.permissions?.includes("*")) return true;
    const key = href.replace("/dashboard/", "").split("/")[0];
    return user.permissions?.includes(key) ?? false;
  };

  const NavItem = ({ href, icon: Icon, label, active: activeOverride }: { href: string; icon: React.ElementType; label: string; active?: boolean }) => {
    const active = activeOverride !== undefined
      ? activeOverride
      : (pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));
    return (
      <Link href={href} onClick={onClose} className={`sb-item${active ? " sb-active" : ""}`}>
        <span className="sb-item-icon"><Icon size={15} /></span>
        <span className="sb-item-label">{label}</span>
        {active && <span className="sb-item-dot" />}
      </Link>
    );
  };

  return (
    <>
      <style>{`
        .sb-item {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px 11px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 500;
          color: #fff7ed;
          text-decoration: none;
          transition: background 0.13s, color 0.13s;
          margin-bottom: 1px;
          position: relative;
        }
        .sb-item:hover {
          background: rgba(234,88,12,0.09);
          color: #fff;
        }
        .sb-active {
          background: linear-gradient(135deg,#9A3412,#EA580C) !important;
          color: #fff !important;
          font-weight: 650;
          box-shadow: 0 2px 14px rgba(154,52,18,0.38);
        }
        .sb-active .sb-item-icon { opacity: 1; }
        .sb-item-icon { opacity: 0.75; display: flex; align-items: center; flex-shrink: 0; }
        .sb-item-label { flex: 1; }
        .sb-item-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: rgba(255,255,255,0.6); flex-shrink: 0;
        }
        .sb-section {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.68);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 10px 11px 5px;
        }
        .sb-nav::-webkit-scrollbar { width: 3px; }
        .sb-nav::-webkit-scrollbar-thumb { background: #222234; border-radius: 3px; }
        .sb-signout {
          width: 100%;
          border: 1px solid #1e1e2e;
          background: transparent;
          color: #fff;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: background 0.13s, color 0.13s, border-color 0.13s;
        }
        .sb-signout:hover {
          background: rgba(239,68,68,0.08);
          border-color: rgba(239,68,68,0.25);
          color: #f87171;
        }
        .sb-profile-menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: rgba(255,255,255,.82);
          font-size: 11px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          box-sizing: border-box;
          text-align: left;
        }
        .sb-profile-menu-item:hover { background: rgba(234,88,12,.18); color: #fff; }
      `}</style>

      <aside
        className={isOpen ? "active" : ""}
        style={{
          width: "var(--sidebar-width)",
          height: "100vh",
          background: "#0d0d14",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0, left: 0,
          zIndex: 50,
          overflow: "hidden",
          borderRight: "1px solid #18182a",
        }}
      >

        {/* ── Logo row ─────────────────────────────────────── */}
        <div style={{
          padding: "15px 16px 13px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #18182a",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              aria-label="Close navigation"
              className="mobile-close-btn"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid #252538",
                color: "#5a5a82", cursor: "pointer", padding: "5px 6px",
                borderRadius: 8, display: "none", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={15} />
            </button>
            <span className="sidebar-logo" style={{ userSelect: "none", pointerEvents: "none" }}>
              <Wordmark size={19} />
            </span>
          </div>

          <div
            className="sidebar-live-badge"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(234,88,12,0.13)",
              border: "1px solid rgba(234,88,12,0.28)",
              borderRadius: 20, padding: "3px 9px 3px 6px",
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#fb923c", boxShadow: "0 0 7px #EA580C",
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", letterSpacing: "0.07em" }}>LIVE</span>
          </div>
        </div>

        {/* ── Profile chip ─────────────────────────────────── */}
        <div ref={profileMenuRef} style={{ padding: "10px 12px 12px", borderBottom: "1px solid #18182a", position: "relative" }}>
          <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-label="Open account menu" style={{
            width: "100%",
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 12px",
            borderRadius: 12,
            background: "linear-gradient(135deg,rgba(154,52,18,.22),rgba(30,27,75,.36))",
            border: "1px solid rgba(251,146,60,.18)",
            cursor: "pointer",
            textAlign: "left",
          }}>
            {/* Avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg,#EA580C,#FB923C)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#fff",
              boxShadow: "0 2px 10px rgba(154,52,18,0.55)",
              border: "2px solid rgba(255,255,255,.82)",
            }}>
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessLogo}
                  alt={`${businessName} logo`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : initials}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: "#fff",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user?.ownerName || businessName}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.68)", textTransform: "capitalize", marginTop: 2 }}>
                {user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : user?.role || "Owner"}
              </div>
            </div>

            <ChevronDown size={15} color="rgba(255,255,255,.72)" style={{ flexShrink: 0, transform: profileOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
          </button>

          {profileOpen && (
            <div style={{ marginTop: 7, padding: 6, borderRadius: 11, background: "#151522", border: "1px solid #292940", boxShadow: "0 12px 30px rgba(0,0,0,.32)" }}>
              {!isStaffUser && (
                <Link href="/dashboard/settings" onClick={() => { setProfileOpen(false); onClose?.(); }} className="sb-profile-menu-item">
                  <Settings size={13} /> Business Settings
                </Link>
              )}
              <button type="button" onClick={handleSignOut} className="sb-profile-menu-item" style={{ borderTop: "1px solid #292940", borderRadius: 0, marginTop: 5, paddingTop: 10, color: "#fca5a5" }}>
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          )}
        </div>

        {/* ── Navigation ───────────────────────────────────── */}
        <nav className="sb-nav" style={{ flex: 1, padding: "6px 8px 8px", overflowY: "auto" }}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => canAccess(item.href));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="sb-section">{group.label}</div>
                {visibleItems.map((item) => (
                  <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
                ))}
              </div>
            );
          })}

          {!isStaffUser && (
            <>
              <div className="sb-section" style={{ paddingTop: 12 }}>Business</div>
              {SETTINGS_NAV.map((item) => <NavItem key={item.href} {...item} />)}
            </>
          )}
        </nav>

        {/* ── Bottom: sign out ─────────────────────────────── */}
        <div style={{ padding: "10px 12px 16px", borderTop: "1px solid #18182a" }}>
          <button onClick={handleSignOut} className="sb-signout">
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
