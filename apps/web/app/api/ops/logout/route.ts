import { NextResponse } from "next/server";
import { OPS_COOKIE_NAME } from "@/lib/ops-auth";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/ops/login", origin));
  res.cookies.set(OPS_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
