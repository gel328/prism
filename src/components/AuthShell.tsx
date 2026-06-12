// Shared centered-card shell for auth-flow pages (login, register, init,
// OAuth consent, step-up 2FA). One place owns the page backdrop, card
// elevation, entrance motion, and responsive padding so the five flows
// stay visually identical.
//
// Card padding is exposed as --auth-card-pad so full-bleed children
// (e.g. the consent screen's edge-to-edge dividers) can stretch with
// `margin: 0 calc(-1 * var(--auth-card-pad))` and survive the responsive
// padding change.

import { Image, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const useStyles = makeStyles({
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    padding: "32px 16px",
    boxSizing: "border-box",
    // Microsoft-sign-in-style canvas: a calm neutral base with two very
    // soft brand-tinted blooms drifting in from opposite corners.
    // color-mix keeps them tied to the configurable accent color and they
    // read correctly in both color schemes.
    backgroundImage: [
      `radial-gradient(38rem 38rem at 14% 16%, color-mix(in srgb, ${tokens.colorBrandBackground} 8%, transparent), transparent 62%)`,
      `radial-gradient(46rem 46rem at 86% 86%, color-mix(in srgb, ${tokens.colorBrandBackground} 6%, transparent), transparent 62%)`,
    ].join(", "),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    "--auth-card-pad": "40px",
    width: "100%",
    padding: "var(--auth-card-pad)",
    borderRadius: "12px",
    // Hairline only — the shadow does the lifting, like the MS sign-in
    // card; stroke3 keeps a whisper of definition in dark mode.
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    background: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    animationName: {
      from: { opacity: 0, transform: "translateY(10px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    animationDuration: "0.35s",
    animationTimingFunction: "cubic-bezier(0.33, 1, 0.68, 1)",
    "@media (max-width: 480px)": {
      "--auth-card-pad": "28px",
    },
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
});

interface AuthShellProps {
  children: ReactNode;
  /** Card max width in px. Defaults to 400 (forms); consent screens use 440. */
  maxWidth?: number;
  /** Vertical gap between card children in px. Defaults to 20. */
  cardGap?: number;
  /** Hide the site icon above the card (e.g. while branding is unknown). */
  hideBrand?: boolean;
}

export function AuthShell({
  children,
  maxWidth = 400,
  cardGap = 20,
  hideBrand,
}: AuthShellProps) {
  const styles = useStyles();
  const { data: site } = useQuery({
    queryKey: ["site"],
    queryFn: api.site,
    staleTime: 60_000,
  });

  return (
    <div className={styles.page}>
      {!hideBrand && site?.site_icon_url && (
        <div className={styles.brand}>
          <Image
            src={site.site_icon_url}
            alt={site.site_name ?? "logo"}
            shape="rounded"
            fit="cover"
            width={40}
            height={40}
          />
        </div>
      )}
      <div className={styles.card} style={{ maxWidth, gap: cardGap }}>
        {children}
      </div>
    </div>
  );
}
