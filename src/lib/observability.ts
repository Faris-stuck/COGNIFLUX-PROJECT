import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * Lightweight request-ID JSON logging.
 *
 * HOW ROUTES OPT IN
 * -----------------
 * Wrap the existing handler inside withRequestId. No other changes needed:
 *
 *   import { withRequestId } from "@/lib/observability";
 *   export const GET = withRequestId(async (req: NextRequest) => {
 *     return NextResponse.json({ hello: "world" });
 *   });
 *
 * The wrapper:
 *   1. generates (or honors an incoming `x-request-id`) request id,
 *   2. times the handler,
 *   3. emits exactly one JSON log line to stdout:
 *      {"ts":"...","method":"GET","path":"/api/x","status":200,"durationMs":3,"requestId":"..."},
 *   4. sets `x-request-id` on the response so clients can correlate.
 *
 * Secrets are never logged — only method/path/status/duration/request-id.
 */

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id")?.trim() || randomUUID();
}

export type Handler = (
  req: NextRequest,
  ctx: { requestId: string },
) => Promise<NextResponse> | NextResponse;

export function withRequestId(handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = getRequestId(req);
    const start = performance.now();
    let res: NextResponse;
    try {
      res = await handler(req, { requestId });
    } catch (err) {
      // Log the failure without leaking internals; rethrow for Next's error page.
      logRequest(req, 500, performance.now() - start, requestId);
      throw err;
    }
    const durationMs = performance.now() - start;
    logRequest(req, res.status, durationMs, requestId);
    res.headers.set("x-request-id", requestId);
    return res;
  };
}

function logRequest(
  req: NextRequest,
  status: number,
  durationMs: number,
  requestId: string,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.nextUrl.pathname,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
      requestId,
    }),
  );
}
