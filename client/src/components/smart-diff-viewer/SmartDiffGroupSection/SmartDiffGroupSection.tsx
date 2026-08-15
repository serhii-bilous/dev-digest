/* SmartDiffGroupSection — one role group (core / wiring / boilerplate): a
   header naming the role + its file count, and the group's FileCards. Each
   FileCard keeps its own open/closed state (boilerplate forced closed via
   FileCard's `role` prop) — this section itself is not separately collapsible. */
"use client";

import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile, SmartDiffGroup } from "@devdigest/shared";
import { FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import { findingsForFile } from "../helpers";
import { s, ROLE_DOT_COLOR } from "../styles";

export function SmartDiffGroupSection({
  group,
  filesByPath,
  findings,
  commenting,
}: {
  group: SmartDiffGroup;
  filesByPath: Map<string, PrFile>;
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  if (group.files.length === 0) return null;

  return (
    <div style={s.group}>
      <div style={s.groupHeader}>
        <span style={s.groupDot(ROLE_DOT_COLOR[group.role] ?? "var(--text-muted)")} />
        <span style={s.groupLabel}>{t(`smartDiff.group.${group.role}.label`)}</span>
        <span style={s.groupDescription}>{t(`smartDiff.group.${group.role}.description`)}</span>
        <span style={s.groupCount}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
      </div>
      <div style={s.groupFiles}>
        {group.files.map((sdFile) => {
          const file = filesByPath.get(sdFile.path);
          if (!file) return null;
          return (
            <FileCard
              key={sdFile.path}
              file={file}
              commenting={commenting}
              role={group.role}
              findings={findingsForFile(sdFile.path, findings)}
            />
          );
        })}
      </div>
    </div>
  );
}
