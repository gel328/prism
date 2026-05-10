---
title: Teams
description: Collaborate on OAuth apps and verified domains. Roles, invites, requirement gates, and team-as-user storage.
---

# Teams

A team is a shared owner for OAuth applications and verified domains. Members
can manage the team's apps and domains in the same UI as their personal
resources, while ownership of those resources cleanly survives any single
member leaving the team.

## Roles

| Role       | Can manage members | Can edit team settings | Can manage apps/domains | Can transfer ownership | Can disband |
|------------|--------------------|------------------------|-------------------------|------------------------|-------------|
| `owner`    | yes                | yes                    | yes                     | yes (to a co-owner)    | yes         |
| `co-owner` | yes (except owner) | yes                    | yes                     | no                     | no          |
| `admin`    | yes (member only)  | no                     | yes                     | no                     | no          |
| `member`   | no                 | no                     | yes (read; write apps the team allows) | no    | no          |

There is exactly one owner per team. Transferring ownership is a single,
audited operation; the previous owner is demoted to co-owner.

## Joining a team

There are three ways to join:

1. **Direct add** by an admin/co-owner/owner from **Teams → \<team\> → Members → Add member**.
2. **Invite link** generated from **Members → Generate invite**. Optional email
   lock, max-uses cap, and expiry. Visiting `/teams/join/:token` shows the team
   profile and any unmet [requirements](#join-requirements) before accepting.
3. **API** — `POST /api/teams/join/:token` with a session bearer.

## Join requirements

Team owners can require members to satisfy security factors before joining (and
again whenever a member tries to drop below the bar). Admins can also enforce a
**site floor** — a minimum every team is forced to require, regardless of the
team-level flag.

| Requirement              | Team flag                  | Site floor key                          |
|--------------------------|----------------------------|-----------------------------------------|
| At least one TOTP authenticator or passkey | `teams.require_2fa`        | `default_team_require_2fa`             |
| Verified primary email   | `teams.require_verified_email` | `default_team_require_verified_email`  |

Effective requirement = team flag **OR** site floor. Owners can opt their team
in further than the floor but cannot opt out below it. The team-settings UI
greys out the toggle for any factor forced by the site.

::: warning Retroactive enforcement
Turning a requirement on flips it for every existing member immediately. Any
member who hasn't enrolled the factor is locked out of team operations until
they do. The `unmetRequirements` helper surfaces this on the join confirmation
screen and on the user-side mutation paths (e.g. removing the last TOTP
authenticator) so members get a clear error before data is changed. Notify
members before flipping a requirement on a populated team.
:::

The user-facing join flow at `/teams/join/:token` shows the requirements first
and links to **Profile → Security** / **Profile → Email** to satisfy them. The
endpoint payload includes:

```json
{
  "team": { "id": "...", "name": "Acme", "avatar_url": "..." },
  "requirements": {
    "require_2fa": true,
    "require_verified_email": true,
    "forced_by_site": { "require_2fa": false, "require_verified_email": true }
  },
  "unmet": ["2fa"]
}
```

## Team-owned apps and domains

OAuth apps can be created directly under a team (**Teams → \<team\> → Apps → New**)
or transferred in from a member's personal apps (**Apps → \<app\> → Settings →
Transfer**). Personal apps that are transferred in are reassigned in-place —
the `client_id` and `client_secret` remain valid, so partner integrations don't
break.

Domains work the same way. A domain verified on a personal account can be
shared with a team (`POST /api/teams/:id/domains/:domainId/share-to-team`) and
later moved back (`/share-to-personal`), or fully transferred (`/to-personal`)
to remove the team's edit access.

## Team-as-user storage

Every team has a synthetic `users` row with `kind = 'team'` and `id` matching
`teams.id`. This row exists only so `oauth_apps.owner_id` joins to a single
table for both personal and team apps — it has no password, no sessions, no
social connections, and cannot log in. The synthetic email and username
(`team-<id>@teams.invalid` / `team:<id>`) are colon-prefixed to guarantee they
can never collide with a real registration.

When a team is disbanded, `dissolveTeam` first reassigns any remaining
team-owned apps to the team's owner (or, if there's no owner row, to the
deleting admin). This survives the cascading delete on `oauth_apps.owner_id`.

## Public team profiles

Like users, teams are private by default. The team owner (or admin) explicitly
opts the team in at **Teams → \<team\> → Settings → Public profile**, then picks
which sections to expose. Site-wide defaults and the master `enable_public_profiles`
kill switch live in [Configuration](configuration.md#public-profiles). See
[Public Profiles](public-profile.md) for the full per-section breakdown.

A team's public page links to the owner's `/u/<username>` page only when *both*
profiles are public. If the owner's profile is private, the team page shows the
display name without a link.

## OAuth scopes

Three scope families touch teams, with very different blast radius. The full
table with consent rules and worked examples is in
[OAuth → Team scopes — three tiers](oauth.md#team-scopes-three-tiers); the
short version:

### Aggregate `teams:*`

Acts on **every team the user is a member of** at once. One consent covers all
of them. Endpoints under `/api/oauth/me/teams[/...]`.

| Scope          | Grants                                       |
|----------------|----------------------------------------------|
| `teams:read`   | List team memberships and roles              |
| `teams:create` | Create a new team                            |
| `teams:write`  | Update team settings; add and remove members across the user's teams |
| `teams:delete` | Delete a team (owner only — checked at request time) |

Right shape for: "what teams is this user in?" use cases — workspace pickers,
syncing membership lists, OIDC IdP claims for Cloudflare Access policies.

### Single-team `team:*`

Acts on **exactly one team**, picked by the user at consent time. Prism
rewrites `team:read` → `team:<team-id>:read` (via `bindTeamScopes()`) before
issuing the token, so the token can only ever touch that team. Endpoints
under `/api/oauth/me/team/:teamId/...`.

| Requested      | Bound form                | Grants                                                |
|----------------|---------------------------|-------------------------------------------------------|
| `team:read`    | `team:<id>:read`          | Read the team's settings                              |
| `team:write`   | `team:<id>:write`         | Update the team's settings                            |
| `team:delete`  | `team:<id>:delete`        | Disband the team                                      |
| `team:member:read`   | `team:<id>:member:read` | List members and their roles                       |
| `team:member:write`  | `team:<id>:member:write`| Add/remove members and change roles                |
| `team:member:profile:read` | `team:<id>:member:profile:read` | Read a member's profile through the team scope |

Two extra rules at consent time (see `worker/routes/oauth.ts:830-859`):

- The user must be `owner`, `co-owner`, or `admin` of the chosen team.
- `team:delete` additionally requires `owner` or `co-owner` — admins can grant
  reads/writes but only the people who could actually disband the team can
  grant deletion.

`team:member:write` also can't escalate beyond what the granting user could do
themselves: an admin granting it cannot give the app the ability to promote
past `admin` — the cap is enforced on every member mutation.

Each grant is audited in `team_scope_grants` (team id + permissions),
independent of the OAuth consent record.

Right shape for: an integration scoped to a single team — a deploy bot for one
workspace, a chatbot for one team's channel, etc.

### Cross-instance `site:team:*`

Cross-team admin access without a per-team consent. Granting requires the
user to be a site admin and goes through the
[site-scope confirmation flow](oauth.md#site-scopes-admin-only) (2FA + the
exact phrase `grant site access`). Use only for site-administration tools.

### `oidc_fields` claim

The same `oidc_fields` mechanism that surfaces user role in ID tokens also
emits per-team claims when an app declares them — useful for Cloudflare Access
policies that depend on team membership. The `teams:read` scope unlocks the
flat `teams` claim plus the `in_team_<id>` / `role_in_team_<id>` per-team
markers. See the
[Cloudflare Access integration](oauth.md#cloudflare-access) for details.

### Picking a tier

- Use **`teams:*`** when the integration cares about the user's whole team
  graph (membership sync, claim mapping).
- Use **`team:*`** when the integration scopes to one workspace at a time —
  the smaller blast radius is worth the team-id picker on the consent screen.
- Don't request `teams:*` and `team:*` together: you'll get the union, but the
  consent UX shows both an all-teams notice and a team-id picker on the same
  screen, which confuses users.
- Reserve **`site:team:*`** for site-administration tooling — anything granted
  there bypasses individual team owners' consent.

## Endpoint summary

See [API → Teams](api.md#teams) for the full table. The most-used endpoints:

```
GET    /api/teams                            list memberships
POST   /api/teams                            create
PATCH  /api/teams/:id                        update settings + requirements
GET    /api/teams/:id/members                list members
POST   /api/teams/:id/members                add by username/id
PATCH  /api/teams/:id/members/:userId        change role
DELETE /api/teams/:id/members/:userId        remove (or leave with self)
POST   /api/teams/:id/transfer-ownership     transfer to a co-owner
GET    /api/teams/join/:token                preview an invite (auth optional)
POST   /api/teams/join/:token                accept
```
