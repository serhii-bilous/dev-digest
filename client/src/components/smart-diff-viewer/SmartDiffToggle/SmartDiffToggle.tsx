/* SmartDiffToggle — "Smart order / Original order" segmented control. Smart
   Diff is a progressive enhancement: while it's still loading (or failed to
   load), fall back to the existing flat DiffViewer rather than blocking the
   tab on it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { SmartDiffViewer } from "../SmartDiffViewer";
import { s } from "../styles";

export function SmartDiffToggle({
  smartDiff,
  isLoading,
  files,
  findings,
  commenting,
  onFindingClick,
}: {
  smartDiff: SmartDiff | undefined;
  isLoading: boolean;
  files: PrFile[];
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
  onFindingClick?: (finding: FindingRecord) => void;
}) {
  const t = useTranslations("shell");
  const [mode, setMode] = React.useState<"smart" | "original">("smart");
  const canSmart = !!smartDiff && !isLoading;

  return (
    <div>
      <div style={s.toggleRow}>
        <div role="group" aria-label={t("smartDiff.title")} style={s.segmented}>
          <button
            type="button"
            style={s.segmentBtn(mode === "smart")}
            onClick={() => setMode("smart")}
            disabled={!canSmart}
          >
            {t("smartDiff.smartOrder")}
          </button>
          <button
            type="button"
            style={s.segmentBtn(mode === "original")}
            onClick={() => setMode("original")}
          >
            {t("smartDiff.originalOrder")}
          </button>
        </div>
      </div>
      {mode === "smart" && smartDiff ? (
        <SmartDiffViewer
          smartDiff={smartDiff}
          files={files}
          findings={findings}
          commenting={commenting}
          onFindingClick={onFindingClick}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </div>
  );
}
