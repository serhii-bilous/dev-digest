/* EvalCaseModal — create/edit an eval case. Mirrors CreateAgentModal's
   pattern (Modal + FormField/TextInput/Textarea), not a new inline-form
   convention. Expected findings are a small repeatable severity+category
   row list — leave empty to expect a clean pass. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Icon } from "@devdigest/ui";
import type { EvalCaseWithLatestRun, EvalOwnerKind, FindingCategory, Severity } from "@devdigest/shared";
import { useCreateEvalCase, useUpdateEvalCase } from "@/lib/hooks/evals";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

interface ExpectedRow {
  severity: Severity;
  category: FindingCategory;
}

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const CATEGORIES: FindingCategory[] = ["bug", "security", "perf", "style", "test"];

function parseExpected(value: unknown): ExpectedRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ExpectedRow => v && typeof v === "object" && "severity" in v && "category" in v,
  );
}

const MODAL_WIDTH = 560;

export function EvalCaseModal({
  ownerKind,
  ownerId,
  existing,
  onClose,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  existing?: EvalCaseWithLatestRun;
  onClose: () => void;
}) {
  const t = useTranslations("evalCases");
  const toast = useToast();
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const [name, setName] = React.useState(existing?.name ?? "");
  const [inputDiff, setInputDiff] = React.useState(existing?.input_diff ?? "");
  const [expected, setExpected] = React.useState<ExpectedRow[]>(
    parseExpected(existing?.expected_output),
  );

  const severityOptions = SEVERITIES.map((v) => ({ value: v, label: t(`severity.${v}`) }));
  const categoryOptions = CATEGORIES.map((v) => ({ value: v, label: t(`category.${v}`) }));

  const addExpected = () =>
    setExpected((rows) => [...rows, { severity: "WARNING", category: "bug" }]);
  const removeExpected = (i: number) =>
    setExpected((rows) => rows.filter((_, idx) => idx !== i));
  const updateExpected = (i: number, patch: Partial<ExpectedRow>) =>
    setExpected((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const saving = create.isPending || update.isPending;

  const submit = async () => {
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          patch: { name, input_diff: inputDiff, expected_output: expected },
        });
      } else {
        await create.mutateAsync({
          owner_kind: ownerKind,
          owner_id: ownerId,
          name,
          input_diff: inputDiff,
          expected_output: expected,
        });
      }
      onClose();
    } catch {
      toast.error(t("runFailed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={existing ? t("modal.editTitle") : t("modal.createTitle")}
      subtitle={t("modal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? t("modal.saving") : existing ? t("modal.save") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("modal.nameLabel")} required>
          <TextInput value={name} onChange={setName} placeholder={t("modal.namePlaceholder")} />
        </FormField>
        <FormField label={t("modal.diffLabel")} hint={t("modal.diffHint")}>
          <Textarea
            value={inputDiff}
            onChange={setInputDiff}
            rows={8}
            mono
            placeholder={t("modal.diffPlaceholder")}
          />
        </FormField>
        <FormField label={t("modal.expectedLabel")} hint={t("modal.expectedHint")}>
          <div style={s.expectedList}>
            {expected.map((row, i) => (
              <div key={i} style={s.expectedRow}>
                <SelectInput
                  value={row.severity}
                  onChange={(v) => updateExpected(i, { severity: v as Severity })}
                  options={severityOptions}
                />
                <SelectInput
                  value={row.category}
                  onChange={(v) => updateExpected(i, { category: v as FindingCategory })}
                  options={categoryOptions}
                />
                <button
                  style={s.removeBtn}
                  onClick={() => removeExpected(i)}
                  aria-label={t("modal.removeExpected")}
                >
                  <Icon.Trash size={14} />
                </button>
              </div>
            ))}
            <button style={s.addBtn} onClick={addExpected}>
              {t("modal.addExpected")}
            </button>
          </div>
        </FormField>
      </div>
    </Modal>
  );
}
