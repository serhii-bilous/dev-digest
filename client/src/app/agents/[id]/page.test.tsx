import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../messages/en/agents.json";

const h = vi.hoisted(() => ({
  repo: { id: "r1", full_name: "acme/ts-web" } as { id: string; full_name: string } | null,
  compatible: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: h.repo, repoId: h.repo?.id ?? null }),
}));
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: undefined }) }));
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AGENT: Agent = {
  id: "ag1",
  name: "Python Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_paths: [],
  languages: ["Python"],
  version: 1,
};

vi.mock("../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [AGENT] }),
  useAgent: () => ({ data: AGENT, isLoading: false, isError: false }),
  useRepoAgent: (_a: string, repoId: string | null) => ({
    data: repoId ? { ...AGENT, compatible: h.compatible, active: false } : undefined,
  }),
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useProviderModels: () => ({ data: [] }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AgentEditorPage from "./page";
import { ToastProvider } from "../../../lib/toast";

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <AgentEditorPage />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("agent editor page deep link", () => {
  it("AC-31: incompatible agent with an active repo opens the editor plus a 'Not compatible' note", () => {
    h.repo = { id: "r1", full_name: "acme/ts-web" };
    h.compatible = false;
    setup();
    expect(screen.getByRole("button", { name: "Save agent" })).toBeInTheDocument();
    expect(screen.getByText("Not compatible with acme/ts-web")).toBeInTheDocument();
  });

  it("AC-31: no note when the agent is compatible or no repo is active", () => {
    h.compatible = true;
    setup();
    expect(screen.getByRole("button", { name: "Save agent" })).toBeInTheDocument();
    expect(screen.queryByText(/Not compatible with/)).toBeNull();
    cleanup();
    h.repo = null;
    h.compatible = false;
    setup();
    expect(screen.queryByText(/Not compatible with/)).toBeNull();
  });
});
