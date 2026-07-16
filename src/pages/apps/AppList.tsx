// OAuth App list page

import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Image,
  Input,
  MessageBar,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { AddRegular, GlobeRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError, type RedirectUri } from "../../lib/api";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { RedirectUriEditor } from "../../components/RedirectUriEditor";
import { SkeletonAppCards } from "../../components/Skeletons";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  appCard: {
    cursor: "pointer",
    transition: "box-shadow 0.15s",
    ":hover": { boxShadow: tokens.shadow8 },
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
});

export function AppList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: api.listApps,
  });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    icon_url: string;
    website_url: string;
    redirect_uris: RedirectUri[];
  }>({
    name: "",
    description: "",
    icon_url: "",
    website_url: "",
    redirect_uris: [],
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const update =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!form.name) return;
    const uris = form.redirect_uris.filter((u) => u.value.trim());

    setCreating(true);
    try {
      const res = await api.createApp({
        name: form.name,
        description: form.description,
        website_url: form.website_url || undefined,
        redirect_uris: uris,
      });
      await qc.invalidateQueries({ queryKey: ["apps"] });
      navigate(`/apps/${res.app.id}`);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof ApiError ? err.message : t("apps.failedCreateApp"),
      });
    } finally {
      setCreating(false);
    }
  };

  const createDialog = (
    <Dialog>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<AddRegular />}>
          {t("apps.newApp")}
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("apps.createOAuthApp")}</DialogTitle>
          <DialogContent>
            {message && (
              <MessageBar
                intent={message.type === "success" ? "success" : "error"}
                style={{ marginBottom: 12 }}
              >
                {message.text}
              </MessageBar>
            )}
            <div className={styles.form}>
              <Field label={t("apps.appName")} required>
                <Input
                  value={form.name}
                  onChange={update("name")}
                  placeholder={t("apps.appNamePlaceholder")}
                />
              </Field>
              <Field label={t("apps.description")}>
                <Input
                  value={form.description}
                  onChange={update("description")}
                />
              </Field>
              <Field label={t("apps.appIconUrl")}>
                <Input
                  value={form.icon_url}
                  onChange={update("icon_url")}
                  placeholder={t("apps.appIconPlaceholder")}
                />
              </Field>
              <Field label={t("apps.websiteUrl")}>
                <Input
                  value={form.website_url}
                  onChange={update("website_url")}
                  placeholder={t("apps.websiteUrlPlaceholder")}
                />
              </Field>
              <RedirectUriEditor
                label={t("apps.redirectUris")}
                value={form.redirect_uris}
                onChange={(v) => setForm((f) => ({ ...f, redirect_uris: v }))}
              />
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger>
              <Button>{t("common.cancel")}</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? <Spinner size="tiny" /> : t("common.create")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );

  return (
    <div>
      <PageHeader title={t("apps.myApplications")} actions={createDialog} />

      {isLoading && <SkeletonAppCards count={6} />}

      {!isLoading && data?.apps.length === 0 && (
        <EmptyState
          icon={<GlobeRegular />}
          title={t("apps.noAppsYet")}
          description={t("apps.noAppsDesc")}
        />
      )}

      <div className={styles.grid}>
        {data?.apps.map((app) => (
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
              header={
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Text weight="semibold">{app.name}</Text>
                  {app.is_verified && (
                    <Badge color="success" appearance="filled" size="small">
                      {t("apps.verified")}
                    </Badge>
                  )}
                  {!app.is_active && (
                    <Badge color="subtle" appearance="filled" size="small">
                      {t("apps.disabled")}
                    </Badge>
                  )}
                </div>
              }
              description={app.description || app.website_url || app.client_id}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
