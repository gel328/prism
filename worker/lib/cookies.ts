// Session cookie helpers.
//
// We mirror the Bearer-token JWT into an HttpOnly cookie so that the SSR
// render path (where the worker is the user-agent) can authenticate the
// request without any JS having run. Existing Bearer-header callers
// (CLI, third-party tools, in-flight tabs) keep working.

import type { Context } from "hono";

export const SESSION_COOKIE = "prism_session";

export function setSessionCookie(
  c: Context,
  token: string,
  ttlSeconds: number,
): void {
  // SameSite=Lax: lets the cookie ride top-level navigations (incl. social
  // OAuth callback redirects) but blocks cross-site POSTs.
  // HttpOnly: keeps JS from reading it, so token theft via XSS is harder.
  // Secure: production is HTTPS-only; local `vite dev` over HTTP also works
  // because browsers exempt localhost from the Secure check.
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`,
    { append: true },
  );
}

export function clearSessionCookie(c: Context): void {
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    { append: true },
  );
}

export function readSessionCookie(c: Context): string | null {
  const raw = c.req.header("Cookie");
  if (!raw) return null;
  const parts = raw.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}
