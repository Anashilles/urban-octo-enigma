import { NextResponse, type NextRequest } from "next/server";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Builds a per-request Content-Security-Policy with a nonce. Next.js applies
 * the nonce to its own scripts automatically (see the CSP guide).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  // Only upgrade when the site is served over HTTPS (a local `docker compose up` is plain HTTP).
  const upgrade = !isDev && Boolean(process.env.APP_URL?.startsWith("https://"));
  const realtime = originOf(process.env.REALTIME_PUBLIC_URL?.replace(/^ws/, "http"))?.replace(/^http/, "ws");
  const storage = originOf(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
  const connect = ["'self'", "blob:", "data:", realtime, storage, isDev ? "ws://localhost:*" : null].filter(Boolean);
  const images = ["'self'", "blob:", "data:", storage].filter(Boolean);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by React and the 3D overlay labels.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgrade ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
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
      source: "/((?!api|_next/static|_next/image|icon.svg|assets/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
