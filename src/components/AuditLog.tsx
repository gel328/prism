// Reusable audit-log panel (Transparent Control).
//
// One component powers all three scopes; the `base` prop selects the API
// scope ("me", `team/<id>`, or "platform"). Provides a time-range + action
// filter, click-to-filter on any row cell, an inspect popup with the full
// event, and an "Edit webhooks" button that swaps to the webhook manager.

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogActions,
  Dropdown,
  Input,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  DismissRegular,
  FilterRegular,
  SearchRegular,
  PlugConnectedRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type AuditEvent } from "../lib/api";
import { maskIp, parseClient } from "../lib/auditFormat";
import { SkeletonTableRows } from "./Skeletons";
import { AuditWebhooks } from "./AuditWebhooks";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  filters: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  tableScroll: { overflowX: "auto" },
  clickable: { cursor: "pointer" },
  mono: { fontFamily: "monospace", fontSize: tokens.fontSizeBase200 },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
});

// datetime-local string <-> unix seconds
function toUnix(local: string): number | undefined {
  if (!local) return undefined;
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

interface Filters {
  from: string;
  to: string;
  action?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
}

export function AuditLog({ base }: { base: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({ from: "", to: "" });
  const [inspect, setInspect] = useState<AuditEvent | null>(null);
  const [showWebhooks, setShowWebhooks] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-events", base, page, filters],
    queryFn: () =>
      api.auditEvents(base, {
        from: toUnix(filters.from),
        to: toUnix(filters.to),
        action: filters.action,
        actor_id: filters.actorId,
        resource_type: filters.resourceType,
        resource_id: filters.resourceId,
        page,
      }),
  });

  const events = data?.events ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  const hasFilters =
    !!filters.from ||
    !!filters.to ||
    !!filters.action ||
    !!filters.actorId ||
    !!filters.resourceType ||
    !!filters.resourceId;

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({ from: "", to: "" });
    setPage(1);
  };

  if (showWebhooks) {
    return <AuditWebhooks base={base} onBack={() => setShowWebhooks(false)} />;
  }

  return (
    <div className={styles.root}>
      <div className={styles.filters}>
        <div className={styles.filterField}>
          <Text size={200}>{t("audit.from")}</Text>
          <Input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => setFilter({ from: e.target.value })}
          />
        </div>
        <div className={styles.filterField}>
          <Text size={200}>{t("audit.to")}</Text>
          <Input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => setFilter({ to: e.target.value })}
          />
        </div>
        <div className={styles.filterField}>
          <Text size={200}>{t("audit.action")}</Text>
          <Dropdown
            value={filters.action ?? t("audit.allActions")}
            selectedOptions={filters.action ? [filters.action] : []}
            onOptionSelect={(_, d) =>
              setFilter({ action: d.optionValue || undefined })
            }
          >
            <Option value="">{t("audit.allActions")}</Option>
            {(data?.actions ?? []).map((a) => (
              <Option key={a} value={a}>
                {a}
              </Option>
            ))}
          </Dropdown>
        </div>
        {hasFilters && (
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={clearFilters}
          >
            {t("audit.clearFilters")}
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <Button
          icon={<PlugConnectedRegular />}
          onClick={() => setShowWebhooks(true)}
        >
          {t("audit.editWebhooks")}
        </Button>
      </div>

      {(filters.actorId || filters.resourceId || filters.resourceType) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {filters.actorId && (
            <Badge
              appearance="tint"
              icon={<FilterRegular />}
              className={styles.clickable}
              onClick={() => setFilter({ actorId: undefined })}
            >
              {t("audit.actor")}: {filters.actorId.slice(0, 8)} ✕
            </Badge>
          )}
          {filters.resourceType && (
            <Badge
              appearance="tint"
              icon={<FilterRegular />}
              className={styles.clickable}
              onClick={() => setFilter({ resourceType: undefined })}
            >
              {filters.resourceType} ✕
            </Badge>
          )}
          {filters.resourceId && (
            <Badge
              appearance="tint"
              icon={<FilterRegular />}
              className={styles.clickable}
              onClick={() => setFilter({ resourceId: undefined })}
            >
              {t("audit.resource")}: {filters.resourceId.slice(0, 8)} ✕
            </Badge>
          )}
        </div>
      )}

      <div className={styles.tableScroll}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t("audit.colTime")}</TableHeaderCell>
              <TableHeaderCell>{t("audit.colActor")}</TableHeaderCell>
              <TableHeaderCell>{t("audit.colAction")}</TableHeaderCell>
              <TableHeaderCell>{t("audit.colResource")}</TableHeaderCell>
              <TableHeaderCell>{t("audit.colIp")}</TableHeaderCell>
              <TableHeaderCell>{t("audit.colClient")}</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTableRows rows={8} cols={7} />
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Text style={{ color: tokens.colorNeutralForeground3 }}>
                    {t("audit.noEvents")}
                  </Text>
                </TableCell>
              </TableRow>
            ) : (
              events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {new Date(ev.created_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {ev.actor_id ? (
                      <Tooltip content={ev.actor_id} relationship="label">
                        <Text
                          className={`${styles.mono} ${styles.clickable}`}
                          onClick={() =>
                            setFilter({ actorId: ev.actor_id ?? undefined })
                          }
                        >
                          {ev.actor_name ?? ev.actor_id.slice(0, 8)}
                        </Text>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Text
                      className={`${styles.mono} ${styles.clickable}`}
                      style={{ color: tokens.colorBrandForeground1 }}
                      onClick={() => setFilter({ action: ev.action })}
                    >
                      {ev.action}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {ev.resource_type || ev.resource_id ? (
                      <Tooltip
                        content={`${ev.resource_type ?? "?"} / ${
                          ev.resource_id ?? "?"
                        }`}
                        relationship="label"
                      >
                        <Text
                          className={styles.clickable}
                          style={{ fontSize: 12 }}
                          onClick={() =>
                            setFilter({
                              resourceType: ev.resource_type ?? undefined,
                              resourceId: ev.resource_id ?? undefined,
                            })
                          }
                        >
                          {ev.resource_name ??
                            `${ev.resource_type ?? ""}${
                              ev.resource_id
                                ? ` ${ev.resource_id.slice(0, 8)}`
                                : ""
                            }`}
                        </Text>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip content={ev.ip ?? "—"} relationship="label">
                      <Text className={styles.mono}>{maskIp(ev.ip)}</Text>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip
                      content={ev.user_agent ?? "—"}
                      relationship="label"
                    >
                      <Text style={{ fontSize: 12 }}>
                        {parseClient(ev.user_agent)}
                      </Text>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<SearchRegular />}
                      aria-label={t("audit.inspect")}
                      onClick={() => setInspect(ev)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("common.previous")}
          </Button>
          <Text size={200}>
            {t("common.pageOf", { page, total: totalPages })}
          </Text>
          <Button
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}

      <Dialog
        open={!!inspect}
        onOpenChange={(_, d) => !d.open && setInspect(null)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("audit.inspectTitle")}</DialogTitle>
            <DialogContent>
              {inspect && <InspectBody event={inspect} />}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setInspect(null)}>
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function InspectBody({ event }: { event: AuditEvent }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t("audit.colTime"), new Date(event.created_at * 1000).toLocaleString()],
    [t("audit.colAction"), event.action],
    [
      t("audit.colActor"),
      event.actor_name
        ? `${event.actor_name} (${event.actor_id ?? "—"})`
        : (event.actor_id ?? "—"),
    ],
    [
      t("audit.colResource"),
      event.resource_id || event.resource_type
        ? `${event.resource_name ?? ""} (${event.resource_type ?? "?"} / ${
            event.resource_id ?? "?"
          })`
        : "—",
    ],
    [t("audit.colIp"), event.ip ?? "—"],
    [t("audit.colClient"), event.user_agent ?? "—"],
  ];
  let metadata = event.metadata;
  try {
    metadata = JSON.stringify(JSON.parse(event.metadata), null, 2);
  } catch {
    /* leave as-is */
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8 }}>
          <Text
            weight="semibold"
            style={{ width: 90, color: tokens.colorNeutralForeground3 }}
          >
            {k}
          </Text>
          <Text
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              wordBreak: "break-all",
            }}
          >
            {v}
          </Text>
        </div>
      ))}
      <Text weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
        {t("audit.metadata")}
      </Text>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: tokens.colorNeutralBackground3,
          borderRadius: 6,
          fontSize: 12,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {metadata}
      </pre>
    </div>
  );
}
