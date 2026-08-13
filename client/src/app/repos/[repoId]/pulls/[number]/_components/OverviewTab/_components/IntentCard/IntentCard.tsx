/* IntentCard — the PR's derived Intent Layer (summary, in/out of scope).
   Sits above Description so a reviewer sees "what this PR is trying to do"
   before the raw diff/findings. Computation is a small synchronous LLM call
   (see hooks/intent.ts) — no polling, the mutation response IS the new state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useComputeIntent } from "../../../../../../../../../lib/hooks/intent";
import { relativeTime } from "../../../../../helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview");
  const { data, isLoading } = usePrIntent(prId);
  const compute = useComputeIntent(prId);

  if (!prId || isLoading) {
    return (
      <section>
        <SectionLabel icon="Target">{t("intent.sectionLabel")}</SectionLabel>
        <div style={s.box}>
          <div style={s.skeletonStack}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={14} width="85%" />
          </div>
        </div>
      </section>
    );
  }

  if (data == null) {
    return (
      <section>
        <SectionLabel icon="Target">{t("intent.sectionLabel")}</SectionLabel>
        <div style={s.box}>
          <p style={s.emptyBody}>{t("intent.empty.body")}</p>
          <Button
            kind="secondary"
            size="sm"
            icon="Sparkles"
            loading={compute.isPending}
            onClick={() => compute.mutate()}
          >
            {compute.isPending ? t("intent.deriving") : t("intent.empty.cta")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={compute.isPending}
            onClick={() => compute.mutate()}
          >
            {compute.isPending ? t("intent.deriving") : t("intent.recompute")}
          </Button>
        }
      >
        {t("intent.sectionLabel")}
      </SectionLabel>
      <div style={s.box}>
        <p style={s.summary}>{data.summary}</p>
        <div style={s.scopeGrid}>
          <div>
            <div style={s.scopeLabel}>{t("intent.inScope")}</div>
            <ul style={s.list}>
              {data.in_scope.map((item, i) => (
                <li key={`in-${i}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div style={s.scopeLabel}>{t("intent.outOfScope")}</div>
            <ul style={s.list}>
              {data.out_of_scope.map((item, i) => (
                <li key={`out-${i}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div style={s.meta}>{t("intent.computedAt", { time: relativeTime(data.computed_at) })}</div>
      </div>
    </section>
  );
}
