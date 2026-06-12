// Apps card grid for TeamDetail

import {
  Card,
  CardHeader,
  Image,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonAppCards } from "../../components/Skeletons";
import { GlobeRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { OAuthApp } from "../../lib/api";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
    marginTop: "16px",
  },
  appCard: {
    cursor: "pointer",
    transition: "box-shadow 0.15s",
    ":hover": { boxShadow: tokens.shadow8 },
  },
});

interface AppsGridProps {
  apps: OAuthApp[];
  loading: boolean;
}

export function AppsGrid({ apps, loading }: AppsGridProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (loading) return <SkeletonAppCards count={4} />;

  if (apps.length === 0) {
    return (
      <EmptyState icon={<GlobeRegular />} title={t("teams.noAppsInTeam")} />
    );
  }

  return (
    <div className={styles.grid}>
      {apps.map((app) => (
        <Card
          key={app.id}
          className={styles.appCard}
          onClick={() => navigate(`/apps/${app.id}`)}
        >
          <CardHeader
            image={
              app.icon_url ? (
                <Image
                  src={app.icon_url}
                  alt={app.name}
                  shape="rounded"
                  fit="cover"
                  width={32}
                  height={32}
                />
              ) : (
                <GlobeRegular fontSize={32} />
              )
            }
            header={<Text weight="semibold">{app.name}</Text>}
            description={app.description || app.client_id}
          />
        </Card>
      ))}
    </div>
  );
}
