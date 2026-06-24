import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br";

function normalizeHost(host: string): string {
  return host.split(":")[0].toLowerCase();
}

function isMainDomain(hostname: string): boolean {
  return (
    hostname.includes("localhost") ||
    hostname.endsWith(".vercel.app") ||
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}`
  );
}

function extractSubdomain(hostname: string): string | null {
  if (hostname.includes("localhost") && hostname.includes(".localhost")) {
    return hostname.split(".localhost")[0];
  }

  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!subdomain || subdomain.includes(".") || subdomain === "www") {
    return null;
  }

  return subdomain;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = normalizeHost(req.headers.get("host") ?? "");

  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // www → domínio raiz (SEO e cookies consistentes)
  if (hostname === `www.${ROOT_DOMAIN}`) {
    const target = new URL(url.pathname + url.search, `https://${ROOT_DOMAIN}`);
    return NextResponse.redirect(target, 308);
  }

  // Preview via ?site=slug no domínio principal
  const siteParam = url.searchParams.get("site");
  if (siteParam && isMainDomain(hostname)) {
    return NextResponse.rewrite(new URL(`/sites/${siteParam}${url.pathname}`, req.url));
  }

  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    return NextResponse.rewrite(new URL(`/sites/${subdomain}${url.pathname}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
