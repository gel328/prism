// Scoped audit-webhook manager (Discord / Telegram / General presets).
//
// Reached from the "Edit webhooks" button on every audit-log panel. The
// `base` prop selects the scope ("me", `team/<id>`, or "platform").

import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowLeftRegular,
  DeleteRegular,
  EditRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  api,
  ApiError,
  type AuditWebhook,
  type AuditWebhookInput,
  type AuditWebhookKind,
} from "../lib/api";
import { useToastMessage } from "../lib/useToastMessage";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", alignItems: "center", gap: "12px" },
  list: { display: "flex", flexDirection: "column", gap: "12px" },
  card: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
});

const KINDS: AuditWebhookKind[] = ["discord", "telegram", "general"];

interface FormState {
  id?: string;
  name: string;
  kind: AuditWebhookKind;
  events: string;
  is_active: boolean;
  // discord
  webhook_url: string;
  // telegram
  bot_token: string;
  chat_id: string;
  thread_id: string;
  // general
  url: string;
  method: "GET" | "POST";
  headers: string;
  body: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    kind: "discord",
    events: "*",
    is_active: true,
    webhook_url: "",
    bot_token: "",
    chat_id: "",
    thread_id: "",
    url: "",
    method: "POST",
    headers: "",
    body: "{summary}",
  };
}

function formFromWebhook(wh: AuditWebhook): FormState {
  const cfg = wh.config as Record<string, unknown>;
  return {
    id: wh.id,
    name: wh.name,
    kind: wh.kind,
    events: wh.events.join(", "),
    is_active: wh.is_active,
    webhook_url: String(cfg.webhook_url ?? ""),
    bot_token: String(cfg.bot_token ?? ""),
    chat_id: String(cfg.chat_id ?? ""),
    thread_id: String(cfg.thread_id ?? ""),
    url: String(cfg.url ?? ""),
    method: (cfg.method as "GET" | "POST") ?? "POST",
    headers: cfg.headers ? JSON.stringify(cfg.headers, null, 2) : "",
    body: String(cfg.body ?? ""),
  };
}

export function AuditWebhooks({
  base,
  onBack,
}: {
  base: string;
  onBack: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { message, showMsg } = useToastMessage();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-webhooks", base],
    queryFn: () => api.auditWebhooks(base),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const kindLabel = (k: AuditWebhookKind) => t(`audit.webhookKind.${k}`);

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };
  const openEdit = (wh: AuditWebhook) => {
    setForm(formFromWebhook(wh));
    setDialogOpen(true);
  };

  const buildInput = (): AuditWebhookInput => {
    const events = form.events
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let config: Record<string, unknown>;
    if (form.kind === "discord") {
      config = { webhook_url: form.webhook_url };
    } else if (form.kind === "telegram") {
      config = {
        bot_token: form.bot_token,
        chat_id: form.chat_id,
        thread_id: form.thread_id,
      };
    } else {
      let headers: Record<string, string> = {};
      if (form.headers.trim()) {
        try {
          headers = JSON.parse(form.headers) as Record<string, string>;
        } catch {
          throw new Error(t("audit.invalidHeaders"));
        }
      }
      config = {
        url: form.url,
        method: form.method,
        headers,
        body: form.body,
      };
    }
    return {
      name: form.name,
      kind: form.kind,
      events: events.length ? events : ["*"],
      is_active: form.is_active,
      config,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const input = buildInput();
      if (form.id) await api.updateAuditWebhook(base, form.id, input);
      else await api.createAuditWebhook(base, input);
      await qc.invalidateQueries({ queryKey: ["audit-webhooks", base] });
      setDialogOpen(false);
      showMsg("success", t("audit.webhookSaved"));
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError || err instanceof Error
          ? err.message
          : t("audit.webhookSaveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAuditWebhook(base, id);
      await qc.invalidateQueries({ queryKey: ["audit-webhooks", base] });
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("audit.webhookDeleteFailed"),
      );
    }
  };

  const webhooks = data?.webhooks ?? [];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={onBack}
        >
          {t("audit.backToLog")}
        </Button>
        <Text weight="semibold" style={{ flex: 1 }}>
          {t("audit.webhooksTitle")}
        </Text>
        <Button appearance="primary" icon={<AddRegular />} onClick={openCreate}>
          {t("audit.newWebhook")}
        </Button>
      </div>

      {message && (
        <MessageBar intent={message.type === "success" ? "success" : "error"}>
          {message.text}
        </MessageBar>
      )}

      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {t("audit.webhooksHint")}
      </Text>

      {isLoading ? (
        <Spinner size="tiny" />
      ) : webhooks.length === 0 ? (
        <Text style={{ color: tokens.colorNeutralForeground3 }}>
          {t("audit.noWebhooks")}
        </Text>
      ) : (
        <div className={styles.list}>
          {webhooks.map((wh) => (
            <div key={wh.id} className={styles.card}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Text weight="semibold">{wh.name}</Text>
                  <Badge appearance="outline">{kindLabel(wh.kind)}</Badge>
                  {!wh.is_active && (
                    <Badge appearance="tint" color="warning">
                      {t("audit.inactive")}
                    </Badge>
                  )}
                </div>
                <Text
                  size={200}
                  style={{ color: tokens.colorNeutralForeground3 }}
                >
                  {wh.events.join(", ")}
                </Text>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<EditRegular />}
                  onClick={() => openEdit(wh)}
                />
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  onClick={() => handleDelete(wh.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(_, d) => setDialogOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {form.id ? t("audit.editWebhook") : t("audit.newWebhook")}
            </DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field label={t("audit.webhookName")} required>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </Field>
                <Field label={t("audit.webhookPreset")}>
                  <Dropdown
                    disabled={!!form.id}
                    value={kindLabel(form.kind)}
                    selectedOptions={[form.kind]}
                    onOptionSelect={(_, d) =>
                      setForm((f) => ({
                        ...f,
                        kind: (d.optionValue as AuditWebhookKind) ?? "discord",
                      }))
                    }
                  >
                    {KINDS.map((k) => (
                      <Option key={k} value={k}>
                        {kindLabel(k)}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>

                {form.kind === "discord" && (
                  <Field label={t("audit.discordUrl")}>
                    <Input
                      value={form.webhook_url}
                      placeholder="https://discord.com/api/webhooks/…"
                      onChange={(e) =>
                        setForm((f) => ({ ...f, webhook_url: e.target.value }))
                      }
                    />
                  </Field>
                )}

                {form.kind === "telegram" && (
                  <>
                    <Field label={t("audit.tgBotToken")} required>
                      <Input
                        value={form.bot_token}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, bot_token: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t("audit.tgChatId")}>
                      <Input
                        value={form.chat_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, chat_id: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t("audit.tgThreadId")}>
                      <Input
                        value={form.thread_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, thread_id: e.target.value }))
                        }
                      />
                    </Field>
                  </>
                )}

                {form.kind === "general" && (
                  <>
                    <Field label={t("audit.generalUrl")} required>
                      <Input
                        value={form.url}
                        placeholder="https://example.com/hook?token={id}"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, url: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t("audit.generalMethod")}>
                      <Dropdown
                        value={form.method}
                        selectedOptions={[form.method]}
                        onOptionSelect={(_, d) =>
                          setForm((f) => ({
                            ...f,
                            method: (d.optionValue as "GET" | "POST") ?? "POST",
                          }))
                        }
                      >
                        <Option value="GET">GET</Option>
                        <Option value="POST">POST</Option>
                      </Dropdown>
                    </Field>
                    <Field
                      label={t("audit.generalHeaders")}
                      hint={t("audit.generalHeadersHint")}
                    >
                      <Textarea
                        value={form.headers}
                        rows={3}
                        placeholder={'{ "Authorization": "Bearer {id}" }'}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, headers: e.target.value }))
                        }
                      />
                    </Field>
                    {form.method === "POST" && (
                      <Field label={t("audit.generalBody")}>
                        <Textarea
                          value={form.body}
                          rows={3}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, body: e.target.value }))
                          }
                        />
                      </Field>
                    )}
                    <MessageBar intent="info">
                      {t("audit.placeholderTip")}
                    </MessageBar>
                  </>
                )}

                <Field
                  label={t("audit.webhookEvents")}
                  hint={t("audit.webhookEventsHint")}
                >
                  <Input
                    value={form.events}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, events: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
              >
                {saving ? <Spinner size="tiny" /> : t("common.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
