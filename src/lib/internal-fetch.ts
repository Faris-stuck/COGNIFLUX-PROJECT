import { headers } from "next/headers";

/**
 * Internal server-to-server fetch for React Server Components.
 *
 * WHY THIS EXISTS
 * ---------------
 * Server components in this app render by calling our own API routes. They used
 * to build the URL from NEXT_PUBLIC_SITE_URL, which in production is the public
 * hostname. That produced two real defects:
 *
 *  1. RATE-LIMIT BUCKET COLLAPSE. The request left the box, went to Cloudflare,
 *     came back to nginx, and arrived at /api/search with the *server's* own IP.
 *     Every visitor's server-rendered search therefore shared a single per-IP
 *     bucket (cf:rl:search:<origin-ip>), so a handful of page loads could
 *     exhaust the limit for everyone while a genuinely abusive client kept its
 *     own untouched bucket. The limiter was measuring the wrong subject.
 *
 *  2. WASTED LATENCY AND QUOTA. Each SSR render made a full public round-trip
 *     (TLS to the edge, edge back to origin) to reach a port on localhost, and
 *     consumed an nginx limit_req slot that was meant for real visitors.
 *
 * The fix is to talk to the app over loopback and to forward the identity
 * headers of the *original* visitor, so the API's clientIp() attributes the
 * call to the person who triggered it rather than to the server.
 *
 * SECURITY NOTE: only the headers our own edge sets are forwarded
 * (cf-connecting-ip, x-real-ip, x-request-id). Nothing from the client body or
 * cookie jar is copied, and the base URL is hardcoded to loopback, so this
 * helper cannot be turned into an SSRF primitive by user input — callers only
 * supply a path.
 */

const INTERNAL_BASE = `http://127.0.0.1:${process.env.PORT ?? "3100"}`;

/** Headers safe to propagate inward: all are set by nginx/Cloudflare, not by the client. */
const FORWARD = ["cf-connecting-ip", "x-real-ip", "x-request-id", "accept-language"] as const;

export async function internalFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith("/")) throw new Error("internalFetch: path must start with /");

  const incoming = await headers();
  const outgoing = new Headers(init?.headers);
  for (const name of FORWARD) {
    const v = incoming.get(name);
    if (v) outgoing.set(name, v);
  }
  // Preserve the visitor's IP for the limiter even when Cloudflare is bypassed
  // (direct origin access, health probes): x-real-ip is nginx's resolved value.
  if (!outgoing.has("x-real-ip")) {
    const xff = incoming.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length) outgoing.set("x-real-ip", parts[parts.length - 1]);
    }
  }
  outgoing.set("host", `127.0.0.1:${process.env.PORT ?? "3100"}`);

  return fetch(`${INTERNAL_BASE}${path}`, { ...init, headers: outgoing });
}
