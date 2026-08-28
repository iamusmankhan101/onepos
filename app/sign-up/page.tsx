"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, LockKeyhole, Mail, Phone, User } from "lucide-react";
import Wordmark from "@/components/wordmark";
import styles from "../auth.module.css";

// `businessName` is the API's field name (unchanged so nothing downstream breaks);
// what it means here is simply the business the account belongs to.
const FIELDS = [
  { id: "ownerName", label: "Your name",     icon: User,        type: "text",     placeholder: "Ali Raza"          },
  { id: "businessName", label: "Business name", icon: Building2,   type: "text",     placeholder: "Raza Traders"      },
  { id: "email",     label: "Email",         icon: Mail,        type: "email",    placeholder: "owner@example.com" },
  { id: "phone",     label: "Phone",         icon: Phone,       type: "tel",      placeholder: "+92 300 1234567"   },
  { id: "password",  label: "Password",      icon: LockKeyhole, type: "password", placeholder: "Minimum 8 characters" },
] as const;

export default function SignUpPage() {
  const [form, setForm] = useState({ ownerName: "", businessName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  function setField(field: keyof typeof form, value: string) {
    setForm((c) => ({ ...c, [field]: value }));
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSending(true);
    try {
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:     form.email,
          password:  form.password,
          ownerName: form.ownerName,
          businessName: form.businessName || form.ownerName,
          phone:     form.phone,
        }),
      });
      const signupData = await signupRes.json() as { ok: boolean; error?: string };
      if (!signupData.ok) {
        setSending(false);
        setError(signupData.error || "Could not create the account. Please try again.");
        return;
      }

      // Sign straight in — the account is usable immediately, and this is what
      // sets the httpOnly session cookie the dashboard is gated on.
      const signinRes = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, portal: "admin" }),
      });
      const signinData = await signinRes.json() as { ok: boolean; error?: string; user?: { id: string } & Record<string, unknown> };
      if (!signinData.ok || !signinData.user) {
        setSending(false);
        setError("Your account was created — please sign in to continue.");
        return;
      }

      localStorage.setItem("onepos_auth_session", signinData.user.id);
      localStorage.setItem(`onepos_user_cache_${signinData.user.id}`, JSON.stringify(signinData.user));
      // Full document load so middleware re-runs against the cookie just set —
      // see the same note on the sign-in page.
      window.location.href = "/dashboard/pos";
    } catch (err) {
      setSending(false);
      setError(err instanceof Error ? err.message : "Unable to create account.");
    }
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authShell}>

        {/* Brand panel */}
        <section className={styles.brandPanel}>
          <div className={styles.brandTop}>
            <Wordmark />
          </div>
          <div className={styles.brandContent}>
            <div className={styles.eyebrow}>Get started</div>
            <h1 className={styles.headline}>Ring up every sale, and send the receipt before the customer leaves.</h1>
            <p className={styles.supportingText}>Point of sale, invoices, revenue, and your team — in one workspace.</p>
            <div className={styles.brandStats}>
              <span className={styles.statPill}>POS &amp; invoices</span>
              <span className={styles.statPill}>WhatsApp receipts</span>
              <span className={styles.statPill}>Revenue reports</span>
            </div>
          </div>
          <div className={styles.brandBottom}>
            <div>Built for owners, managers, and the people on the counter.</div>
            <div className={styles.miniCard}>
              <div className={styles.miniCardTitle}>Quick setup</div>
              <div className={styles.miniCardText}>Your workspace is ready as soon as you sign up.</div>
            </div>
          </div>
        </section>

        {/* Form panel */}
        <section className={styles.formPanel}>
          <form onSubmit={handleSubmit} className={styles.formCard}>
            <div className={styles.formHeader}>
              <h1 className={styles.formTitle} style={{ marginTop: 14 }}>Create your account</h1>
              <p className={styles.formSubtitle}>Fill in your business details — you&apos;ll land straight in the POS.</p>
            </div>

            <div className={styles.fieldGrid}>
              {FIELDS.map(({ id, label, icon: Icon, type, placeholder }) => (
                <label key={id} className={id === "password" ? styles.fullField : undefined}>
                  <span className={styles.label}>{label}</span>
                  <div className={styles.inputWrap}>
                    <Icon size={16} className={styles.inputIcon} />
                    <input
                      className={styles.input}
                      type={type}
                      placeholder={placeholder}
                      value={form[id]}
                      onChange={(e) => setField(id, e.target.value)}
                      required
                    />
                  </div>
                </label>
              ))}
            </div>

            {error && <div className={`${styles.error} ${styles.signupError}`}>{error}</div>}

            <button type="submit" className={styles.primaryButton} disabled={sending}>
              {sending ? "Creating…" : <>Create account <ArrowRight size={14} /></>}
            </button>

            <p className={styles.footerText} style={{ marginTop: 16 }}>
              Already have an account? <Link href="/sign-in" className={styles.footerLink}>Sign in</Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
