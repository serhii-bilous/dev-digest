/* hooks/evals.ts — React Query hooks for the Agent Editor's Evals tab. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCase,
  EvalCaseInput,
  EvalCaseWithLatestRun,
  EvalOwnerKind,
  EvalRunResult,
} from "@devdigest/shared";

function invalidateEvals(qc: QueryClient, ownerKind: EvalOwnerKind, ownerId: string) {
  qc.invalidateQueries({ queryKey: ["evals", ownerKind, ownerId] });
  qc.invalidateQueries({ queryKey: ["evals-summary", ownerKind, ownerId] });
}

export function useEvals(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["evals", ownerKind, ownerId],
    queryFn: () =>
      api.get<EvalCaseWithLatestRun[]>(`/evals?owner_kind=${ownerKind}&owner_id=${ownerId}`),
    enabled: !!ownerId,
  });
}

export function useEvalsSummary(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["evals-summary", ownerKind, ownerId],
    queryFn: () =>
      api.get<{ total: number; passing: number }>(
        `/evals/summary?owner_kind=${ownerKind}&owner_id=${ownerId}`,
      ),
    enabled: !!ownerId,
  });
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>("/evals", input),
    onSuccess: (data) => invalidateEvals(qc, data.owner_kind, data.owner_id),
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<EvalCaseInput>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) => api.put<EvalCase>(`/evals/${id}`, patch),
    onSuccess: (data) => invalidateEvals(qc, data.owner_kind, data.owner_id),
  });
}

export interface EvalCaseOwnerRef {
  id: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseOwnerRef) => api.del<{ ok: boolean }>(`/evals/${input.id}`),
    onSuccess: (_d, input) => invalidateEvals(qc, input.ownerKind, input.ownerId),
  });
}

export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseOwnerRef) => api.post<EvalRunResult>(`/evals/${input.id}/run`),
    onSuccess: (_d, input) => invalidateEvals(qc, input.ownerKind, input.ownerId),
  });
}

export function useRunAllEvalCases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerKind, ownerId }: { ownerKind: EvalOwnerKind; ownerId: string }) =>
      api.post<EvalRunResult[]>(`/evals/run-all?owner_kind=${ownerKind}&owner_id=${ownerId}`),
    onSuccess: (_d, input) => invalidateEvals(qc, input.ownerKind, input.ownerId),
  });
}
