/* ConventionsView — /conventions. Scans the active repo for house-style
   conventions, lets the user accept/reject each candidate, and merges the
   accepted ones into a Skill via CreateSkillFromConventionsModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { usePulls } from "@/lib/hooks";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { DEFAULT_BRANCH_VALUE, findPrBranch, parsePrSelection, relativeTime } from "./helpers";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const staleRepoId = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const { data: pulls } = usePulls(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [creatingSkill, setCreatingSkill] = React.useState(false);
  const [selectedPr, setSelectedPr] = React.useState<number | null>(null);

  const repoName = activeRepo?.full_name ?? repoId ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  // No repo selected at all, or the stored/URL repo id no longer matches any
  // known repo (stale localStorage entry from a previous session).
  if (staleRepoId || (reposLoaded && !repoId)) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const act = (id: string, accepted: boolean) => {
    setPendingId(id);
    update.mutate(
      { id, patch: { accepted } },
      { onSettled: () => setPendingId(null) },
    );
  };

  const candidates = data?.candidates ?? [];
  const acceptedCandidates = candidates.filter((c) => c.accepted);
  const scanned = data?.scan.scanned_at != null;

  const deselectAll = () => {
    for (const c of acceptedCandidates) update.mutate({ id: c.id, patch: { accepted: false } });
  };

  const runExtraction = () => extract.mutate(selectedPr ?? undefined);
  const prOptions = [
    { value: DEFAULT_BRANCH_VALUE, label: t("page.prPicker.defaultBranch") },
    ...(pulls ?? []).map((p) => ({
      value: String(p.number),
      label: t("page.prPicker.prOption", { number: p.number, title: p.title }),
    })),
  ];
  const scannedPrBranch = findPrBranch(pulls ?? [], data?.scan.pull_number);
  const cardRepo = activeRepo
    ? { ...activeRepo, default_branch: scannedPrBranch ?? activeRepo.default_branch }
    : undefined;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{repoName}</span>
            </h1>
            {scanned && data && (
              <p style={s.subtitle}>
                {data.scan.pull_number != null
                  ? t("page.sampleSummaryPr", {
                      count: data.scan.sample_file_count,
                      pr: data.scan.pull_number,
                      when: relativeTime(data.scan.scanned_at as string),
                    })
                  : t("page.sampleSummary", {
                      count: data.scan.sample_file_count,
                      when: relativeTime(data.scan.scanned_at as string),
                    })}
              </p>
            )}
            {extract.isError && (
              <p style={s.errorNote}>
                {t("page.extractionFailed")}
                {": "}
                {extract.error instanceof ApiError ? extract.error.message : ""}
              </p>
            )}
          </div>
          <div style={s.headerActions}>
            <div style={s.prPicker}>
              <span style={s.prPickerLabel}>{t("page.prPicker.label")}</span>
              <SelectInput
                value={selectedPr != null ? String(selectedPr) : DEFAULT_BRANCH_VALUE}
                onChange={(v) => setSelectedPr(parsePrSelection(v))}
                options={prOptions}
              />
            </div>
            {scanned && (
              <>
                <Button
                  kind="secondary"
                  icon="RefreshCw"
                  loading={extract.isPending}
                  disabled={extract.isPending}
                  onClick={runExtraction}
                >
                  {extract.isPending ? t("page.scanning") : t("page.rescan")}
                </Button>
                <Button
                  kind="primary"
                  icon="Sparkles"
                  disabled={acceptedCandidates.length === 0}
                  onClick={() => setCreatingSkill(true)}
                >
                  {t("page.createSkill")}
                </Button>
              </>
            )}
          </div>
        </div>

        {isLoading && (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={140} />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && !scanned && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            ctaLoading={extract.isPending}
            onCta={runExtraction}
          />
        )}

        {!isLoading && !isError && scanned && candidates.length > 0 && (
          <>
            <div style={s.toolbar}>
              <Button kind="ghost" size="sm" onClick={deselectAll} disabled={acceptedCandidates.length === 0}>
                {t("page.deselectAll")}
              </Button>
              <span style={s.summary}>
                {t("page.acceptedSummary", {
                  accepted: acceptedCandidates.length,
                  total: candidates.length,
                })}
              </span>
            </div>
            <div style={s.list}>
              {candidates.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  pending={pendingId === c.id}
                  repo={cardRepo}
                  onAction={(action) => act(c.id, action === "accept")}
                />
              ))}
            </div>
          </>
        )}

        {!isLoading && !isError && scanned && candidates.length === 0 && (
          <p style={s.noCandidates}>{t("page.noCandidates")}</p>
        )}
      </div>

      {creatingSkill && (
        <CreateSkillFromConventionsModal
          candidates={acceptedCandidates}
          repoName={repoName}
          onClose={() => setCreatingSkill(false)}
        />
      )}
    </AppShell>
  );
}
