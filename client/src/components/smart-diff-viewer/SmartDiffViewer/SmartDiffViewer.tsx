/* SmartDiffViewer — the "Smart order" diff: files grouped core -> wiring ->
   boilerplate (fixed order, never re-sorted by response order), each group
   rendered as a SmartDiffGroupSection. */
"use client";

import React from "react";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import type { DiffCommentApi } from "@/components/diff-viewer";
import { SmartDiffGroupSection } from "../SmartDiffGroupSection";
import { indexFilesByPath } from "../helpers";
import { ROLE_ORDER } from "../constants";
import { s } from "../styles";

export function SmartDiffViewer({
  smartDiff,
  files,
  findings,
  commenting,
}: {
  smartDiff: SmartDiff;
  files: PrFile[];
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
}) {
  const filesByPath = React.useMemo(() => indexFilesByPath(files), [files]);
  const groupsByRole = React.useMemo(
    () => new Map(smartDiff.groups.map((g) => [g.role, g])),
    [smartDiff],
  );

  return (
    <div style={s.root}>
      {ROLE_ORDER.map((role) => {
        const group = groupsByRole.get(role);
        if (!group) return null;
        return (
          <SmartDiffGroupSection
            key={role}
            group={group}
            filesByPath={filesByPath}
            findings={findings}
            commenting={commenting}
          />
        );
      })}
    </div>
  );
}
