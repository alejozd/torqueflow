import { NextResponse, type NextRequest } from "next/server";
import { construirCsp } from "@/lib/security-headers";

/**
 * Per-request CSP nonce (Next's own CSP guide). The CSP goes on the REQUEST
 * too: that is where Next reads the nonce from while rendering, to stamp it on
 * its framework/page scripts. Every page must therefore render dynamically --
 * the root layout calls connection() for exactly this reason.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = construirCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // API routes return JSON/images and static assets carry no HTML, so
      // neither needs a CSP; prefetches would only waste a nonce.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
