/* ConfigTab — name/description/type/body editor + save. Extracted from the
   old single-pane SkillDetail (now a tab-shell); gained a filename header,
   an "unsaved" dirty-check badge, and a rough token-count estimate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { VETTING_REQUIRED_SOURCES } from "../../../_components/SkillCard/constants";
import { s } from "./styles";

const TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];

/** Rough token estimate (chars/4) — not exact, just a ballpark for the editor
 *  chrome; no client-side tokenizer is wired up. */
function estimateTokens(body: string): number {
  return Math.ceil(body.length / 4);
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const needsVetting = VETTING_REQUIRED_SOURCES.has(skill.source);
  const isDirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("preview.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {enabled ? t("preview.enabled") : t("preview.disabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      {needsVetting && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}

      <FormField label={t("file.nameLabel")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("detail.fields.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("detail.fields.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <div style={s.bodyHeader}>
        <span style={s.filename}>{skill.name}.md</span>
        {isDirty && <span style={s.unsavedBadge}>{t("config.unsavedBadge")}</span>}
        <span style={s.tokenCount}>{t("config.tokenCount", { count: estimateTokens(body) })}</span>
      </div>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={14} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("preview.saving") : t("preview.save")}
        </Button>
        {update.isSuccess && update.data && (
          <span style={s.savedNote}>{t("preview.savedToast", { version: update.data.version })}</span>
        )}
      </div>
    </div>
  );
}
