// Worker-side glue between an incoming Request and src/entry-server.tsx.
//
// Responsibilities:
//   1. Pull the prebuilt index.html template from the ASSETS binding (so
//      Vite-injected hashed asset URLs resolve correctly in production).
//   2. Read the session cookie and, if present, prefetch the authenticated
//      user so the SSR pass renders the dashboard instead of a flash of
//      "loading…" before the client hydrates.
//   3. Hand the request off to entry-server.render.

import type { Context } from "hono";
// The SSR entry is JSX. The worker tsconfig doesn't compile JSX (adding it
// drags in DOM types and breaks existing crypto code), so we suppress the
// type-resolution here. Vite resolves the module at bundle time, and the
// runtime contract is documented inline below.
// @ts-expect-error -- JSX module bundled by Vite, not type-checked here.
import { render as _render } from "../src/entry-server";

interface RenderOptions {
  template: string;
  auth?: { token: string | null; user: unknown | null } | null;
  locale?: string | null;
  prefetched?: Array<{ queryKey: unknown[]; data: unknown }>;
}
interface RenderResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}
const render = _render as (
  request: Request,
  opts: RenderOptions,
) => Promise<RenderResult>;

import { readSessionCookie } from "./lib/cookies";
import { verifyJWT } from "./lib/jwt";
import { getJwtSecret } from "./lib/config";
import { proxyImageUrl } from "./lib/proxyImage";
import siteRoutes from "./routes/site";
import type { UserRow, Variables } from "./types";

type AppEnv = { Bindings: Env; Variables: Variables };

async function loadAuth(c: Context<AppEnv>) {
  const token = readSessionCookie(c);
  if (!token) return null;

  try {
    const secret = await getJwtSecret(c.env.KV_SESSIONS);
    const payload = await verifyJWT(token, secret);
    const session = await c.env.DB.prepare(
      "SELECT s.id, u.is_active FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND u.kind = 'user'",
    )
      .bind(payload.sessionId)
      .first<{ id: string; is_active: number }>();
    if (!session || !session.is_active) return null;

    const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(payload.sub)
      .first<UserRow>();
    if (!row) return null;

    return {
      token,
      user: {
        id: row.id,
        email: row.email,
        username: row.username,
        display_name: row.display_name,
        avatar_url: await proxyImageUrl(
          c.env.APP_URL,
          c.env.DB,
          row.avatar_url,
        ),
        unproxied_avatar_url: row.avatar_url,
        role: row.role,
        email_verified: row.email_verified === 1,
      },
    };
  } catch {
    return null;
  }
}

async function loadTemplate(c: Context<AppEnv>): Promise<string | null> {
  if (!c.env.ASSETS) return null;
  // ASSETS is keyed by request URL path; ask it for "/index.html" specifically.
  const url = new URL(c.req.url);
  url.pathname = "/index.html";
  const res = await c.env.ASSETS.fetch(new Request(url.toString()));
  if (!res.ok) return null;
  return await res.text();
}

export async function ssrHandler(c: Context<AppEnv>): Promise<Response> {
  const template = await loadTemplate(c);
  if (!template) {
    return new Response("SSR template missing", { status: 500 });
  }

  const auth = await loadAuth(c);

  // Prefetch the global ["site"] query. Almost every page uses
  // useQuery({ queryKey: ["site"] }) for theming and gating; populating it
  // server-side means the rendered HTML matches what the client would
  // produce after fetching, removing the post-hydration flash.
  const prefetched: Array<{ queryKey: unknown[]; data: unknown }> = [];
  try {
    const siteUrl = new URL(c.req.url);
    siteUrl.pathname = "/site";
    const siteRes = await siteRoutes.fetch(
      new Request(siteUrl.toString(), { headers: c.req.raw.headers }),
      c.env,
      c.executionCtx,
    );
    if (siteRes.ok) {
      const data = await siteRes.json();
      prefetched.push({ queryKey: ["site"], data });
    }
  } catch (err) {
    console.error("SSR site prefetch failed:", err);
  }

  // Pick a locale from the i18nextLng cookie (set by the browser-side
  // detector) or fall back to Accept-Language. Phase 9 wires this through
  // to a per-request i18next instance; for now we just pass it along.
  const cookieLocale = (() => {
    const raw = c.req.header("Cookie");
    if (!raw) return null;
    for (const part of raw.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "i18nextLng") return rest.join("=") || null;
    }
    return null;
  })();
  const acceptLang = c.req.header("Accept-Language");
  const locale =
    cookieLocale ?? acceptLang?.split(",")[0]?.split("-")[0] ?? "en";

  try {
    const result = await render(c.req.raw, {
      template,
      auth: auth ?? undefined,
      locale,
      prefetched,
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (err) {
    console.error("SSR error:", err);
    // Last-ditch: return the un-rendered template so the client can still
    // hydrate. Better than a blank 500.
    return new Response(
      template
        .replace("<!--app-head-->", "")
        .replace("<!--app-html-->", "")
        .replace("<!--app-state-->", ""),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
