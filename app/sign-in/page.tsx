"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { checkServerSession, getCurrentUser, signOut } from "@/lib/auth";
import Wordmark from "@/components/wordmark";
import styles from "../auth.module.css";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [rateLocked, setRateLocked] = useState(false);
  const [verifiedMessage, setVerifiedMessage] = useState(false);
  // Shown when the tab arrived here because its session ran out (4-day expiry,
  // a signout elsewhere, or a revoked login) rather than by choice. It is a
  // notice, not a failure, so it gets its own banner instead of the red error.
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [portal, setPortal] = useState<"admin" | "staff">("admin");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const arrivedExpired = params.get("expired") === "1";
    const signedIn = getCurrentUser();
    let cancelled = false;

    // Banners are set in a microtask, not straight from the effect body, so
    // they land after this render instead of cascading another one.
    queueMicrotask(() => {
      if (cancelled) return;
      if (params.get("verified") === "true") setVerifiedMessage(true);
      if (!signedIn && arrivedExpired) setExpiredNotice(true);
    });

    // localStorage still remembers a user, but access is granted by the
    // httpOnly session cookie, and that is what expires. Bouncing to the
    // dashboard on the strength of the local copy alone sends the tab into a
    // redirect loop once the cookie is gone: middleware pushes it straight
    // back here, this effect pushes it back again. So confirm the session is
    // really alive first, and if it is not, clear the local copy and say so.
    if (signedIn) {
      (async () => {
        const alive = arrivedExpired ? false : await checkServerSession();
        if (cancelled) return;
        if (alive) {
          router.replace(signedIn.role === "admin" ? "/admin" : "/dashboard");
          return;
        }
        await signOut();
        if (!cancelled) setExpiredNotice(true);
      })();
    }

    return () => { cancelled = true; };
  }, [router]);

  function handleSubmit() {
    if (rateLocked) return;
    setError("");
    setExpiredNotice(false);

    fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, portal }),
    })
      .then(async res => {
        const data = await res.json() as { ok: boolean; error?: string; retryAfter?: number; user?: { id: string; role?: string } & Record<string, unknown> };
        if (!data.ok) {
          if (res.status === 429) {
            setRateLocked(true);
            setError(data.error || "Too many attempts. Please wait before trying again.");
            // Auto-unlock the button after retryAfter seconds
            if (data.retryAfter) {
              setTimeout(() => { setRateLocked(false); setError(""); }, data.retryAfter * 1000);
            }
          } else {
            setError(data.error || "Unable to sign in.");
          }
          return;
        }
        localStorage.setItem("pointly_auth_session", data.user!.id);
        localStorage.setItem(`pointly_user_cache_${data.user!.id}`, JSON.stringify(data.user));
        // Hard navigation, not router.replace: the dashboard is gated by an
        // httpOnly cookie checked in middleware.ts, and Next's client router
        // cache can still be holding the pre-login "redirected to /sign-in"
        // result for /dashboard from earlier in the session. A soft nav can
        // silently reuse that stale result; a full document load (same as a
        // manual refresh, which is why that "fixes" it) re-runs middleware
        // against the cookie that was just set.
        //
        // A platform admin goes straight to the console: /dashboard is one
        // business's till, which is not what they signed in to run.
        window.location.href = data.user!.role === "admin" ? "/admin" : "/dashboard";
      })
      .catch(err => {
        console.error("[sign-in] Error:", err);
        setError("Unable to sign in. Please try again.");
      });
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authShell}>
        <section className={styles.brandPanel}>
          <div className={styles.brandTop}>
            <Wordmark height={56} />
          </div>

          <div className={styles.brandContent}>
            <div className={styles.eyebrow}>Point of sale</div>
            <h1 className={styles.headline}>Ring up the sale, print the receipt, send it on WhatsApp.</h1>
            <p className={styles.supportingText}>One counter app for sales, invoices, expenses and your team — at the till or on your phone.</p>
            <div className={styles.brandStats}>
              <span className={styles.statPill}>POS &amp; invoices</span>
              <span className={styles.statPill}>WhatsApp receipts</span>
              <span className={styles.statPill}>Revenue reports</span>
            </div>
          </div>

          <div className={styles.brandBottom}>
            <div className={styles.miniCard}>
              <div className={styles.miniCardTitle}>Today at a glance</div>
              <div className={styles.miniCardText}>Sales, payments and expenses stay in sync across every device.</div>
            </div>
          </div>
        </section>

        <section className={styles.formPanel}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>{portal === "admin" ? "Admin login" : "Staff login"}</h2>
              <p className={styles.formSubtitle}>
                {portal === "admin"
                  ? "Full access for business owners and managers."
                  : "Sign in to your assigned counter."}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 4, borderRadius: 12, background: "#fdf3ec", marginBottom: 20 }}>
              {([
                { key: "admin", label: "Admin", Icon: ShieldCheck },
                { key: "staff", label: "Staff", Icon: Users },
              ] as const).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPortal(key); setError(""); }}
                  style={{
                    border: "none", borderRadius: 9, padding: "10px 12px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    background: portal === key ? "#fff" : "transparent",
                    color: portal === key ? "#c2410c" : "#7a746c",
                    fontWeight: 700, boxShadow: portal === key ? "0 2px 8px rgba(80,40,18,.08)" : "none",
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {expiredNotice && (
              <div role="status" style={{ padding: "12px 16px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <Clock size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: "#92400e", fontWeight: 600, lineHeight: 1.45 }}>
                    Your session has expired. For security, logins last 4 days — please sign in again to keep your sales syncing.
                  </div>
                </div>
              </div>
            )}

            {verifiedMessage && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#fff" }}>✓</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#065f46", fontWeight: 600 }}>
                    Email verified successfully! You can now sign in.
                  </div>
                </div>
              </div>
            )}

            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} />
                <input className={styles.input} type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <div className={styles.inputWrap}>
                <LockKeyhole size={16} className={styles.inputIcon} />
                <input className={`${styles.input} ${styles.passwordInput}`} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className={styles.iconButton}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className={styles.error}>{error}</div>}

            <button type="button" onClick={handleSubmit} disabled={rateLocked} className={styles.primaryButton}
              style={rateLocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
              {rateLocked ? "Too many attempts — wait and retry" : <><span>Sign in</span> <ArrowRight size={14} /></>}
            </button>

            <p className={styles.footerText}>
              New to Pointly? <Link href="/sign-up" className={styles.footerLink}>Create an account</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
