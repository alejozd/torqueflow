import { NextRequest, NextResponse } from "next/server";
import { extractTenantSlug } from "@/lib/tenant/subdomain";
import { TENANT_SLUG_HEADER } from "@/lib/tenant/constants";

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
