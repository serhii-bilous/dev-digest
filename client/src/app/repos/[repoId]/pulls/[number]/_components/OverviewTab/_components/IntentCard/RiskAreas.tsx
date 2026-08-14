/* RiskAreas — clickable chip row inside IntentCard; clicking a chip expands
   an explanation + source reference below it (one open at a time). Backend
   doesn't compute `Risk[]` yet (no LLM call produces it) — this renders the
   real empty state until that lands, but the interaction is fully wired so
   nothing here needs to change when it does. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, type IconName } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { s } from "./styles";

const KIND_ICON: Record<string, IconName> = {
  auth: "Shield",
  dependency: "Boxes",
  performance: "Zap",
};

export function RiskAreas({ risks }: { risks: Risk[] }) {
  const t = useTranslations("prReview");
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  const active = activeIdx != null ? risks[activeIdx] : undefined;

  return (
    <div style={s.riskAreas}>
      <div style={s.scopeLabel}>{t("intent.riskAreas.sectionLabel")}</div>
      {risks.length === 0 ? (
        <p style={s.riskEmpty}>{t("intent.riskAreas.empty")}</p>
      ) : (
        <>
          <div style={s.riskChipRow}>
            {risks.map((risk, i) => (
              <Chip
                key={`${risk.title}-${i}`}
                icon={KIND_ICON[risk.kind] ?? "AlertTriangle"}
                active={i === activeIdx}
                onClick={() => setActiveIdx(i === activeIdx ? null : i)}
              >
                {risk.title}
              </Chip>
            ))}
          </div>
          {active && (
            <div style={s.riskDetail}>
              <p style={s.riskExplanation}>{active.explanation}</p>
              {active.file_refs.length > 0 && (
                <div className="mono" style={s.riskFileRefs}>
                  {active.file_refs.join(", ")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
