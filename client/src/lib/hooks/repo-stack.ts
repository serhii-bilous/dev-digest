/* hooks/repo-stack.ts — a repo's detected code languages (stack-aware agents). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { RepoStack } from "@devdigest/shared";

export function useRepoStack(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["repo-stack", repoId],
    queryFn: () => api.get<RepoStack>(`/repos/${repoId}/stack`),
    enabled: !!repoId,
  });
}

/** Retry: bypasses the server cooldown. A changed stack can change the compatible set, so refresh agents. */
export function useRetryRepoStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<RepoStack>(`/repos/${repoId}/stack/refresh`),
    onSuccess: (stack, repoId) => {
      qc.setQueryData(["repo-stack", repoId], stack);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
