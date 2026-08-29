import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Pointly to run sales, invoices, revenue, and your team.",
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
