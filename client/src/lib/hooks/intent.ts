/* hooks/intent.ts — React Query hooks for a PR's Intent Layer (summary,
   in-scope / out-of-scope). Computation is a small synchronous LLM call, not
   a background run: no runId, no SSE — the POST response already IS the new
   state, so its success handler just seeds the GET's cache directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

/** Stored intent for a PR, or `null` if it was never computed. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Compute (or recompute) a PR's intent — synchronous, no polling needed. */
export function useComputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`),
    onSuccess: (data) => qc.setQueryData(["pr-intent", prId], data),
    // No local onError: providers.tsx's global MutationCache already toasts
    // every mutation failure — a second handler here would double-toast.
  });
}
