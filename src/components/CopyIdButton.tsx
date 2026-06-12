import { Button, Tooltip } from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function CopyIdButton({ id, label }: { id: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Tooltip
      content={copied ? t("common.copied") : (label ?? t("common.copyId"))}
      relationship="label"
    >
      <Button
        size="small"
        appearance="subtle"
        icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
        onClick={copy}
      />
    </Tooltip>
  );
}
