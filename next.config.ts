import type { NextConfig } from "next";

/**
 * Cogniflux production build configuration.
 *
 * `output: "standalone"` emits a self-contained server bundle in
 * .next/standalone with only the node_modules actually reachable from the
 * server graph. On a ~3.7 GB VPS this matters twice over:
 *   - the deployable artifact is far smaller than a full node_modules tree,
 *   - `node .next/standalone/server.js` boots without dev tooling resident.
 *
 * Deliberately NOT set:
 *   - typescript.ignoreBuildErrors — type errors must fail the build.
 *   - eslint.ignoreDuringBuilds   — lint errors must fail the build.
 * Both would trade correctness for a green build.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  // Emit build traces from the repo root so the standalone bundle resolves
  // node_modules correctly when copied to a deploy target.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,

  // Conventional short probe paths for proxies/orchestrators, mapped onto the
  // real route handlers. Rewrites (not redirects) so probes get 200/503
  // directly instead of a 3xx a load balancer would have to follow.
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/readyz", destination: "/api/readyz" },
    ];
  },
};

export default nextConfig;
