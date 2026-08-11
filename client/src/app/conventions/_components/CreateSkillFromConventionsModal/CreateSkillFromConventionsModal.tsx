/* CreateSkillFromConventionsModal — merges accepted convention candidates
   into one Skill's markdown body, editable before saving. Modeled directly
   on CreateAgentModal. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Toggle, Icon } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { buildSkillBodyFromConventions, estimateTokens, repoSlug, uniqueEvidenceFiles } from "./helpers";
import { s } from "./styles";

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "convention", label: "convention" },
  { value: "rubric", label: "rubric" },
  { value: "security", label: "security" },
  { value: "custom", label: "custom" },
];

export function CreateSkillFromConventionsModal({
  candidates,
  repoName,
  onClose,
}: {
  candidates: ConventionCandidate[];
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const create = useCreateSkill();
  const slug = repoSlug(repoName);

  const [name, setName] = React.useState(t("modal.defaultName", { repo: slug }));
  const [description, setDescription] = React.useState(
    t("modal.defaultDescription", { count: candidates.length, repo: repoName }),
  );
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() => buildSkillBodyFromConventions(candidates, repoName));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || `${slug}-conventions`,
      description,
      type,
      body,
      enabled,
      source: "extracted",
      evidence_files: uniqueEvidenceFiles(candidates),
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal width={MODAL_WIDTH} title={t("modal.title")} subtitle={slug} onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Sparkles size={14} />
          <span>
            {t("modal.banner", { count: candidates.length, repo: repoName })}
          </span>
        </div>

        <FormField label={t("modal.fields.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("modal.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("modal.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
        </FormField>
        <FormField label={t("modal.fields.enabled")} hint={t("modal.fields.enabledHint")}>
          <Toggle on={enabled} onChange={setEnabled} />
        </FormField>

        <div style={s.bodyHeader}>
          <span style={s.filename}>{`${name || slug}.md`}</span>
          <span style={s.tokenCount}>{t("modal.tokenCount", { count: estimateTokens(body) })}</span>
        </div>
        <FormField label={t("modal.fields.body")}>
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </FormField>
      </div>
    </Modal>
  );
}
