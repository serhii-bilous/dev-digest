/* hooks/stats.ts — React Query hook for the Agent Editor's Stats tab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentStats } from "@devdigest/shared";

export function useAgentStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", agentId],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats`),
    enabled: !!agentId,
  });
}
