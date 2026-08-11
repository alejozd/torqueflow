import { NextRequest, NextResponse } from "next/server";
import { extractTenantSlug } from "@/lib/tenant/subdomain";
import { TENANT_SLUG_HEADER } from "@/lib/tenant/constants";

if (!process.env.BASE_DOMAIN && process.env.NODE_ENV === "production") {
  throw new Error(
    "BASE_DOMAIN environment variable must be set in production — without it, tenant " +
      "resolution silently falls back to a default domain and every authenticated " +
      "user would be locked out on mismatch.",
  );
}

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "zdevs.uk";

export function middleware(request: NextRequest) {
  const slug = extractTenantSlug(request.headers.get("host"), BASE_DOMAIN);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set(TENANT_SLUG_HEADER, slug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
