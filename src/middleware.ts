import { NextRequest, NextResponse } from "next/server";

/**
 * Global request middleware.
 *
 * WHY THIS EXISTS
 * ---------------
 * `withRequestId` (src/lib/observability.ts) gives per-route JSON logging, but it
 * has to be applied route by route and only 2 of 27 API routes used it. That left
 * most responses with no correlation id, so an nginx access-log line could not be
 * matched to an application log line or reported back to a user in a bug report.
 *
 * This middleware guarantees `x-request-id` on EVERY response (pages and API):
 *   - honors the id nginx forwards as `X-Request-Id` (see the vhost config), so
 *     the edge log, the app log and the client all share one id;
 *   - falls back to a generated UUID for direct/loopback requests.
 *
 * It deliberately does NOT duplicate the security headers set by nginx: those are
 * applied at the edge for all responses including static assets and error pages,
 * and duplicating them here would emit each header twice.
 *
 * Runs on the Edge runtime — keep it dependency-free and side-effect free.
 */

const HEADER = "x-request-id";

export function middleware(req: NextRequest) {
  const incoming = req.headers.get(HEADER)?.trim();
  const requestId = incoming && incoming.length <= 200 ? incoming : crypto.randomUUID();

  // Forward the id to the route handler so withRequestId reuses it instead of
  // minting a second, different id.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(HEADER, requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(HEADER, requestId);
  return res;
}

export const config = {
  // Everything except Next's own static output and the favicon: those are served
  // with immutable caching and gain nothing from a per-request id.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
