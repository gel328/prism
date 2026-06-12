// Domain verification page

import {
  Button,
  Field,
  Input,
  MessageBar,
  Spinner,
} from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import type { Domain, DomainAddResponse, VerificationMethod } from "../lib/api";
import { DomainDetailDialog } from "./domains/dialogs/DomainDetailDialog";
import { TransferDomainDialog } from "./domains/dialogs/TransferDomainDialog";
import { ShareDomainDialog } from "./domains/dialogs/ShareDomainDialog";
import { DomainsTable } from "./domains/DomainsTable";
import { DnsAddedInfo } from "./domains/components";
import { PageHeader } from "../components/PageHeader";
import { useToastMessage } from "../lib/useToastMessage";

export function Domains() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: api.listDomains,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: api.listTeams,
  });
  // Only teams where user is admin/owner
  const manageableTeams = (teamsData?.teams ?? []).filter(
    (t) => t.role === "owner" || t.role === "admin",
  );

  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedInfo, setAddedInfo] = useState<DomainAddResponse | null>(null);
  const { message, showMsg } = useToastMessage();
  const [verifying, setVerifying] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [transferDomain, setTransferDomain] = useState<Domain | null>(null);
  const [shareDomain, setShareDomain] = useState<Domain | null>(null);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const res = await api.addDomain(newDomain.trim());
      setAddedInfo(res);
      setNewDomain("");
      await qc.invalidateQueries({ queryKey: ["domains"] });
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("domains.failedAddDomain"),
      );
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string, method?: VerificationMethod) => {
    setVerifying(id);
    try {
      const res = await api.verifyDomain(id, method);
      if (res.verified) {
        showMsg("success", t("domains.domainVerified"));
        await qc.invalidateQueries({ queryKey: ["domains"] });
      } else {
        showMsg("error", t("domains.verificationCheckFailed"));
      }
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("domains.verificationFailed"),
      );
    } finally {
      setVerifying(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDomain(id);
      await qc.invalidateQueries({ queryKey: ["domains"] });
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("domains.deleteFailed"),
      );
    }
  };

  const handleTransferToTeam = async (teamId: string) => {
    if (!transferDomain) return;
    try {
      await api.transferDomainToTeam(transferDomain.id, teamId);
      await qc.invalidateQueries({ queryKey: ["domains"] });
      await qc.invalidateQueries({ queryKey: ["team-domains", teamId] });
      setTransferDomain(null);
      showMsg("success", t("domains.domainMovedToTeam"));
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("domains.transferFailed"),
      );
      throw err;
    }
  };

  const handleShareToTeam = async (teamId: string) => {
    if (!shareDomain) return;
    try {
      await api.shareDomainToTeam(shareDomain.id, teamId);
      await qc.invalidateQueries({ queryKey: ["team-domains", teamId] });
      setShareDomain(null);
      showMsg("success", t("domains.domainSharedWithTeam"));
    } catch (err) {
      showMsg(
        "error",
        err instanceof ApiError ? err.message : t("domains.shareFailed"),
      );
      throw err;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title={t("domains.title")}
        subtitle={t("domains.description")}
        style={{ marginBottom: 0 }}
      />

      {message && (
        <MessageBar intent={message.type === "success" ? "success" : "error"}>
          {message.text}
        </MessageBar>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Field label={t("domains.addDomain")} style={{ flex: 1 }}>
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder={t("domains.addDomainPlaceholder")}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </Field>
        <Button
          appearance="primary"
          icon={<AddRegular />}
          onClick={handleAdd}
          disabled={adding || !newDomain}
          style={{ alignSelf: "flex-end" }}
        >
          {adding ? <Spinner size="tiny" /> : t("common.add")}
        </Button>
      </div>

      {addedInfo && (
        <DnsAddedInfo info={addedInfo} onDismiss={() => setAddedInfo(null)} />
      )}

      <DomainsTable
        domains={data?.domains ?? []}
        loading={isLoading}
        verifying={verifying}
        manageableTeams={manageableTeams}
        onVerify={handleVerify}
        onDelete={handleDelete}
        onSelectDomain={setSelectedDomain}
        onTransferDomain={setTransferDomain}
        onShareDomain={setShareDomain}
      />

      <DomainDetailDialog
        domain={selectedDomain}
        verifying={verifying === selectedDomain?.id}
        onClose={() => setSelectedDomain(null)}
        onVerify={handleVerify}
        onDelete={handleDelete}
      />

      <TransferDomainDialog
        domain={transferDomain}
        teams={manageableTeams}
        onClose={() => setTransferDomain(null)}
        onTransfer={handleTransferToTeam}
      />

      <ShareDomainDialog
        domain={shareDomain}
        teams={manageableTeams}
        onClose={() => setShareDomain(null)}
        onShare={handleShareToTeam}
      />
    </div>
  );
}
