import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br";

function isMainDomain(hostname: string): boolean {
  return (
    hostname.includes("localhost") ||
    hostname.endsWith(".vercel.app") ||
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}`
  );
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Preview via ?site=slug no domínio principal (local, vercel.app ou iaesmartguide.com.br)
  const siteParam = url.searchParams.get("site");
  if (siteParam && isMainDomain(hostname)) {
    return NextResponse.rewrite(new URL(`/sites/${siteParam}${url.pathname}`, req.url));
  }

  let subdomain: string | null = null;
  const isLocal = hostname.includes("localhost");

  if (isLocal && hostname.includes(".localhost")) {
    subdomain = hostname.split(".localhost")[0];
  } else if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    subdomain = hostname.replace(`.${ROOT_DOMAIN}`, "");
  }

  if (!subdomain || subdomain === "www") {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL(`/sites/${subdomain}${url.pathname}`, req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
