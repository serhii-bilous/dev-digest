/* /agents — Agents list (A2, L03). AgentCards + create. Selecting an agent
   navigates to the 5-tab editor at /agents/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useAgents, useRepoAgents, useRepoStack, useSetRepoAgentActive } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import type { RepoAgent } from "@devdigest/shared";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { AgentSection } from "./_components/AgentSection";
import { StackHeader } from "./_components/StackHeader";
import { StackNotice } from "./_components/StackNotice";
import { TEMPLATES } from "./constants";
import { filterAgents } from "./helpers";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const repoName = activeRepo?.full_name ?? "";
  const allAgents = useAgents({ enabled: !repoId });
  const repoAgents = useRepoAgents(repoId);
  const stackQ = useRepoStack(repoId);
  const setActive = useSetRepoAgentActive();
  const { data: agents, isLoading, isError, refetch } = repoId ? repoAgents : allAgents;
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const headerRef = React.useRef<HTMLDivElement>(null);

  // Per-repo state must not leak across a repo switch.
  React.useEffect(() => {
    setErrors({});
  }, [repoId]);

  // After a successful move, focus the same agent's button in its new section.
  React.useEffect(() => {
    if (!focusId) return;
    const el = buttons.current.get(focusId);
    if (el) el.focus();
    setFocusId(null);
  }, [focusId, agents]);

  const registerButton = React.useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el);
    else buttons.current.delete(id);
  }, []);

  const change = async (agent: RepoAgent, active: boolean) => {
    if (!repoId) return;
    setErrors((e) => {
      const { [agent.id]: _drop, ...rest } = e;
      return rest;
    });
    setPendingIds((p) => new Set(p).add(agent.id));
    try {
      await setActive.mutateAsync({ agentId: agent.id, repoId, active });
      setFocusId(agent.id);
    } catch {
      setErrors((e) => ({ ...e, [agent.id]: t("repoAgents.changeError", { agent: agent.name, repo: repoName }) }));
    } finally {
      setPendingIds((p) => {
        const n = new Set(p);
        n.delete(agent.id);
        return n;
      });
    }
  };

  const list = filterAgents(agents ?? [], search);
  const repoList = (agents ?? []) as RepoAgent[];
  const activeAll = repoList.filter((a) => a.active);
  const availableAll = repoList.filter((a) => !a.active);
  const activeList = filterAgents(activeAll, search);
  const availableList = filterAgents(availableAll, search);
  const stack = stackQ.data;
  const open = (a: { id: string }) => router.push(`/agents/${a.id}?tab=config`);

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("list.title")}</h1>
            <p style={s.subtitle}>{t("list.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.addAgent")}
              </Button>
            }
            items={[
              { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { divider: true },
              ...TEMPLATES.map((tp) => ({
                label: tp,
                icon: "Cpu" as const,
                muted: true,
                onClick: () => setCreating(true),
              })),
            ]}
          />
        </div>

        {repoId && activeRepo && <StackHeader ref={headerRef} repoName={repoName} stack={stack} />}
        {repoId && stack && stack.status !== "known" && (
          <StackNotice repoId={repoId} stack={stack} onGone={() => headerRef.current?.focus()} />
        )}
        {!repoId && <p style={s.hint}>{t("repoAgents.noRepoHint")}</p>}

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && !repoId && list.length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {!repoId && list.length > 0 && (
          <div style={s.grid}>
            {list.map((a) => (
              <AgentCard key={a.id} ag={a} onClick={() => open(a)} />
            ))}
          </div>
        )}
        {repoId && !isLoading && !isError && (
          <>
            <AgentSection
              heading={t("repoAgents.activeHeading", { repo: repoName })}
              mode="active"
              repoName={repoName}
              agents={activeList}
              unfilteredCount={activeAll.length}
              emptyText={t("repoAgents.activeEmpty", { repo: repoName })}
              pendingIds={pendingIds}
              errors={errors}
              onChange={(a) => change(a, false)}
              onOpen={open}
              registerButton={registerButton}
            />
            <AgentSection
              heading={t("repoAgents.availableHeading")}
              mode="available"
              repoName={repoName}
              agents={availableList}
              unfilteredCount={availableAll.length}
              emptyText={t("repoAgents.availableEmpty", { repo: repoName })}
              pendingIds={pendingIds}
              errors={errors}
              onChange={(a) => change(a, true)}
              onOpen={open}
              registerButton={registerButton}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
