/* hooks/local.ts — React Query hooks for the Local (Claude subscription) provider:
   CLI availability and saving its OAuth token. The token value is write-only. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { LocalStatus, SecretSaveRequest } from "@devdigest/shared";

export function useLocalStatus() {
  return useQuery({
    queryKey: ["local-status"],
    queryFn: () => api.get<LocalStatus>("/settings/local-status"),
  });
}

/** Save the Local OAuth token. Only booleans come back via the status hooks. */
export function useSaveLocalToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => {
      const body: SecretSaveRequest = { provider: "local", key: token };
      return api.post<unknown>("/settings/secrets", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["local-status"] });
      qc.invalidateQueries({ queryKey: ["secrets-status"] });
    },
  });
}
