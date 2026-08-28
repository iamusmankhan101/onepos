import { redirect } from "next/navigation";

// The POS is this app's home screen — /dashboard exists only so the sign-in
// redirect (and any old bookmark) lands somewhere real.
export default function DashboardHome() {
  redirect("/dashboard/pos");
}
