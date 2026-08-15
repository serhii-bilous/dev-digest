/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, and — when Smart Diff supplies findings — a findings badge) and, when
   open, its parsed lines (with inline finding tags) plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge } from "@devdigest/ui";
import type { FindingRecord, SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { countBySeverity, severitiesForLine } from "../helpers-findings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  role,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Smart Diff's classification for this file — boilerplate always starts
   *  collapsed, regardless of size. Undefined outside Smart Diff (flat view). */
  role?: SmartDiffRole;
  /** This file's findings (already scoped to it by the caller) — drives the
   *  header badge and the inline per-line severity tags. */
  findings?: FindingRecord[];
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    role === "boilerplate"
      ? false
      : (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  const findingCounts = findings ? countBySeverity(findings) : null;
  const hasFindings = !!findings && findings.length > 0;

  // Scroll-to-line: clicking the findings badge opens the card (if needed) and
  // scrolls to its lowest-line finding. `scrollNonce` forces the effect to
  // re-run even when the target line hasn't changed since the last click.
  const lineRefs = React.useRef(new Map<number, HTMLDivElement | null>());
  const [scrollTarget, setScrollTarget] = React.useState<number | null>(null);
  const [scrollNonce, setScrollNonce] = React.useState(0);

  React.useEffect(() => {
    if (scrollTarget == null) return;
    lineRefs.current.get(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNonce]);

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!findings || findings.length === 0) return;
    const lowest = Math.min(...findings.map((f) => f.start_line));
    setOpen(true);
    setScrollTarget(lowest);
    setScrollNonce((n) => n + 1);
  };

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && findingCounts && (
          <button
            type="button"
            onClick={handleBadgeClick}
            title={t("smartDiff.findingsBadgeTitle", { count: findings!.length })}
            aria-label={t("smartDiff.findingsBadgeTitle", { count: findings!.length })}
            style={s.findingsBadgeBtn}
          >
            {(["CRITICAL", "WARNING", "SUGGESTION"] as const)
              .filter((sev) => findingCounts[sev] > 0)
              .map((sev) => (
                <SeverityBadge key={sev} severity={sev} count={findingCounts[sev]} compact />
              ))}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findingSeverities={findings ? severitiesForLine(ln, findings) : undefined}
                registerLineRef={(lineNo, el) => {
                  lineRefs.current.set(lineNo, el);
                }}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
