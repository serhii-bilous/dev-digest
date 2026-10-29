/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentLanguages,
  AgentSkillLink,
  ModelInfo,
  Provider,
  RepoAgent,
  ReviewStrategy,
} from "@devdigest/shared";

export function useAgents(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
    enabled: opts.enabled ?? true,
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  languages?: AgentLanguages;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "languages"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** An agent's linked skills, ordered (Agent Editor's Skills tab). */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the agent's whole linked-skill set, in the given order. */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/**
 * Agents compatible with a repo, each with `active` / `compatible`. Key sits
 * under `["agents"]` so every existing agent invalidation refreshes it too.
 */
export function useRepoAgents(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agents", "repo", repoId],
    queryFn: () => api.get<RepoAgent[]>(`/agents?repo=${encodeURIComponent(repoId!)}`),
    enabled: !!repoId,
  });
}

/** One agent as seen from a repo; `compatible` may be false (deep link, AC-31). */
export function useRepoAgent(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agents", "repo", repoId, agentId],
    queryFn: () =>
      api.get<RepoAgent>(`/agents/${agentId}?repo=${encodeURIComponent(repoId!)}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Add / Remove an agent on one repo. Optimistic move between sections, rolled back on error. */
export function useSetRepoAgentActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, repoId, active }: { agentId: string; repoId: string; active: boolean }) =>
      api.put<RepoAgent>(`/agents/${agentId}/repos/${repoId}`, { active }),
    onMutate: async ({ agentId, repoId, active }) => {
      const key = ["agents", "repo", repoId];
      await qc.cancelQueries({ queryKey: key, exact: true });
      const previousActive = qc
        .getQueryData<RepoAgent[]>(key)
        ?.find((a) => a.id === agentId)?.active;
      qc.setQueryData<RepoAgent[]>(key, (list) =>
        list?.map((a) => (a.id === agentId ? { ...a, active } : a)),
      );
      return { previousActive, key };
    },
    // Per-agent rollback against the *current* list: a whole-list snapshot could
    // predate another in-flight toggle, or be undefined when nothing was cached.
    onError: (_e, { agentId }, ctx) => {
      if (!ctx || ctx.previousActive === undefined) return;
      qc.setQueryData<RepoAgent[]>(ctx.key, (list) =>
        list?.map((a) => (a.id === agentId ? { ...a, active: ctx.previousActive! } : a)),
      );
    },
    onSettled: (_d, _e, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["agents", "repo", repoId] });
    },
  });
}
