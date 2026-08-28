import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, tokenId } from "@/lib/session";
import { revokeDbSession } from "@/lib/auth-db";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  // Revoke server-side immediately — token becomes dead even if cookie is stolen
  if (token) {
    await revokeDbSession(tokenId(token)).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
