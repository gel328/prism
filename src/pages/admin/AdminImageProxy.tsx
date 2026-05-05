// Admin viewer for the image_proxy_mappings table.
//
// Lists every URL the worker is willing to fetch and stream as an image,
// with the user (if any) who first caused it to be registered. Removing
// a row immediately stops the proxy from serving that URL.

import {
  Button,
  Input,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from "@fluentui/react-components";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../lib/api";
import { SkeletonTableRows } from "../../components/Skeletons";

const PAGE_SIZE = 50;

export function AdminImageProxy() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchUrl, setSearchUrl] = useState("");
  const [filterCreator, setFilterCreator] = useState("");
  const [appliedSearchUrl, setAppliedSearchUrl] = useState("");
  const [appliedFilterCreator, setAppliedFilterCreator] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [
      "admin-image-proxy",
      page,
      appliedSearchUrl,
      appliedFilterCreator,
    ],
    queryFn: () =>
      api.adminListImageProxy(page, {
        q: appliedSearchUrl || undefined,
        created_by: appliedFilterCreator || undefined,
        limit: PAGE_SIZE,
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteImageProxy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-image-proxy"] });
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.imageProxyDeleteFailed"),
      );
    },
  });

  const [sweepMessage, setSweepMessage] = useState<string | null>(null);
  const sweepMut = useMutation({
    mutationFn: () => api.adminSweepImageProxy(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-image-proxy"] });
      setError(null);
      setSweepMessage(
        t("admin.imageProxySweepSuccess", { count: res.deleted }),
      );
    },
    onError: (err) => {
      setSweepMessage(null);
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.imageProxySweepFailed"),
      );
    },
  });

  function applyFilters() {
    setAppliedSearchUrl(searchUrl);
    setAppliedFilterCreator(filterCreator);
    setPage(1);
  }

  function clearFilters() {
    setSearchUrl("");
    setFilterCreator("");
    setAppliedSearchUrl("");
    setAppliedFilterCreator("");
    setPage(1);
  }

  const hasFilters = !!(appliedSearchUrl || appliedFilterCreator);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const mappings = data?.mappings ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Text style={{ color: tokens.colorNeutralForeground3 }}>
        {t("admin.imageProxySubtitle")}
      </Text>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t("admin.imageProxySearchUrl")}
          </Text>
          <Input
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            placeholder="example.com"
            style={{ minWidth: 280 }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t("admin.imageProxyFilterCreator")}
          </Text>
          <Input
            value={filterCreator}
            onChange={(e) => setFilterCreator(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            placeholder={t("admin.imageProxyCreatorPlaceholder")}
            style={{ minWidth: 240 }}
          />
        </div>
        <Button appearance="primary" onClick={applyFilters}>
          {t("common.search")}
        </Button>
        {hasFilters && (
          <Button appearance="subtle" onClick={clearFilters}>
            {t("admin.loginErrors.clearFilters")}
          </Button>
        )}
        <Button
          appearance="outline"
          disabled={sweepMut.isPending}
          onClick={() => sweepMut.mutate()}
          title={t("admin.imageProxySweepHint")}
        >
          {t("admin.imageProxySweepButton")}
        </Button>
      </div>

      {sweepMessage && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {sweepMessage}
        </Text>
      )}

      {error && (
        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
          {error}
        </Text>
      )}

      {data && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {t("admin.imageProxyTotal", { total: data.total })}
        </Text>
      )}

      {isLoading ? (
        <SkeletonTableRows rows={8} cols={5} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t("admin.imageProxyIdHeader")}</TableHeaderCell>
              <TableHeaderCell>
                {t("admin.imageProxyUrlHeader")}
              </TableHeaderCell>
              <TableHeaderCell>
                {t("admin.imageProxyCreatorHeader")}
              </TableHeaderCell>
              <TableHeaderCell>
                {t("admin.imageProxyCreatedAtHeader")}
              </TableHeaderCell>
              <TableHeaderCell>
                {t("admin.imageProxyActionsHeader")}
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    color: tokens.colorNeutralForeground3,
                  }}
                >
                  {t("admin.imageProxyNoResults")}
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: tokens.colorNeutralForeground3,
                    }}
                    title={m.id}
                  >
                    {m.id.slice(0, 12)}…
                  </TableCell>
                  <TableCell
                    style={{
                      fontSize: 12,
                      maxWidth: 420,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={m.url}
                  >
                    <Link
                      href={`/api/proxy/image/${m.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m.url}
                    </Link>
                  </TableCell>
                  <TableCell style={{ fontSize: 12 }}>
                    {m.created_by ? (
                      <span
                        style={{ fontFamily: "monospace" }}
                        title={m.created_by}
                      >
                        {m.created_by_username ??
                          m.created_by_display_name ??
                          m.created_by.slice(0, 8) + "…"}
                      </span>
                    ) : (
                      <Text
                        size={200}
                        style={{
                          color: tokens.colorNeutralForeground3,
                          fontStyle: "italic",
                        }}
                      >
                        {t("admin.imageProxySystemRow")}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(m.created_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      appearance="subtle"
                      disabled={
                        deleteMut.isPending && deleteMut.variables === m.id
                      }
                      onClick={() => {
                        if (
                          window.confirm(t("admin.imageProxyDeleteConfirm"))
                        ) {
                          deleteMut.mutate(m.id);
                        }
                      }}
                      style={{ color: tokens.colorPaletteRedForeground1 }}
                    >
                      {t("admin.imageProxyDelete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

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
    </div>
  );
}
