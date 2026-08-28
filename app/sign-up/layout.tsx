import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your OnePOS account and run sales, invoices, revenue, and your team from one dashboard.",
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
