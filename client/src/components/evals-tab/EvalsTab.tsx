/* EvalsTab — list of eval cases with status, "expected N got M" badges, and
   run/edit/delete actions, plus "Run all evals" and "New eval case". Shared
   across owner kinds (agent/skill) — this component itself is owner-agnostic,
   which is why it lives in src/components rather than under one route. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton, type IconName } from "@devdigest/ui";
import type { EvalCaseWithLatestRun, EvalOwnerKind } from "@devdigest/shared";
import {
  useEvals,
  useEvalsSummary,
  useDeleteEvalCase,
  useRunEvalCase,
  useRunAllEvalCases,
} from "@/lib/hooks/evals";
import { useToast } from "@/lib/toast";
import { EvalCaseModal } from "./_components/EvalCaseModal";
import { caseStatus, parseFindingDescriptors } from "./helpers";
import { s } from "./styles";

const STATUS_ICON: Record<string, { icon: IconName; color: string }> = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  "never-run": { icon: "Circle", color: "var(--text-muted)" },
};

export function EvalsTab({ ownerKind, ownerId }: { ownerKind: EvalOwnerKind; ownerId: string }) {
  const t = useTranslations("evalCases");
  const toast = useToast();
  const { data: cases, isLoading } = useEvals(ownerKind, ownerId);
  const { data: summary } = useEvalsSummary(ownerKind, ownerId);
  const del = useDeleteEvalCase();
  const runOne = useRunEvalCase();
  const runAll = useRunAllEvalCases();
  const [modalCase, setModalCase] = React.useState<EvalCaseWithLatestRun | "new" | null>(null);

  const runCase = async (c: EvalCaseWithLatestRun) => {
    try {
      const result = await runOne.mutateAsync({ id: c.id, ownerKind, ownerId });
      toast[result.result.traces_passed > 0 ? "success" : "error"](
        result.result.traces_passed > 0
          ? t("runPassed", { name: c.name })
          : t("runFailedResult", { name: c.name }),
      );
    } catch {
      toast.error(t("runFailed"));
    }
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ height: 12 }} />
        <Skeleton height={200} />
      </div>
    );
  }

  const list = cases ?? [];

  return (
    <div style={s.wrap}>
      {modalCase && (
        <EvalCaseModal
          ownerKind={ownerKind}
          ownerId={ownerId}
          existing={modalCase === "new" ? undefined : modalCase}
          onClose={() => setModalCase(null)}
        />
      )}
      <div style={s.header}>
        <h2 style={s.h2}>{t("title")}</h2>
        {summary && (
          <span style={s.badge}>{t("summary", { passing: summary.passing, total: summary.total })}</span>
        )}
        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            onClick={() => runAll.mutate({ ownerKind, ownerId })}
            disabled={runAll.isPending || list.length === 0}
          >
            {t("runAll")}
          </Button>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setModalCase("new")}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <div style={s.list}>
          {list.map((c) => {
            const status = STATUS_ICON[caseStatus(c)]!;
            const StatusIcon = Icon[status.icon];
            const expected = parseFindingDescriptors(c.expected_output);
            const badge =
              expected.length === 0
                ? t("emptyBadge")
                : expected
                    .map((e) => `${t(`severity.${e.severity}`)} · ${t(`category.${e.category}`)}`)
                    .join(", ");
            const actualCount = c.latest_run
              ? parseFindingDescriptors(c.latest_run.actual_output).length
              : null;

            return (
              <div key={c.id} style={s.row}>
                <StatusIcon size={16} style={{ color: status.color, flexShrink: 0 }} />
                <div style={s.rowMain}>
                  <div style={s.name}>{c.name}</div>
                  <div style={s.subtitle}>
                    {actualCount != null
                      ? t("expectedGot", { expected: expected.length, actual: actualCount })
                      : t("neverRun")}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {badge}
                </span>
                <div style={s.rowActions}>
                  <button
                    style={s.iconBtn}
                    title={t("runCase")}
                    aria-label={t("runCase")}
                    onClick={() => runCase(c)}
                    disabled={runOne.isPending}
                  >
                    <Icon.Play size={14} />
                  </button>
                  <button
                    style={s.iconBtn}
                    title={t("editCase")}
                    aria-label={t("editCase")}
                    onClick={() => setModalCase(c)}
                  >
                    <Icon.Edit size={14} />
                  </button>
                  <button
                    style={s.iconBtn}
                    title={t("deleteCase")}
                    aria-label={t("deleteCase")}
                    onClick={() => {
                      if (window.confirm(t("deleteConfirm", { name: c.name }))) {
                        del.mutate({ id: c.id, ownerKind, ownerId });
                      }
                    }}
                  >
                    <Icon.Trash size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
