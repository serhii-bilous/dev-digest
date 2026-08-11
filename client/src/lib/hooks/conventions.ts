/* hooks/conventions.ts — React Query hooks for the Conventions Extractor page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";

export interface ConventionsResult {
  candidates: ConventionCandidate[];
  scan: ConventionScan;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsResult>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Runs (or re-runs) a scan. Used for both "Run extraction" and "Re-scan".
 * `pullNumber` scans that PR's head commit instead of the repo's default
 * branch; omit it (or pass `undefined`) to scan the default branch.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pullNumber?: number) =>
      api.post<ConventionsResult>(`/repos/${repoId}/conventions/extract`, {
        pull_number: pullNumber,
      }),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: { accepted?: boolean; rule?: string };
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}
