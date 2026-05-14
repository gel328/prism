import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Tab,
  TabList,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Domain, VerificationMethod } from "../../../lib/api";

interface DomainDetailDialogProps {
  domain: Domain | null;
  verifying: boolean;
  onClose: () => void;
  onVerify: (id: string, method: VerificationMethod) => Promise<void>;
  onDelete: (id: string) => void;
}

export function DomainDetailDialog({
  domain,
  verifying,
  onClose,
  onVerify,
  onDelete,
}: DomainDetailDialogProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<VerificationMethod>("dns-txt");
  return (
    <Dialog
      open={!!domain}
      onOpenChange={(_, s) => {
        if (!s.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle style={{ fontFamily: "monospace" }}>
            {domain?.domain}
          </DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Badge
                color={domain?.verified ? "success" : "subtle"}
                appearance="filled"
                icon={domain?.verified ? <CheckmarkCircleRegular /> : undefined}
                style={{ width: "fit-content" }}
              >
                {domain?.verified
                  ? t("domains.verifiedBadge")
                  : t("domains.pending")}
              </Badge>

              {domain?.verified_at && (
                <Text size={200}>
                  <Text size={200} weight="semibold">
                    {t("domains.verifiedLabel")}:
                  </Text>{" "}
                  {new Date(domain.verified_at * 1000).toLocaleDateString()}
                </Text>
              )}
              {domain?.verified && domain.verification_method && (
                <Text size={200}>
                  <Text size={200} weight="semibold">
                    {t("domains.methodLabel")}:
                  </Text>{" "}
                  {t(`domains.method.${domain.verification_method}`)}
                </Text>
              )}
              {domain?.next_reverify_at && (
                <Text size={200}>
                  <Text size={200} weight="semibold">
                    {t("domains.nextReverifyLabel")}:
                  </Text>{" "}
                  {new Date(
                    domain.next_reverify_at * 1000,
                  ).toLocaleDateString()}
                </Text>
              )}

              {!domain?.verified && domain && (
                <VerificationInstructions
                  domain={domain}
                  method={method}
                  onMethodChange={setMethod}
                />
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{t("common.close")}</Button>
            <Button
              appearance="outline"
              icon={<ArrowClockwiseRegular />}
              disabled={verifying}
              onClick={async () => {
                if (!domain) return;
                await onVerify(domain.id, method);
                onClose();
              }}
            >
              {verifying ? <Spinner size="tiny" /> : t("common.verify")}
            </Button>
            <Button
              appearance="primary"
              style={{ background: tokens.colorPaletteRedBackground3 }}
              onClick={() => {
                if (!domain) return;
                onDelete(domain.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

interface InstructionsProps {
  domain: Domain;
  method: VerificationMethod;
  onMethodChange: (m: VerificationMethod) => void;
}

export function VerificationInstructions({
  domain,
  method,
  onMethodChange,
}: InstructionsProps) {
  const { t } = useTranslation();
  const token = domain.verification_token;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 6,
        background: tokens.colorNeutralBackground3,
      }}
    >
      <TabList
        size="small"
        selectedValue={method}
        onTabSelect={(_, d) => onMethodChange(d.value as VerificationMethod)}
      >
        <Tab value="dns-txt">{t("domains.method.dns-txt")}</Tab>
        <Tab value="http-file">{t("domains.method.http-file")}</Tab>
        <Tab value="html-meta">{t("domains.method.html-meta")}</Tab>
      </TabList>

      {method === "dns-txt" && (
        <>
          <Text size={200} weight="semibold">
            {t("domains.addDnsTxtRecord")}
          </Text>
          <Text size={200}>
            <Text size={200} weight="semibold">
              {t("domains.dnsType")}:
            </Text>{" "}
            TXT
          </Text>
          <Text size={200}>
            <Text size={200} weight="semibold">
              {t("domains.dnsName")}:
            </Text>{" "}
            <Text size={200} font="monospace">
              _prism-verify.{domain.domain}
            </Text>
          </Text>
          <Text size={200}>
            <Text size={200} weight="semibold">
              {t("domains.dnsValue")}:
            </Text>{" "}
            <Text size={200} font="monospace">
              prism-verify={token}
            </Text>
          </Text>
        </>
      )}

      {method === "http-file" && (
        <>
          <Text size={200} weight="semibold">
            {t("domains.addHttpFile")}
          </Text>
          <Text size={200}>
            <Text size={200} weight="semibold">
              {t("domains.httpUrl")}:
            </Text>{" "}
            <Text size={200} font="monospace">
              https://{domain.domain}/.well-known/prism-verify-{token}.txt
            </Text>
          </Text>
          <Text size={200}>
            <Text size={200} weight="semibold">
              {t("domains.httpContent")}:
            </Text>{" "}
            <Text size={200} font="monospace">
              prism-verify={token}
            </Text>
          </Text>
        </>
      )}

      {method === "html-meta" && (
        <>
          <Text size={200} weight="semibold">
            {t("domains.addHtmlMeta")}
          </Text>
          <Text size={200}>
            {t("domains.htmlMetaHint", { domain: domain.domain })}
          </Text>
          <Text
            size={200}
            font="monospace"
          >{`<meta name="prism-verify" content="${token}">`}</Text>
        </>
      )}
    </div>
  );
}
