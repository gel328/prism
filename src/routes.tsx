// Route tree, decoupled from BrowserRouter so the same definition can be fed
// to createBrowserRouter (client) or createStaticHandler (server).

import type { RouteObject } from "react-router-dom";
import { Layout } from "./components/Layout";
import { NotFound } from "./pages/NotFound";
import {
  AuthCallback,
  InitGuard,
  RequireAdmin,
  RequireAuth,
} from "./components/Guards";

import { Init } from "./pages/Init";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Profile } from "./pages/Profile";
import { Security } from "./pages/Security";
import { AppList } from "./pages/apps/AppList";
import { AppDetail } from "./pages/apps/AppDetail";
import { Domains } from "./pages/Domains";
import { Connections } from "./pages/Connections";
import { ConnectedApps } from "./pages/ConnectedApps";
import { Authorize } from "./pages/oauth/Authorize";
import { Verify2FA } from "./pages/oauth/Verify2FA";
import { SocialConfirm } from "./pages/SocialConfirm";
import { SocialSelect } from "./pages/SocialSelect";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminApps } from "./pages/admin/AdminApps";
import { AdminTeams } from "./pages/admin/AdminTeams";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { AdminAudit } from "./pages/admin/AdminAudit";
import { AdminInvites } from "./pages/admin/AdminInvites";
import { AdminConnections } from "./pages/admin/AdminConnections";
import { AdminWebhooks } from "./pages/admin/AdminWebhooks";
import { AdminLoginErrors } from "./pages/admin/AdminLoginErrors";
import { AdminLogs } from "./pages/admin/AdminLogs";
import { AdminImageProxy } from "./pages/admin/AdminImageProxy";
import { TeamList } from "./pages/teams/TeamList";
import { TeamDetail } from "./pages/teams/TeamDetail";
import { TeamJoin } from "./pages/teams/TeamJoin";
import { Tokens } from "./pages/Tokens";
import { UserWebhooks } from "./pages/UserWebhooks";
import { Notifications } from "./pages/Notifications";
import { VerifyEmail } from "./pages/VerifyEmail";
import { VerifyChoose } from "./pages/VerifyChoose";
import { TgAuthCallback } from "./pages/TgAuthCallback";
import { PublicProfile } from "./pages/PublicProfile";
import { PublicTeam } from "./pages/PublicTeam";

export const routes: RouteObject[] = [
  // Public
  { path: "/init", element: <Init /> },
  {
    path: "/login",
    element: (
      <InitGuard>
        <Login />
      </InitGuard>
    ),
  },
  {
    path: "/register",
    element: (
      <InitGuard>
        <Register />
      </InitGuard>
    ),
  },
  { path: "/auth/callback", element: <AuthCallback /> },
  { path: "/auth/tg-callback", element: <TgAuthCallback /> },
  { path: "/social-confirm", element: <SocialConfirm /> },
  { path: "/social-select", element: <SocialSelect /> },

  // Email verification result
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "/verify-choose", element: <VerifyChoose /> },

  // Team invite
  { path: "/teams/join/:token", element: <TeamJoin /> },

  // OAuth consent
  { path: "/oauth/authorize", element: <Authorize /> },
  { path: "/oauth/2fa", element: <Verify2FA /> },

  // Public user/team profiles — accessible without login
  { path: "/u/:username", element: <PublicProfile /> },
  { path: "/t/:id", element: <PublicTeam /> },

  // Protected app shell
  {
    element: (
      <RequireAuth>
        <InitGuard>
          <Layout />
        </InitGuard>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: "profile", element: <Profile /> },
      { path: "security", element: <Security /> },
      { path: "apps", element: <AppList /> },
      { path: "apps/:id", element: <AppDetail /> },
      { path: "teams", element: <TeamList /> },
      { path: "teams/:id", element: <TeamDetail /> },
      { path: "domains", element: <Domains /> },
      { path: "connections", element: <Connections /> },
      { path: "connected-apps", element: <ConnectedApps /> },
      { path: "tokens", element: <Tokens /> },
      { path: "webhooks", element: <UserWebhooks /> },
      { path: "notifications", element: <Notifications /> },
      {
        path: "admin",
        element: (
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: "users", element: <AdminUsers /> },
          { path: "apps", element: <AdminApps /> },
          { path: "teams", element: <AdminTeams /> },
          { path: "settings", element: <AdminSettings /> },
          { path: "invites", element: <AdminInvites /> },
          { path: "connections", element: <AdminConnections /> },
          { path: "audit", element: <AdminAudit /> },
          { path: "webhooks", element: <AdminWebhooks /> },
          { path: "login-errors", element: <AdminLoginErrors /> },
          { path: "logs", element: <AdminLogs /> },
          { path: "image-proxy", element: <AdminImageProxy /> },
        ],
      },
    ],
  },

  // Catch-all — render the 404 page. The SSR handler inspects the matched
  // route id ("not-found") to set a 404 status on the HTTP response.
  { id: "not-found", path: "*", element: <NotFound /> },
];
