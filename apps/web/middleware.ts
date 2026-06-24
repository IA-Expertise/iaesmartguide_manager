import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  const isLocal = hostname.includes("localhost");
  const isRoot =
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === "localhost:3000";

  if (isRoot || url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  let subdomain: string | null = null;

  if (isLocal && hostname.includes(".localhost")) {
    subdomain = hostname.split(".localhost")[0];
  } else if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    subdomain = hostname.replace(`.${ROOT_DOMAIN}`, "");
  }

  if (!subdomain || subdomain === "www") {
    return NextResponse.next();
  }

  // Dev: ?site=slug on localhost without subdomain
  if (isLocal && url.searchParams.has("site")) {
    subdomain = url.searchParams.get("site")!;
    return NextResponse.rewrite(new URL(`/_sites/${subdomain}${url.pathname}`, req.url));
  }

  return NextResponse.rewrite(new URL(`/_sites/${subdomain}${url.pathname}`, req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
