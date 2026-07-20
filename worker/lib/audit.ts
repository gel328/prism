// Transparent Control audit logs.
//
// A single append-only table (audit_events) backs three scopes:
//   • user     — a user's own security-relevant actions + authorizations of
//                the apps they own.
//   • team     — every edit / membership change under a team + authorizations
//                of apps the team owns.
//   • platform — every platform-admin action.
//
// Each recorded event can fan out to scoped "audit webhooks" (Discord /
// Telegram / General) so owners get real-time pushes. Delivery is always
// best-effort and must be wrapped in ctx.waitUntil at the call site.

import { randomId } from "./crypto";
import { decryptSecret } from "./secretCrypto";
import { loggedFetch } from "./logger";
import { validateOutboundUrl } from "./safeFetch";

export type AuditScope = "user" | "team" | "platform";

export interface AuditInput {
  scope: AuditScope;
  scopeId: string | null;
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}

export interface AuditEventRow {
  id: string;
  scope: AuditScope;
  scope_id: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: string;
  created_at: number;
}

const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Record one or more audit events and fan them out to matching webhooks.
 * Never throws — failures are swallowed so a logging hiccup can't break the
 * request it is observing. Call inside ctx.waitUntil for non-blocking writes,
 * or await it when ordering matters.
 */
export async function recordAudit(
  env: Env,
  ctx: ExecutionContext | { waitUntil: (p: Promise<unknown>) => void },
  inputs: AuditInput | AuditInput[],
): Promise<void> {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const now = Math.floor(Date.now() / 1000);
  try {
    for (const input of list) {
      const id = randomId();
      await env.DB.prepare(
        `INSERT INTO audit_events
           (id, scope, scope_id, action, actor_id, actor_name, resource_type,
            resource_id, resource_name, ip, user_agent, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          input.scope,
          input.scopeId ?? null,
          input.action,
          input.actorId ?? null,
          input.actorName ?? null,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.resourceName ?? null,
          input.ip ?? null,
          input.userAgent ?? null,
          JSON.stringify(input.metadata ?? {}),
          now,
        )
        .run();

      ctx.waitUntil(
        deliverAuditWebhooks(env, { ...input, id, created_at: now }).catch(
          () => {},
        ),
      );
    }
  } catch {
    // swallow — auditing must never break the observed request
  }
}

// ─── Metadata extraction from the request ────────────────────────────────────

export function auditRequestMeta(c: {
  req: { header: (h: string) => string | undefined };
}): { ip: string | null; userAgent: string | null } {
  const ip =
    c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;
  return { ip, userAgent };
}

// ─── Webhook delivery ────────────────────────────────────────────────────────

interface AuditWebhookRow {
  id: string;
  kind: "discord" | "telegram" | "general";
  config: string;
  events: string;
}

interface DeliveredEvent extends AuditInput {
  id: string;
  created_at: number;
}

async function deliverAuditWebhooks(
  env: Env,
  event: DeliveredEvent,
): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, kind, config, events FROM audit_webhooks WHERE scope = ? AND is_active = 1 AND ((scope_id IS NULL AND ? IS NULL) OR scope_id = ?)",
  )
    .bind(event.scope, event.scopeId ?? null, event.scopeId ?? null)
    .all<AuditWebhookRow>();

  const matching = results.filter((wh) => {
    let evts: string[];
    try {
      evts = JSON.parse(wh.events) as string[];
    } catch {
      return false;
    }
    return evts.includes("*") || evts.includes(event.action);
  });
  if (!matching.length) return;

  await Promise.all(
    matching.map(async (wh) => {
      let config: Record<string, unknown>;
      try {
        const decrypted = (await decryptSecret(env, wh.config)) ?? wh.config;
        config = JSON.parse(decrypted) as Record<string, unknown>;
      } catch {
        return;
      }
      try {
        if (wh.kind === "discord") await deliverDiscord(env, config, event);
        else if (wh.kind === "telegram")
          await deliverTelegram(env, config, event);
        else await deliverGeneral(env, config, event);
      } catch {
        // best-effort
      }
    }),
  );
}

function eventSummary(event: DeliveredEvent): string {
  const parts: string[] = [event.action];
  if (event.actorName) parts.push(`by ${event.actorName}`);
  if (event.resourceName) parts.push(`on ${event.resourceName}`);
  return parts.join(" ");
}

/** Values available to {placeholder} interpolation in General webhooks. */
export function auditPlaceholders(
  event: DeliveredEvent,
): Record<string, string> {
  return {
    id: event.id,
    scope: event.scope,
    scope_id: event.scopeId ?? "",
    action: event.action,
    actor_id: event.actorId ?? "",
    actor_name: event.actorName ?? "",
    resource_type: event.resourceType ?? "",
    resource_id: event.resourceId ?? "",
    resource_name: event.resourceName ?? "",
    ip: event.ip ?? "",
    user_agent: event.userAgent ?? "",
    timestamp: String(event.created_at),
    metadata: JSON.stringify(event.metadata ?? {}),
    summary: eventSummary(event),
  };
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in values ? values[key] : m,
  );
}

async function deliverDiscord(
  env: Env,
  config: Record<string, unknown>,
  event: DeliveredEvent,
): Promise<void> {
  const url = String(config.webhook_url ?? "");
  if (validateOutboundUrl(url) !== null) return;
  const fields = [
    { name: "Action", value: event.action, inline: true },
    event.actorName
      ? { name: "Actor", value: event.actorName, inline: true }
      : null,
    event.resourceName
      ? { name: "Resource", value: event.resourceName, inline: true }
      : null,
    event.ip ? { name: "IP", value: event.ip, inline: true } : null,
  ].filter(Boolean);
  const body = JSON.stringify({
    embeds: [
      {
        title: "Prism audit event",
        description: eventSummary(event),
        color: 0x5865f2,
        fields,
        timestamp: new Date(event.created_at * 1000).toISOString(),
      },
    ],
  });
  await loggedFetch(env, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function deliverTelegram(
  env: Env,
  config: Record<string, unknown>,
  event: DeliveredEvent,
): Promise<void> {
  const token = String(config.bot_token ?? "");
  const chatId = String(config.chat_id ?? "");
  const threadId = config.thread_id ? String(config.thread_id) : "";
  if (!token || !chatId) return;
  const lines = [
    `<b>Prism audit event</b>`,
    `<b>Action:</b> ${escapeHtml(event.action)}`,
    event.actorName ? `<b>Actor:</b> ${escapeHtml(event.actorName)}` : "",
    event.resourceName
      ? `<b>Resource:</b> ${escapeHtml(event.resourceName)}`
      : "",
    event.ip ? `<b>IP:</b> ${escapeHtml(event.ip)}` : "",
  ].filter(Boolean);
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
  };
  if (threadId) payload.message_thread_id = Number(threadId);
  await loggedFetch(env, `https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
}

async function deliverGeneral(
  env: Env,
  config: Record<string, unknown>,
  event: DeliveredEvent,
): Promise<void> {
  const values = auditPlaceholders(event);
  const url = interpolate(String(config.url ?? ""), values);
  if (validateOutboundUrl(url) !== null) return;
  const method = String(config.method ?? "POST").toUpperCase();
  const headers: Record<string, string> = {};
  const rawHeaders = (config.headers ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = interpolate(String(v), values);
  }
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  };
  if (method !== "GET" && method !== "HEAD" && config.body != null) {
    init.body = interpolate(String(config.body), values);
  }
  await loggedFetch(env, url, init);
}
