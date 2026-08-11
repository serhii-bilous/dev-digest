/* SkillCard — type/source chips, "needs vetting" indicator, enabled toggle.
   Mirrors client/src/app/agents/_components/AgentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { TYPE_COLOR, VETTING_REQUIRED_SOURCES } from "./constants";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  onClick,
  onToggle,
}: {
  sk: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const color = TYPE_COLOR[sk.type] ?? "var(--text-secondary)";
  const needsVetting = VETTING_REQUIRED_SOURCES.has(sk.source);

  return (
    <div onClick={onClick} style={s.card(!!active, sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{sk.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={sk.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${sk.name}"? This cannot be undone.`)) del.mutate(sk.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{sk.description || t("listItem.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(color)}>
          {t(`listItem.type.${sk.type}`)}
        </span>
        <Badge>{t(`listItem.source.${sk.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn, #f59e0b)" bg="var(--warn-bg, #2e1f05)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      {sk.agent_count != null && (
        <div style={s.statsRow}>
          <span>{t("listItem.agentCount", { count: sk.agent_count })}</span>
          {sk.pull_rate != null && (
            <span>{t("listItem.pullRate", { pct: Math.round(sk.pull_rate * 100) })}</span>
          )}
          {sk.accept_rate != null && (
            <span style={s.statAccept}>
              {t("listItem.acceptRate", { pct: Math.round(sk.accept_rate * 100) })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
