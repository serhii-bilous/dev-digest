/* VersionsTab — version history (Diff/Restore) over skill_versions, which
   already exists server-side (GET /skills/:id/versions) — this tab is pure
   UI. "Diff" shows the selected old version's body next to the CURRENT body
   side-by-side (no diff library in this codebase; a computed line-diff would
   be disproportionate for a "look at what changed" aid). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ height: 12 }} />
        <Skeleton height={200} />
      </div>
    );
  }

  const list = versions ?? [];
  const diffing = list.find((v) => v.version === diffVersion);

  const restore = (body: string, version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    update.mutate(
      { id: skill.id, patch: { body } },
      {
        onSuccess: (data) =>
          toast.success(t("versions.restored", { version, newVersion: data.version })),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <span style={s.badge}>{t("versions.count", { count: list.length })}</span>
      </div>
      <div style={s.explanation}>{t("versions.explanation")}</div>

      {list.length === 0 ? (
        <div style={s.empty}>{t("versions.empty")}</div>
      ) : (
        <div style={s.list}>
          {list.map((v) => {
            const isCurrent = v.version === skill.version;
            return (
              <React.Fragment key={v.version}>
                <div style={s.row}>
                  <span style={s.versionBadge}>{t("preview.version", { version: v.version })}</span>
                  <div style={s.rowMain}>
                    <div style={s.date}>{new Date(v.created_at).toLocaleString()}</div>
                  </div>
                  {isCurrent ? (
                    <span style={s.currentBadge}>
                      <Icon.CheckCircle size={13} />
                      {t("versions.current")}
                    </span>
                  ) : (
                    <div style={s.rowActions}>
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="Eye"
                        onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                      >
                        {t("versions.diff")}
                      </Button>
                      <Button
                        kind="secondary"
                        size="sm"
                        icon="History"
                        onClick={() => restore(v.body, v.version)}
                        disabled={update.isPending}
                      >
                        {t("versions.restore")}
                      </Button>
                    </div>
                  )}
                </div>
                {diffing && diffing.version === v.version && (
                  <div style={s.diffPanel}>
                    <div style={s.diffPane}>
                      <div style={s.diffLabel}>{t("versions.diffOld", { version: v.version })}</div>
                      <div style={s.diffBody}>{v.body}</div>
                    </div>
                    <div style={s.diffPane}>
                      <div style={s.diffLabel}>
                        {t("versions.diffCurrent", { version: skill.version })}
                      </div>
                      <div style={s.diffBody}>{skill.body}</div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
