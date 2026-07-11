---
title: Notifications
description: Email and Telegram notifications fired on user-account events. Per-event preferences, named rulesets, and the rule engine.
---

# Notifications

Prism delivers notifications to users on the same events that drive [user
webhooks](webhooks.md) — app changes, domain lifecycle, security factor
changes, OAuth consent grants/revokes, team membership, and more — but to
end-user channels (email, Telegram) instead of arbitrary URLs. Every user picks
which events fire and where.

Two ways to configure exist side-by-side:

- **Preferences** — a flat per-event `brief|full` map. Simple, fast to set up.
- **Rulesets** — named, ordered match/action arrays with account filtering and
  `stop` semantics. More expressive when you want to mute a single event for
  one address while keeping the rest of the firehose, or split brief vs. full
  delivery between channels.

The rule engine evaluates rulesets first; the flat preferences map is preserved
for backwards compatibility and read in the absence of a ruleset.

## Events

| Event                                   | Triggered when                                   |
| --------------------------------------- | ------------------------------------------------ |
| `app.created` / `updated` / `deleted`   | Your OAuth app changed                           |
| `domain.added` / `verified` / `deleted` | Your domain changed                              |
| `connection.added` / `removed`          | Social connection added or removed               |
| `connection.login`                      | A login completed via a linked social connection |
| `profile.updated`                       | Display name, avatar, etc. changed               |
| `security.passkey_added` / `_removed`   | Passkey added/removed                            |
| `security.totp_enabled` / `_disabled`   | TOTP authenticator enrolled/removed              |
| `token.created` / `revoked`             | Personal access token created/revoked            |
| `team.member_added` / `_removed`        | You were added to or removed from a team         |
| `oauth.consent_granted` / `_revoked`    | OAuth consent granted to or revoked from an app  |

The set is mirrored in `worker/lib/notifications.ts → USER_NOTIFICATION_EVENTS`.
Webhooks subscribe to the same names — this catalogue is the single source of
truth for "things you can be notified about."

## Levels

Each delivery has a level:

- **`brief`** — minimum: event name + when it happened + the resource label
  (app name, domain, etc.).
- **`full`** — includes the same context + a permalink + IP, user agent, and
  related metadata (e.g. for `connection.login`, the source slug + provider
  username + new-device flag).

## Channels

| Channel  | Configured via                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email    | The user's verified primary email plus any verified secondary emails on `user_emails`. The HTML body is XSS-safe by construction (every interpolated string is HTML-escaped).       |
| Telegram | A linked Telegram social connection — its bot token (configured via `tg_notify_source_slug`) is reused to message the user. Requires admin to set up a Telegram OAuth source first. |

If `tg_notify_source_slug` is empty, Telegram delivery is disabled site-wide
even when users have Telegram channels in their rules. The site's email
provider must be configured for email delivery to function.

## Flat preferences

The legacy / simple form. Stored on `user_notification_prefs.events` (and the
Telegram-only mirror `tg_events`) as a `Record<string, "brief"|"full">`. Any
event not listed is "off."

`GET /api/user/me/notifications`:

```json
{
  "email_events": {
    "app.created": "full",
    "security.totp_enabled": "brief"
  },
  "tg_events": {
    "connection.login": "full"
  }
}
```

`PUT /api/user/me/notifications` accepts the same shape and replaces the
stored preferences atomically.

The legacy `string[]` shape (every event treated as `"full"`) is still
parsed by `parsePrefsEvents` for forward-compat with old data.

## Rulesets

A ruleset is an ordered array of rules. When an event fires the engine walks
top-to-bottom, applies actions for every match, and returns the deduped
delivery list to actually send to.

### Rule shape

```json
{
  "id": "rule_xyz",
  "name": "Mute domain noise on burner email",
  "enabled": true,
  "match": {
    "event": "domain.*",
    "accounts": ["email:burner-id"]
  },
  "action": {
    "type": "drop"
  },
  "stop": false
}
```

| Field                         | Meaning                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                          | Stable rule identifier (server-generated)                                                                              |
| `name`                        | Human-readable label (≤ 64 chars, optional)                                                                            |
| `enabled`                     | `false` skips the rule without affecting state                                                                         |
| `match.event`                 | Glob: `*` matches everything, `?` matches one character, otherwise literal. Anchored — `app` matches `app`, not `appx` |
| `match.accounts`              | Optional. Each entry is `email:<email_id>` or `tg:<connection_id>`. Limits the rule's _effect_ to those accounts only  |
| `action.type`                 | `send` (append channels) or `drop` (clear delivery so far)                                                             |
| `action.channels` (send only) | Array of `{ kind: "email", email_id, level }` or `{ kind: "tg", connection_id, level }`                                |
| `stop`                        | `true` halts evaluation after this rule fires                                                                          |

### Evaluation rules

- Multiple `send` rules accumulate. Encountering the same channel at a higher
  level upgrades it (`full > brief`).
- `drop` clears the delivery set built up so far. Combined with a more
  permissive rule above, this lets you say "everything to my main email,
  except domain events to the burner."
- `match.accounts` filters the _effect_ of the rule, not its match condition.
  A `send` rule with scoped accounts silently skips channels that don't belong
  to those accounts. A `drop` rule with scoped accounts only clears the listed
  accounts — others pass through as if the rule hadn't fired.
- `stop: true` halts evaluation. Useful as a tail-anchor to keep more general
  rules below from undoing the current one.

### Worked example

```json
[
  {
    "id": "1",
    "name": "All events to primary email",
    "match": { "event": "*" },
    "action": {
      "type": "send",
      "channels": [{ "kind": "email", "email_id": "primary", "level": "full" }]
    }
  },
  {
    "id": "2",
    "name": "App events also to Telegram, brief",
    "match": { "event": "app.*" },
    "action": {
      "type": "send",
      "channels": [
        { "kind": "tg", "connection_id": "tg_abc", "level": "brief" }
      ]
    }
  },
  {
    "id": "3",
    "name": "Mute domain noise everywhere",
    "match": { "event": "domain.*" },
    "action": { "type": "drop" }
  }
]
```

`security.totp_enabled` → primary email (full). `app.created` → primary email
(full) + Telegram (brief). `domain.verified` → nothing (rule 3 cleared what
rule 1 added).

### Endpoints

```
GET    /api/user/me/notification-rulesets
POST   /api/user/me/notification-rulesets
PUT    /api/user/me/notification-rulesets/:id
DELETE /api/user/me/notification-rulesets/:id
```

`POST` validates the rules array via `sanitizeRulesArray`:

- Max 200 rules.
- Unknown action types or malformed channels return `400`.
- Unknown event names also return `400`. (Any event in `USER_NOTIFICATION_EVENTS`
  is accepted, plus the `*` and `?` glob forms.)

## Telegram setup

Telegram delivery reuses the bot from a Telegram OAuth source.

1. Add a Telegram source as described in
   [Social Login Setup → Telegram](social-login.md#telegram). The source has a
   bot token in its `client_secret` and is enabled.
2. In **Admin → Settings → Notifications**, set
   `tg_notify_source_slug` to that source's slug.
3. Each user who wants Telegram delivery binds their Telegram account at
   **Profile → Linked Accounts** (using the same bot domain registered with
   BotFather). The connection's `provider_user_id` is the chat ID Prism sends
   to.
4. Add a Telegram channel to the user's rules / preferences.

Telegram messages are plain text with an inline link back to the relevant page
in Prism.

## Email rendering

Email bodies are HTML with a small inline header and a `<table>` of context
rows. Every dynamic value goes through `esc()` (escapes `& < > " '`) before
interpolation, and every link is filtered through `safeHref()` (only `http:` /
`https:` URLs survive). The plaintext alternative is generated automatically
from the same data.

## Privacy notes

- The full level deliberately includes IP and user agent on security-relevant
  events (`security.*`, `connection.login`, `token.*`) so users can spot
  unfamiliar logins. Choose `brief` if you don't want that information landing
  in your inbox.
- Telegram messages travel via Telegram's servers. Anything you wouldn't put
  in a Telegram chat shouldn't be in a `full`-level Telegram delivery — pick
  `brief` for those events instead.
