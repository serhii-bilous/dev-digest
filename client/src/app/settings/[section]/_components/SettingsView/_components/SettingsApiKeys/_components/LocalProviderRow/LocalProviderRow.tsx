"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, TextInput } from "@devdigest/ui";
import { useLocalStatus, useSaveLocalToken } from "@/lib/hooks/local";
import { useTestConnection } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

const KNOWN_REASONS = [
  "cli_missing",
  "token_missing",
  "auth_failed",
  "rate_limited",
  "timeout",
  "invalid_output",
  "cli_error",
] as const;

/** "Local (Claude Code)" row: write-only token, status line, test connection. */
export function LocalProviderRow() {
  const t = useTranslations("settings");
  const { data: status } = useLocalStatus();
  const save = useSaveLocalToken();
  const test = useTestConnection();
  const [token, setToken] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<{ ok: boolean; message: string; reason?: string } | null>(null);
  const inputId = React.useId();

  const reasonText = (r: string | undefined) =>
    r && (KNOWN_REASONS as readonly string[]).includes(r) ? t(`apiKeys.local.reasons.${r}`) : (r ?? "");

  const onSave = async () => {
    const value = token.trim();
    if (!value) return;
    setSaveError(null);
    try {
      await save.mutateAsync(value);
      setToken(""); // write-only: never keep the value after saving
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : t("apiKeys.local.saveFailed"));
    }
  };

  const onTest = async () => {
    setRes(null);
    try {
      const r = await test.mutateAsync({ provider: "local" });
      setRes({ ok: r.ok, message: r.message, reason: r.reason });
    } catch (e) {
      setRes({ ok: false, message: e instanceof ApiError ? e.message : t("apiKeys.testFailed") });
    }
  };

  let statusText = t("apiKeys.local.statusLoading");
  if (status) {
    const cli = status.cli_version
      ? t("apiKeys.local.cliFound", { version: status.cli_version })
      : status.reason === "cli_missing"
        ? t("apiKeys.local.cliMissing")
        : t("apiKeys.local.cliFoundNoVersion");
    const tok = status.token_configured ? t("apiKeys.local.tokenConfigured") : t("apiKeys.local.tokenNotConfigured");
    const avail = status.available
      ? t("apiKeys.local.available")
      : t("apiKeys.local.unavailable", { reason: reasonText(status.reason) });
    statusText = [cli, tok, avail].join(" · ");
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <label htmlFor={inputId} style={s.label}>
          {t("apiKeys.local.tokenLabel")} — {t("apiKeys.local.label")}
        </label>
      </div>
      <div style={s.row}>
        <div style={s.input}>
          <TextInput
            id={inputId}
            value={token}
            onChange={setToken}
            mono
            type="password"
            autoComplete="off"
            placeholder={t("apiKeys.local.tokenPlaceholder")}
          />
        </div>
        <Button
          kind="secondary"
          size="md"
          onClick={onSave}
          disabled={save.isPending || !token.trim()}
          aria-busy={save.isPending}
        >
          {save.isPending ? t("apiKeys.local.saving") : t("apiKeys.local.saveToken")}
        </Button>
      </div>
      {saveError && (
        <div role="alert" style={s.result(false)}>
          {saveError}
        </div>
      )}
      <div role="status" style={s.status}>
        {statusText}
      </div>
      <div style={s.hint}>{t("apiKeys.local.hint")}</div>
      <div style={s.testRow}>
        <Button kind="secondary" size="md" onClick={onTest} disabled={test.isPending} aria-busy={test.isPending}>
          {test.isPending ? t("apiKeys.testing") : t("apiKeys.testConnection")}
        </Button>
        {res && (
          <span style={s.result(res.ok)}>
            {res.ok ? <Icon.CheckCircle size={13} /> : <Icon.XCircle size={13} />}
            {res.message}
            {res.reason ? ` (${t("apiKeys.local.reasonPrefix", { reason: reasonText(res.reason) })})` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
