/**
 * The platform-admin console lives outside the (dashboard) group on purpose:
 * it manages every business rather than one, so none of the tenant chrome —
 * sidebar, branch switcher, Turso data sync — applies to it.
 *
 * The gate is server-side. middleware.ts only proves a session is valid, not
 * what role it carries, so the role check has to happen somewhere that can
 * read the database, and doing it here keeps the page itself from ever
 * rendering for a signed-in business owner who guesses the URL.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/auth-db";
import { COOKIE_NAME, LEGACY_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const metadata: Metadata = {
  title: "Admin Console",
  description: "Manage every Pointly account.",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value ?? cookieStore.get(LEGACY_COOKIE_NAME)?.value;
  const userId = token ? verifySessionToken(token) : null;
  const user = userId ? await getUserById(userId) : null;

  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/dashboard");

  return <>{children}</>;
}
