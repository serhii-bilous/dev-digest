/* ImportFileDrawer — "Add a skill" drawer. Only the `file` tab is wired this
   pass (markdown-file-only import, per L02 scope); `url`/`community` tabs are
   shown but inert, matching the pre-written copy for a future lesson. A file
   is read client-side via FileReader (no server upload) — the populated
   body textarea IS the preview/confirm step before Import is clicked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, TextInput, Textarea, Icon } from "@devdigest/ui";
import { useImportSkillFile } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { deriveNameFromMarkdown } from "./helpers";
import { s } from "./styles";

const DRAWER_WIDTH = 560;

export function ImportFileDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const importFile = useImportSkillFile();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const derivedName = name.trim() || deriveNameFromMarkdown(body);

  const pickFile = () => fileInputRef.current?.click();

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setBody(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  const submit = async () => {
    try {
      const skill = await importFile.mutateAsync({
        ...(name.trim() ? { name: name.trim() } : {}),
        body,
      });
      toast.success(t("file.success", { name: skill.name }));
      onClose();
    } catch {
      toast.error(t("drawer.importFailed"));
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("drawer.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={submit} disabled={importFile.isPending || !body.trim()}>
            {importFile.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      <div style={s.tabsRow}>
        <span style={s.tab(true)}>{t("drawer.tabs.file")}</span>
        <span style={s.tab(false)}>{t("drawer.tabs.url")}</span>
        <span style={s.tab(false)}>{t("drawer.tabs.community")}</span>
      </div>
      <div style={s.body}>
        <div style={s.fileRow}>
          <Button kind="secondary" size="sm" icon="Upload" onClick={pickFile}>
            {t("drawer.tabs.file")}
          </Button>
          {fileName && <span style={s.fileName}>{fileName}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={onFileSelected}
            style={{ display: "none" }}
          />
        </div>
        <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
          <TextInput value={name} onChange={setName} placeholder={derivedName || t("file.namePlaceholder")} />
        </FormField>
        <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
          <Textarea value={body} onChange={setBody} rows={12} mono placeholder={t("file.bodyPlaceholder")} />
        </FormField>
      </div>
    </Drawer>
  );
}
