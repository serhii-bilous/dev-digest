/* ConventionCard — one extracted convention candidate: rule + evidence
   (file:line + real code snippet) + confidence bar (display-only) + accept/
   reject actions. Modeled on FindingCard's accept/dismiss shape. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, evidenceLocation } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  pending,
  onAction,
}: {
  candidate: ConventionCandidate;
  pending?: boolean;
  onAction: (action: "accept" | "reject") => void;
}) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);
  const location = evidenceLocation(
    candidate.evidence_path,
    candidate.evidence_line_start,
    candidate.evidence_line_end,
  );

  const copy = () => {
    void navigator.clipboard?.writeText(candidate.evidence_snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.titleWrap}>
          <div style={s.title}>{candidate.rule}</div>
          <div style={s.categoryTag}>{candidate.category}</div>
        </div>
        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Check"
            disabled={pending}
            active={candidate.accepted}
            onClick={() => onAction("accept")}
          >
            {t("card.accepted")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            disabled={pending}
            active={!candidate.accepted}
            onClick={() => onAction("reject")}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>

      <div style={s.evidence}>
        <div style={s.evidenceHeader}>
          <span style={s.evidencePath}>{location}</span>
          <button
            type="button"
            title={t("card.copyEvidence")}
            aria-label={t("card.copyEvidence")}
            onClick={copy}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
          </button>
        </div>
        <pre style={s.evidenceSnippet}>{candidate.evidence_snippet}</pre>
      </div>

      <div style={s.footer}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBar}>
          <div
            style={s.confidenceFill(
              Math.round(candidate.confidence * 100),
              confidenceColor(candidate.confidence),
            )}
          />
        </div>
        <span style={s.confidencePct}>{Math.round(candidate.confidence * 100)}%</span>
      </div>
    </div>
  );
}
