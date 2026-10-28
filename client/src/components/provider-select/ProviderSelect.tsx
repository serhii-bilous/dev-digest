"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { LocalStatus, Provider } from "@devdigest/shared";
import { useLocalStatus } from "@/lib/hooks/local";

const PROVIDERS: readonly Provider[] = ["openai", "anthropic", "openrouter", "local"];

/** Text naming why Local is unusable, or null when it is available/unknown (still loading). */
export function useLocalUnavailableText(status: LocalStatus | undefined): string | null {
  const t = useTranslations("agents");
  if (!status || status.available) return null;
  return status.reason === "cli_missing" ? t("provider.unavailableCli") : t("provider.unavailableToken");
}

/** Native provider <select> styled like SelectInput, with a disabled "Local" option while
 *  Claude Code is unavailable (reason shown as option text, not only by colour). */
export function ProviderSelect({
  value,
  onChange,
  id,
}: {
  value: Provider;
  onChange: (v: Provider) => void;
  id?: string;
}) {
  const t = useTranslations("agents");
  const { data: status } = useLocalStatus();
  const reason = useLocalUnavailableText(status);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
      }}
    >
      <select
        id={id}
        aria-label={t("config.provider")}
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value as Provider)}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          color: "var(--text-primary)",
          background: "transparent",
          border: "none",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {PROVIDERS.map((p) => {
          if (p !== "local") return <option key={p} value={p}>{p}</option>;
          // An agent already on Local keeps the option selectable so its value stays valid.
          const disabled = !!reason && value !== "local";
          const label = t("provider.local");
          return (
            <option key={p} value={p} disabled={disabled}>
              {reason ? `${label} — ${reason}` : label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
