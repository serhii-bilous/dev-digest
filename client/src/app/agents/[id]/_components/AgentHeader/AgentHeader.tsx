"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { LanguageBadge } from "@/components/agents/LanguageBadge";

interface AgentHeaderProps {
  agent: Agent;
  /** Full name of the active repo when the agent is not compatible with it; otherwise null. */
  incompatibleRepo: string | null;
  onRun: () => void;
}

/** Editor header: name, provider/model, language badge, incompatible-repo note (text, NFR-9). */
export function AgentHeader({ agent, incompatibleRepo, onRun }: AgentHeaderProps) {
  const t = useTranslations("agents");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0, flexWrap: "wrap" }}>
      <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{agent.name}</h1>
      <Badge color="var(--text-secondary)" mono>
        {agent.provider}/{agent.model}
      </Badge>
      <LanguageBadge languages={agent.languages} />
      {incompatibleRepo && (
        <span role="status" style={{ fontSize: 13, color: "var(--warn, #b45309)" }}>
          {t("editor.notCompatible", { repo: incompatibleRepo })}
        </span>
      )}
      <div style={{ marginLeft: "auto" }}>
        <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={onRun}>
          Run on a PR…
        </Button>
      </div>
    </div>
  );
}
