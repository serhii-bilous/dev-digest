"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RepoAgent } from "@devdigest/shared";
import { AgentCard } from "../../../AgentCard";
import { s } from "./styles";

interface AgentSectionProps {
  heading: string;
  mode: "active" | "available";
  repoName: string;
  agents: RepoAgent[];
  /** Text shown when the section has nothing in it at all (not merely filtered out). */
  emptyText: string;
  unfilteredCount: number;
  pendingIds: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  onChange: (agent: RepoAgent, active: boolean) => void;
  onOpen: (agent: RepoAgent) => void;
  registerButton: (agentId: string, el: HTMLButtonElement | null) => void;
}

/** One of the two /agents sections; each card carries an Add or Remove button. */
export function AgentSection({
  heading,
  mode,
  repoName,
  agents,
  emptyText,
  unfilteredCount,
  pendingIds,
  errors,
  onChange,
  onOpen,
  registerButton,
}: AgentSectionProps) {
  const t = useTranslations("agents");
  const adding = mode === "available";
  return (
    <section aria-labelledby={`sec-${mode}`} style={s.section}>
      <h2 id={`sec-${mode}`} style={s.h2}>
        {heading}
      </h2>
      {unfilteredCount === 0 && <p style={s.empty}>{emptyText}</p>}
      {agents.length > 0 && (
        <div style={s.grid}>
          {agents.map((a) => {
            const pending = pendingIds.has(a.id);
            const label = t(adding ? "repoAgents.addLabel" : "repoAgents.removeLabel", {
              agent: a.name,
              repo: repoName,
            });
            return (
              <div key={a.id}>
                <AgentCard
                  ag={a}
                  onClick={() => onOpen(a)}
                  action={
                    <button
                      type="button"
                      ref={(el) => registerButton(a.id, el)}
                      aria-label={label}
                      aria-busy={pending}
                      disabled={pending}
                      style={s.button(pending)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(a, adding);
                      }}
                    >
                      {pending
                        ? t(adding ? "repoAgents.adding" : "repoAgents.removing")
                        : t(adding ? "repoAgents.add" : "repoAgents.remove")}
                    </button>
                  }
                />
                {errors[a.id] && (
                  <p role="alert" style={s.error}>
                    {errors[a.id]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
