---
title: 团队
description: 协作管理 OAuth 应用与已验证域名 — 角色、邀请、加入门槛与 team-as-user 存储模型。
---

# 团队

团队是 OAuth 应用与已验证域名的共同所有者。成员可以在与个人资源相同的界面里管理团队的应用和域名，但单个成员的离开不会影响这些资源的归属。

## 角色

| 角色       | 管理成员       | 改团队设置 | 管理应用/域名 | 转移所有权     | 解散 |
|------------|----------------|------------|---------------|----------------|------|
| `owner`    | 是             | 是         | 是            | 是（转给 co-owner） | 是   |
| `co-owner` | 是（除 owner） | 是         | 是            | 否             | 否   |
| `admin`    | 是（仅 member）| 否         | 是            | 否             | 否   |
| `member`   | 否             | 否         | 团队允许的写  | 否             | 否   |

每个团队恰好有一名 owner。转移所有权是一次性的、可审计的操作；原 owner 自动降级为 co-owner。

## 加入团队

三种方式：

1. **直接添加** — 由 admin/co-owner/owner 在 **Teams → \<team\> → Members → Add member** 中添加。
2. **邀请链接** — 在 **Members → Generate invite** 生成。可选邮箱锁定、最大使用次数、过期时间。访问 `/teams/join/:token` 会显示团队资料以及任何未满足的[加入门槛](#加入门槛)。
3. **API** — 携带会话 bearer 调用 `POST /api/teams/join/:token`。

## 加入门槛

团队所有者可要求成员加入前满足某些安全因素（成员之后试图降级时也会再次校验）。管理员还能设置 **站点底线** — 任何团队都必须满足的最低要求。

| 门槛                       | 团队字段                       | 站点底线键                              |
|----------------------------|--------------------------------|-----------------------------------------|
| 至少有一个 TOTP 认证器或 Passkey | `teams.require_2fa`         | `default_team_require_2fa`             |
| 主邮箱已验证                 | `teams.require_verified_email` | `default_team_require_verified_email`  |

有效要求 = 团队标记 **或** 站点底线。所有者可在底线之上加严，但不能在底线之下放松。被站点强制的因素在团队设置 UI 中会被锁灰。

::: warning 回溯生效
启用门槛会立即对每个现有成员生效。任何未满足该因素的成员将在团队操作中被拦下，直到自行补齐。`unmetRequirements` 工具函数会在加入确认页和用户侧改动路径（例如移除最后一个 TOTP 认证器）上把错误清晰地呈现给用户。请先通知成员后再切换。
:::

`/teams/join/:token` 的负载会先列出门槛，并提供链接跳到 **资料 → 安全** / **资料 → 邮箱** 以便补齐：

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

## 团队拥有的应用与域名

OAuth 应用可以直接在团队下创建（**Teams → \<team\> → Apps → New**），或从成员个人应用转入（**Apps → \<app\> → Settings → Transfer**）。被转入的个人应用就地改主 — `client_id` 与 `client_secret` 保持不变，外部集成不会断。

域名同理。已在个人账户验证过的域名可以共享给团队（`POST /api/teams/:id/domains/:domainId/share-to-team`），之后还能取消共享（`/share-to-personal`）或彻底转出（`/to-personal`，撤销团队的编辑权）。

## team-as-user 存储

每个团队都有一行合成的 `users` 行：`kind = 'team'`、`id` 与 `teams.id` 一致。它仅是为了让 `oauth_apps.owner_id` 在个人/团队应用上能用同一张表 join — 没有密码、没有会话、没有社交连接、不能登录。合成的邮箱与用户名（`team-<id>@teams.invalid` / `team:<id>`）使用冒号前缀，绝不会与真实注册冲突。

团队解散时，`dissolveTeam` 会先把团队拥有的应用重新分配给团队所有者（如果没有 owner 行就给执行删除的管理员），从而绕过 `oauth_apps.owner_id` 的级联删除。

## 团队公开资料

与用户一样，团队默认私密。团队所有者（或管理员）必须显式在 **Teams → \<team\> → Settings → Public profile** 启用，并选择展示的内容。站点级默认值与 `enable_public_profiles` 主开关在 [配置](configuration.md#公开资料) 中。各分区的细则见 [公开资料](public-profile.md)。

团队公开页只会在所有者本人也开了公开资料时才链接到 `/u/<username>` — 否则只展示昵称，不带链接。

## OAuth scope

涉及团队的 scope 分三类，作用范围差异巨大。完整表格（含同意规则与示例）在 [OAuth → 团队相关 scope —— 三个层级](oauth.md#团队相关-scope-三个层级)；这里给个速览：

### 聚合 `teams:*`

一次同意作用于用户的**全部团队**。端点位于 `/api/oauth/me/teams[/...]`。

| Scope          | 权限                                                  |
|----------------|-------------------------------------------------------|
| `teams:read`   | 列出当前用户加入的团队与角色                          |
| `teams:create` | 创建新团队                                            |
| `teams:write`  | 修改团队设置；添加/移除用户所在团队的成员             |
| `teams:delete` | 删除团队（请求时仍校验当前用户必须是 owner）          |

适合「这个用户在哪些团队」型用途 — workspace 切换器、同步成员列表、给 Cloudflare Access 策略用的 OIDC claim 等。

### 单团队 `team:*`

只作用于用户在同意时选定的**那一个团队**。Prism 在颁发前用 `bindTeamScopes()` 把 `team:read` 改写为 `team:<team-id>:read`，token 中只剩绑定后的形式。端点位于 `/api/oauth/me/team/:teamId/...`。

| 请求字符串                  | 绑定后形式                              | 权限                                                |
|-----------------------------|-----------------------------------------|-----------------------------------------------------|
| `team:read`                 | `team:<id>:read`                        | 读取该团队的设置                                    |
| `team:write`                | `team:<id>:write`                       | 修改该团队的设置                                    |
| `team:delete`               | `team:<id>:delete`                      | 解散该团队                                          |
| `team:member:read`          | `team:<id>:member:read`                 | 列出成员与角色                                      |
| `team:member:write`         | `team:<id>:member:write`                | 添加/移除成员、改角色                               |
| `team:member:profile:read`  | `team:<id>:member:profile:read`         | 通过团队 scope 读取某成员的资料                     |

同意时还有两条额外限制（`worker/routes/oauth.ts:830-859`）：

- 用户必须是所选团队的 `owner`、`co-owner` 或 `admin`。
- `team:delete` 还要求 `owner` 或 `co-owner` — admin 能授予读写，但只有真能解散团队的人才能授予删除权。

`team:member:write` 也不能越权：admin 授权后，应用提升成员的角色仍受到与该 admin 相同的上限保护，不会因 token 而获得超越授权人的能力 — 这条上限在每次成员变更时都会校验。

每次授予会在 `team_scope_grants` 表中独立审计（含团队 ID 与权限列表），与 OAuth 同意记录分开。

适合绑定到单个团队的集成 — 某 workspace 的部署机器人、某团队频道里的 chatbot 等。

### 跨实例 `site:team:*`

无需逐团队同意的跨团队管理员权限。授予时同意者必须是站点管理员，并通过 [站点 scope 确认流程](oauth.md#site-scopes-admin-only)（2FA + 输入 `grant site access`）。仅适合站点管理工具。

### `oidc_fields` claim

把用户角色嵌入 ID Token 用的 `oidc_fields` 机制同样能产出按团队的 claim — 这对依赖团队成员关系的 Cloudflare Access 策略非常有用。`teams:read` scope 会解锁扁平的 `teams` claim 以及 `in_team_<id>` / `role_in_team_<id>` 标记。详见 [Cloudflare Access 集成](oauth.md#cloudflare-access)。

### 怎么选

- 集成关心用户的整个团队图谱（同步成员、注入 claim）— 用 **`teams:*`**。
- 集成只针对一个团队 — 用 **`team:*`**，更窄的爆炸半径值得多一个团队选择器。
- **不要** 同时请求 `teams:*` 和 `team:*`：你会拿到并集，但同意页同时出现「全部团队提示」和「团队选择器」，对用户很迷惑。
- **`site:team:*`** 留给站点管理工具用 — 这层授予会绕过团队所有者的同意。

## 端点速览

完整列表见 [API → 团队](api.md#团队)。常用端点：

```
GET    /api/teams                            列出加入的团队
POST   /api/teams                            创建
PATCH  /api/teams/:id                        更新设置与门槛
GET    /api/teams/:id/members                列成员
POST   /api/teams/:id/members                按用户名/ID 添加
PATCH  /api/teams/:id/members/:userId        改角色
DELETE /api/teams/:id/members/:userId        移除（self 即退出）
POST   /api/teams/:id/transfer-ownership     转交给 co-owner
GET    /api/teams/join/:token                预览邀请（认证可选）
POST   /api/teams/join/:token                接受邀请
```
