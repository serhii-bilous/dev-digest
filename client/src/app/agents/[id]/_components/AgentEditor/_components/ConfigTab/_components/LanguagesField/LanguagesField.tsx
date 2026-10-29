"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, TextInput } from "@devdigest/ui";
import { LANGUAGE_SUGGESTIONS } from "../../constants";
import { addLanguage, draftError, type LanguageError, type LanguagesDraft } from "./helpers";
import { s } from "./styles";

interface LanguagesFieldProps {
  value: LanguagesDraft;
  onChange: (next: LanguagesDraft) => void;
}

/** "Any language" or an editable list of language names, with suggestions. */
export function LanguagesField({ value, onChange }: LanguagesFieldProps) {
  const t = useTranslations("agents");
  const [text, setText] = React.useState("");
  const [addError, setAddError] = React.useState<LanguageError>(null);

  const add = (raw: string) => {
    const r = addLanguage(value.list, raw);
    setAddError(r.error);
    if (r.error) return;
    onChange({ any: false, list: r.list });
    setText("");
  };

  const error = addError ?? draftError(value);
  const errorKey = { required: "languagesRequired", tooMany: "languagesTooMany", tooLong: "languagesTooLong" } as const;
  const suggestions = LANGUAGE_SUGGESTIONS.filter((n) => !value.list.some((l) => l.toLowerCase() === n.toLowerCase()));

  return (
    <div>
      <div style={s.radios} role="radiogroup" aria-label={t("config.languages")}>
        <label style={s.radio}>
          <input type="radio" name="agent-languages" checked={value.any} onChange={() => onChange({ ...value, any: true })} />
          {t("config.languagesAny")}
        </label>
        <label style={s.radio}>
          <input type="radio" name="agent-languages" checked={!value.any} onChange={() => onChange({ ...value, any: false })} />
          {t("config.languagesSpecific")}
        </label>
      </div>
      {!value.any && (
        <>
          <div style={s.chips}>
            {value.list.map((l) => (
              <span key={l} style={s.chip}>
                {l}
                <button
                  type="button"
                  style={s.chipBtn}
                  aria-label={t("config.languagesRemove", { language: l })}
                  onClick={() => {
                    setAddError(null);
                    onChange({ any: false, list: value.list.filter((x) => x !== l) });
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={s.chips}>
            {suggestions.map((n) => (
              <button key={n} type="button" style={s.suggestion} onClick={() => add(n)}>
                + {n}
              </button>
            ))}
          </div>
          <div
            style={s.addRow}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              }
            }}
          >
            <TextInput value={text} onChange={setText} placeholder={t("config.languagesAddPlaceholder")} />
            <Button kind="secondary" onClick={() => add(text)}>
              {t("config.languagesAdd")}
            </Button>
          </div>
        </>
      )}
      {error && (
        <div role="alert" style={s.error}>
          {t(`config.${errorKey[error]}`)}
        </div>
      )}
    </div>
  );
}
