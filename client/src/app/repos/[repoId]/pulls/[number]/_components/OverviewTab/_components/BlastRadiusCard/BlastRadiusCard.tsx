/* BlastRadiusCard — placeholder for the future Blast Radius block (changed
   symbols, callers, endpoints, crons — `@devdigest/shared`'s BlastRadius
   contract already exists for it). Reserves the right-hand column next to
   IntentCard so the grid layout doesn't need to change again once it lands. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

export function BlastRadiusCard() {
  const t = useTranslations("prReview");
  return (
    <section>
      <SectionLabel icon="GitBranch">{t("blastRadius.sectionLabel")}</SectionLabel>
      <div style={s.box}>
        <p style={s.comingSoon}>{t("blastRadius.comingSoon")}</p>
      </div>
    </section>
  );
}
