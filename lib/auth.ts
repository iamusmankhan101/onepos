export interface AuthUser {
  id: string;
  ownerName: string;
  businessName: string;
  email: string;
  phone: string;
  role: "owner" | "manager" | "staff" | "admin";
  createdAt: string;
  businessOwnerId?: string;
  staffId?: string;
  locationId?: string;
  permissions?: string[];
  approvalStatus?: "pending" | "approved" | "rejected";
}

interface StoredUser extends AuthUser {
  password: string;
  emailVerified: boolean;
}

const USERS_KEY = "pointly_auth_users";
const SESSION_KEY = "pointly_auth_session";

/**
 * This app stored under an `onepos_` prefix before the rename. Copy anything
 * still sitting under the old prefix so a browser that was signed in across
 * the rename keeps its session and cached data rather than appearing logged
 * out with an empty catalogue.
 *
 * Runs at module load — every store imports this file, so it lands before any
 * of them read. Safe to delete once no pre-rename browsers are in use.
 */
function migrateLegacyStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    const legacy = Object.keys(localStorage).filter((key) => key.startsWith("onepos_"));
    for (const key of legacy) {
      const renamed = `pointly_${key.slice("onepos_".length)}`;
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(renamed) === null) {
        localStorage.setItem(renamed, value);
      }
      localStorage.removeItem(key);
    }
  } catch { /* storage blocked — nothing to migrate */ }
}
migrateLegacyStorage();

const demoUser: StoredUser = {
  id: "demo-owner",
  ownerName: "Demo Owner",
  businessName: "My Business",
  email: "owner@pointly.app",
  phone: "+92 300 1234567",
  role: "owner",
  createdAt: "2026-03-19",
  password: "Pointly123",
  emailVerified: true,
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function withoutPassword(user: StoredUser): AuthUser {
  return {
    id: user.id,
    ownerName: user.ownerName,
    businessName: user.businessName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Admin authenticates via the /api/auth/signin route (Turso DB) only —
// never stored in client-side localStorage seed data.
const SEED_USERS = [demoUser];

export function getUsers(): StoredUser[] {
  if (!canUseStorage()) return SEED_USERS;

  const saved = localStorage.getItem(USERS_KEY);
  if (!saved) {
    localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }

  try {
    let parsed = JSON.parse(saved) as StoredUser[];
    let changed = false;
    for (const seed of SEED_USERS) {
      if (!parsed.some((u) => u.id === seed.id)) {
        parsed = [seed, ...parsed];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(USERS_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }
}

export function getCurrentUser(): AuthUser | null {
  if (!canUseStorage()) return null;

  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;

  // First check if user data is cached in localStorage
  const cachedUser = localStorage.getItem(`pointly_user_cache_${sessionId}`);
  if (cachedUser) {
    try {
      return JSON.parse(cachedUser);
    } catch {
      // Fall through to check old system
    }
  }

  // Fallback to old localStorage system for backward compatibility
  const user = getUsers().find((item) => item.id === sessionId);
  return user ? withoutPassword(user) : null;
}

export function signIn(email: string, password: string): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== password) {
    throw new Error("Invalid email or password.");
  }

  if (!user.emailVerified) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  localStorage.setItem(SESSION_KEY, user.id);
  return withoutPassword(user);
}

export function signUp(input: {
  ownerName: string;
  businessName: string;
  email: string;
  phone: string;
  password: string;
  adminCode?: string;
}): AuthUser {
  const users = getUsers();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  // Admin sign-up is handled server-side via /api/auth/signup — not client-side.
  const isAdmin = false;
  const user: StoredUser = {
    id: "user_" + Date.now(),
    ownerName: input.ownerName.trim(),
    businessName: input.businessName?.trim() || input.ownerName.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    role: isAdmin ? "admin" : "owner",
    createdAt: new Date().toISOString().split("T")[0],
    password: input.password,
    emailVerified: isAdmin, // admin skips email verification
  };

  localStorage.setItem(USERS_KEY, JSON.stringify([user, ...users]));
  if (isAdmin) localStorage.setItem(SESSION_KEY, user.id); // auto-login only for admin
  return withoutPassword(user);
}

export function markEmailVerified(email: string): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  const users = getUsers();
  const idx = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);
  if (idx === -1) throw new Error("Account not found.");
  users[idx] = { ...users[idx], emailVerified: true };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(SESSION_KEY, users[idx].id);
  
  // Migrate any plan that was set before login (during sign-up)
  const basePlanKey = "pointly_active_plan";
  const tempPlan = localStorage.getItem(basePlanKey);
  if (tempPlan) {
    // Move it to the user-scoped key
    localStorage.setItem(`${basePlanKey}_${users[idx].id}`, tempPlan);
    localStorage.removeItem(basePlanKey);
  }
  
  return withoutPassword(users[idx]);
}

export function updateCurrentUser(input: Partial<Pick<AuthUser, "ownerName" | "businessName" | "phone">>): AuthUser {
  const current = getCurrentUser();
  if (!current) throw new Error("You must be signed in to update your account.");

  const users = getUsers();
  const existsLocally = users.some((user) => user.id === current.id);

  if (existsLocally) {
    // Standard path: update local users list
    const updatedUsers = users.map((user) =>
      user.id === current.id
        ? {
            ...user,
            ownerName: input.ownerName?.trim() || user.ownerName,
            businessName: input.businessName?.trim() || user.businessName,
            phone: input.phone?.trim() || user.phone,
          }
        : user
    );
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
    const updated = updatedUsers.find((user) => user.id === current.id)!;
    // Refresh cache so getCurrentUser() picks up the changes immediately
    localStorage.setItem(`pointly_user_cache_${current.id}`, JSON.stringify(withoutPassword(updated)));
    return withoutPassword(updated);
  } else {
    // Cloud/Turso user: not in local list — update the session cache directly
    const updatedUser: AuthUser = {
      ...current,
      ownerName: input.ownerName?.trim() || current.ownerName,
      businessName: input.businessName?.trim() || current.businessName,
      phone:     input.phone?.trim()     || current.phone,
    };
    localStorage.setItem(`pointly_user_cache_${current.id}`, JSON.stringify(updatedUser));
    return updatedUser;
  }
}

export async function updateCurrentPassword(currentPassword: string, nextPassword: string) {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ currentPassword, newPassword: nextPassword }),
  });
  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || "Password could not be updated.");
}

/**
 * Verifies the session cookie is still valid against the server (the 7-day
 * expiry is enforced server-side; getCurrentUser() only reads a local cache
 * and has no way to notice the cookie has died). Without this check, a tab
 * left open past expiry keeps rendering normally while every background
 * save silently 401s — the write reaches nothing but this browser's
 * localStorage for as long as nobody notices. Call this periodically so an
 * expired session surfaces as a re-login prompt instead of days of silently
 * un-synced data.
 */
export async function checkServerSession(): Promise<boolean> {
  if (!canUseStorage()) return true;
  try {
    const res = await fetch("/api/auth/user", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return false;
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    // Network hiccup, not a session problem — don't force a sign-out for it.
    return true;
  }
}

export async function signOut() {
  if (!canUseStorage()) return;
  const sessionId = localStorage.getItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (sessionId) localStorage.removeItem(`pointly_user_cache_${sessionId}`);
  try {
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // The local session is already cleared. A later server request will still
    // enforce the remaining cookie until connectivity is restored.
  }
}

/**
 * Returns a user-scoped localStorage key.
 * e.g. userKey("pointly_appointments") → "pointly_appointments_user_1234567890"
 * Falls back to the base key if no user is logged in (SSR / unauthenticated).
 */
export function userKey(base: string): string {
  if (!canUseStorage()) return base;
  const current = getCurrentUser();
  if (!current) return base;
  return `${base}_${current.businessOwnerId || current.id}`;
}

/**
 * Check if the current user has permission to access a specific feature/page.
 * Returns true for owner/admin/manager roles, or if staff has the specific permission.
 * 
 * @param permission - The permission key to check (e.g., "calendar", "appointments", "inventory")
 * @returns boolean indicating if user has access
 */
export function hasPermission(permission: string): boolean {
  if (!canUseStorage()) return false;
  
  const user = getCurrentUser();
  if (!user) return false;
  
  // Owner-only routes
  const ownerOnlyRoutes = ["admin", "billing", "migrate"];
  if (ownerOnlyRoutes.includes(permission)) {
    return user.role === "owner" || user.role === "admin";
  }
  
  // Account and settings are accessible to owner and manager
  if (permission === "account" || permission === "settings") {
    return user.role === "owner" || user.role === "admin" || user.role === "manager";
  }
  
  // Owner, admin, and manager always have full access to other routes
  if (user.role === "owner" || user.role === "admin" || user.role === "manager") {
    return true;
  }
  
  // Check if staff has wildcard permission
  if (user.permissions?.includes("*")) {
    return true;
  }
  
  // Check if staff has the specific permission
  return user.permissions?.includes(permission) ?? false;
}

/**
 * Get all permissions for the current user.
 * Returns all page permissions for owner/admin/manager, or specific permissions for staff.
 */
export function getUserPermissions(): string[] {
  const user = getCurrentUser();
  if (!user) return [];
  
  // Owner, admin, and manager get all permissions
  if (user.role === "owner" || user.role === "admin" || user.role === "manager") {
    return ["*"]; // Wildcard means all permissions
  }
  
  return user.permissions || [];
}

/**
 * Check if the current user is staff with limited permissions.
 * Used for conditional UI rendering.
 */
export function isLimitedStaff(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return user.role === "staff" && !user.permissions?.includes("*");
}

/**
 * Returns the user if the email exists in storage but is NOT yet verified.
 * Returns null if the email doesn't exist, or if it exists and IS already verified.
 * Used by the sign-up page to resend verification instead of showing a hard error.
 */
export function getUnverifiedUser(email: string): AuthUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || user.emailVerified) return null;
  return withoutPassword(user);
}
