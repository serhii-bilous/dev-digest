/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings,
  onFindingClick,
  registerLineRef,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings whose start_line matches this line's new-side number — rendered
   *  as clickable inline tags (Smart Diff). */
  lineFindings?: FindingRecord[];
  /** Clicking a line's finding badge — bubbles up to page-level navigation
   *  that switches to the Findings tab and scrolls/highlights that finding's
   *  card (Smart Diff). */
  onFindingClick?: (finding: FindingRecord) => void;
  /** Lets the parent FileCard scroll a specific line into view (Smart Diff's
   *  "badge click → jump to line"), keyed by this line's new-side number. */
  registerLineRef?: (lineNo: number, el: HTMLDivElement | null) => void;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const lineNo = ln.newNo ?? ln.oldNo;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      ref={(el) => {
        if (lineNo != null) registerLineRef?.(lineNo, el);
      }}
    >
      <div style={lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {lineFindings && lineFindings.length > 0 && (
          <span style={s.lineFindingTags}>
            {lineFindings.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFindingClick?.(f);
                }}
                title={t("smartDiff.lineFindingTitle", { title: f.title })}
                aria-label={t("smartDiff.lineFindingTitle", { title: f.title })}
                style={s.findingsBadgeBtn}
              >
                <SeverityBadge severity={f.severity} compact={false} />
              </button>
            ))}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
