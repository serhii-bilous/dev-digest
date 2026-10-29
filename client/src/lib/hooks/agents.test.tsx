import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, RepoAgent } from "@devdigest/shared";

const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../api", () => ({ api: { get: h.get, put: h.put, post: vi.fn(), del: vi.fn() } }));

import { useAgent, useAgents, useRepoAgents, useSetRepoAgentActive, useUpdateAgent } from "./agents";

const base = {
  id: "a1",
  name: "Py",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_paths: [],
  version: 1,
} as const;

describe("useUpdateAgent (AC-62)", () => {
  let current: Agent["languages"];
  beforeEach(() => {
    current = ["Python"];
    h.get.mockReset().mockImplementation(async (path: string) => {
      if (path === "/agents") return [{ ...base, languages: current }];
      if (path.startsWith("/agents?repo=")) return [{ ...base, languages: current, compatible: true, active: true }];
      if (path === "/agents/a1") return { ...base, languages: current };
      throw new Error("unexpected " + path);
    });
    h.put.mockReset().mockImplementation(async (_p: string, patch: { languages: Agent["languages"] }) => {
      current = patch.languages;
      return { ...base, languages: current, version: 2 };
    });
  });

  it("sets the single-agent cache and refreshes the list and repo-scoped list without a reload", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        agent: useAgent("a1"),
        list: useAgents(),
        repoList: useRepoAgents("r1"),
        update: useUpdateAgent(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.repoList.data?.[0]?.languages).toEqual(["Python"]));
    await waitFor(() => expect(result.current.agent.data?.languages).toEqual(["Python"]));

    await act(async () => {
      await result.current.update.mutateAsync({ id: "a1", patch: { languages: "any" } });
    });

    expect(qc.getQueryData<Agent>(["agent", "a1"])?.languages).toBe("any");
    await waitFor(() => expect(result.current.list.data?.[0]?.languages).toBe("any"));
    await waitFor(() => expect((result.current.repoList.data as RepoAgent[])[0]!.languages).toBe("any"));
    expect(result.current.agent.data?.languages).toBe("any");
  });
});

describe("useSetRepoAgentActive rollback", () => {
  const mk = (id: string, active: boolean) =>
    ({ ...base, id, name: id, languages: "any", compatible: true, active }) as unknown as RepoAgent;
  const key = ["agents", "repo", "r1"];
  const setup = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetRepoAgentActive(), { wrapper });
    return { qc, result };
  };

  it("reverts only the failed agent; a concurrent toggle keeps its optimistic value", async () => {
    const { qc, result } = setup();
    qc.setQueryData<RepoAgent[]>(key, [mk("A", false), mk("B", false)]);
    h.get.mockReset().mockImplementation(async () => qc.getQueryData(key));
    let failA!: (e: Error) => void;
    h.put.mockReset().mockImplementation((path: string) =>
      path.includes("/A/")
        ? new Promise((_r, rej) => {
            failA = rej;
          })
        : new Promise(() => {}),
    );
    act(() => {
      result.current.mutate({ agentId: "A", repoId: "r1", active: true });
    });
    await waitFor(() => expect(qc.getQueryData<RepoAgent[]>(key)![0]!.active).toBe(true));
    act(() => {
      result.current.mutate({ agentId: "B", repoId: "r1", active: true });
    });
    await waitFor(() => expect(qc.getQueryData<RepoAgent[]>(key)![1]!.active).toBe(true));
    await act(async () => {
      failA(new Error("boom"));
    });
    const list = qc.getQueryData<RepoAgent[]>(key)!;
    expect(list.find((a) => a.id === "A")!.active).toBe(false);
    expect(list.find((a) => a.id === "B")!.active).toBe(true);
  });

  it("does not write undefined into the cache when no list was cached", async () => {
    const { qc, result } = setup();
    h.get.mockReset().mockResolvedValue(undefined);
    h.put.mockReset().mockRejectedValue(new Error("boom"));
    await act(async () => {
      await result.current.mutateAsync({ agentId: "A", repoId: "r1", active: true }).catch(() => {});
    });
    expect(qc.getQueryCache().find({ queryKey: key, exact: true })).toBeUndefined();
  });
});
