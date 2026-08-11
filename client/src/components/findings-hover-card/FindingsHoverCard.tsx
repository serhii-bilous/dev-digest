"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, ConfidenceNum, CategoryTag, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { HOVER_OPEN_DELAY_MS } from "./constants";
import { sortBySeverity, popoverPosition } from "./helpers";
import { s } from "./styles";

/**
 * Shared read-only findings popover for the PR list column (site 2), the
 * run-header badges (site 3), and the Timeline row badges (site 4). The
 * caller owns fetching `findings`; this component owns presenting them.
 *
 * A trigger with nothing to show shouldn't be hoverable at all — the caller
 * decides that (it already knows whether there's anything to show) simply by
 * not rendering this wrapper.
 */
export function FindingsHoverCard({
  findings,
  loading,
  onOpenChange,
  children,
}: {
  findings: FindingRecord[];
  loading?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview.findings");
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDelayed = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOpen(true);
      onOpenChange?.(true);
    }, HOVER_OPEN_DELAY_MS);
  }, [onOpenChange]);

  const close = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
    setPos(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !wrapRef.current || !cardRef.current) return;
    const anchor = wrapRef.current.getBoundingClientRect();
    const card = cardRef.current.getBoundingClientRect();
    setPos(
      popoverPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        { width: card.width, height: card.height },
      ),
    );
  }, [open, findings, loading]);

  const sorted = sortBySeverity(findings);
  const summary = t("summary", { count: findings.length });

  return (
    <span
      ref={wrapRef}
      role="group"
      aria-label={summary}
      tabIndex={0}
      style={s.anchor}
      onMouseEnter={openDelayed}
      onMouseLeave={close}
      onFocus={openDelayed}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {children}
      {open && (
        <div
          ref={cardRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...s.card,
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
        >
          <div style={s.heading}>{t("popover.heading")}</div>
          {loading ? (
            <div style={s.empty}>{t("popover.loading")}</div>
          ) : sorted.length === 0 ? (
            <div style={s.empty}>{t("popover.empty")}</div>
          ) : (
            <div style={s.list}>
              {sorted.map((f) => (
                <div key={f.id} style={s.row}>
                  <div style={s.rowTop}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.rowTitle}>{f.title}</span>
                  </div>
                  <div style={s.rowMeta}>
                    <CategoryTag category={f.category as Category} />
                    <span className="mono">
                      {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div style={s.rationale}>{f.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
