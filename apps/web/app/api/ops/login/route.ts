import { NextResponse } from "next/server";
import { opsCookieValue, OPS_COOKIE_NAME } from "@/lib/ops-auth";

export async function POST(req: Request) {
  const password = process.env.OPS_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "OPS_PASSWORD não configurado" }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.password !== password) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPS_COOKIE_NAME, opsCookieValue(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
