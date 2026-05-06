// Route guards used in src/routes.tsx. Pulled out into their own module so
// the routes file only exports the routes array (keeps Vite Fast Refresh
// from complaining about mixed-export files).

import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  const location = useLocation();
  if (!token) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function InitGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  useEffect(() => {
    api.initStatus().then(({ initialized }) => {
      if (!initialized) navigate("/init", { replace: true });
    });
  }, [navigate]);
  return <>{children}</>;
}

// Social auth callback handler: /auth/callback?token=...
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      navigate("/login?error=no_token");
      return;
    }

    // Set token in localStorage first so api.me() can authenticate with it
    localStorage.setItem("token", token);
    api
      .me()
      .then(({ user }) => {
        setAuth(token, user);
        navigate("/");
      })
      .catch(() => {
        localStorage.removeItem("token");
        navigate("/login?error=invalid_token");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount with the current params
  }, []);

  return null;
}
