import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepoAgent, RepoStack } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentsListView } from "./AgentsListView";

const h = vi.hoisted(() => ({
  repo: { id: "r1", full_name: "acme/py-api" } as { id: string; full_name: string } | null,
  repoAgents: [] as RepoAgent[],
  allAgents: [] as RepoAgent[],
  stack: undefined as RepoStack | undefined,
  setActive: vi.fn(),
  retry: vi.fn(),
  retryPending: false,
  useAgents: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: h.repo, repoId: h.repo?.id ?? null }),
}));
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: undefined }) }));
vi.mock("@/lib/hooks", () => ({
  useAgents: (o?: { enabled?: boolean }) => (h.useAgents(o), { data: h.allAgents, isLoading: false, isError: false, refetch: vi.fn() }),
  useRepoAgents: () => ({ data: h.repo ? h.repoAgents : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useRepoStack: () => ({ data: h.stack }),
  useSetRepoAgentActive: () => ({ mutateAsync: h.setActive }),
  useRetryRepoStack: () => ({ mutate: h.retry, isPending: h.retryPending }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/CreateAgentModal", () => ({ CreateAgentModal: () => null }));

function agent(id: string, name: string, over: Partial<RepoAgent> = {}): RepoAgent {
  return {
    id,
    name,
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "p",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    context_paths: [],
    languages: "any",
    version: 1,
    compatible: true,
    active: false,
    ...over,
  } as RepoAgent;
}

const KNOWN: RepoStack = {
  status: "known",
  languages: [
    { name: "Python", bytes: 90, percent: 90 },
    { name: "TypeScript", bytes: 10, percent: 10 },
  ],
  fetched_at: "2026-10-27T10:00:00Z",
};

function setup() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <AgentsListView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.repo = { id: "r1", full_name: "acme/py-api" };
  h.repoAgents = [agent("a1", "Sec", { active: true }), agent("a2", "Perf")];
  h.allAgents = h.repoAgents;
  h.stack = KNOWN;
  h.setActive.mockReset().mockResolvedValue({});
  h.retry.mockReset();
  h.retryPending = false;
  h.useAgents.mockReset();
});
afterEach(cleanup);

describe("AgentsListView with a repo", () => {
  it("does not fetch the workspace list when a repo is active", () => {
    setup();
    expect(h.useAgents).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("AC-22/23: shows the header and two sections with Add/Remove buttons, no switch", () => {
    setup();
    expect(screen.getByText("acme/py-api")).toBeInTheDocument();
    expect(screen.getByText("Python 90% · TypeScript 10%")).toBeInTheDocument();
    expect(
      screen.getByText(`Updated ${new Date("2026-10-27T10:00:00Z").toLocaleString()}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active on acme/py-api" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Available to add" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Sec from acme/py-api" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Perf to acme/py-api" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("header caps at 5 languages and shows +N more", () => {
    h.stack = {
      status: "known",
      languages: ["A", "B", "C", "D", "E", "F", "G"].map((name, i) => ({ name, bytes: 1, percent: 20 - i })),
    };
    setup();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByText(/F \d+%/)).toBeNull();
  });

  it("AC-25a: empty active section shows the empty state", () => {
    h.repoAgents = [agent("a2", "Perf")];
    setup();
    expect(screen.getByText(/No agents are active on acme\/py-api yet/)).toBeInTheDocument();
  });

  it("AC-25/26: Add calls the mutation, disables while pending and moves focus on success", async () => {
    let resolve!: () => void;
    h.setActive.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add Perf to acme/py-api" }));
    expect(h.setActive).toHaveBeenCalledWith({ agentId: "a2", repoId: "r1", active: true });
    const busy = screen.getByRole("button", { name: "Add Perf to acme/py-api" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    h.repoAgents = [agent("a1", "Sec", { active: true }), agent("a2", "Perf", { active: true })];
    resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Perf from acme/py-api" })).toHaveFocus());
  });

  it("AC-27: a failing mutation shows an inline error and keeps the section", async () => {
    h.setActive.mockRejectedValue(new Error("boom"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add Perf to acme/py-api" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t update Perf on acme/py-api");
    const available = screen.getByRole("region", { name: "Available to add" });
    expect(within(available).getByRole("button", { name: "Add Perf to acme/py-api" })).toBeEnabled();
  });

  it("search filters both sections", async () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "perf" } });
    expect(screen.queryByText("Sec")).toBeNull();
    expect(screen.getByText("Perf")).toBeInTheDocument();
  });

  it("a 120-character name keeps the language badge text whole", () => {
    h.repoAgents = [agent("a1", "N".repeat(120), { languages: ["TypeScript", "JavaScript"] })];
    setup();
    expect(screen.getByRole("img", { name: "TypeScript · JavaScript" })).toHaveTextContent(
      "TypeScript · JavaScript",
    );
  });

  it("a Python repo lists only the agents the server returned (no TS-tagged)", () => {
    h.repoAgents = [agent("a1", "Py", { languages: ["Python"] }), agent("a3", "Any")];
    h.allAgents = [...h.repoAgents, agent("a9", "TsOnly", { languages: ["TypeScript"] })];
    setup();
    expect(screen.queryByText("TsOnly")).toBeNull();
  });

  it("changing the repo changes both sections", () => {
    const { unmount } = setup();
    expect(screen.getByRole("heading", { name: "Active on acme/py-api" })).toBeInTheDocument();
    unmount();
    h.repo = { id: "r2", full_name: "acme/ts-web" };
    h.repoAgents = [agent("b1", "Other", { active: true })];
    setup();
    expect(screen.getByRole("heading", { name: "Active on acme/ts-web" })).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.queryByText("Perf")).toBeNull();
  });
});

describe("StackNotice", () => {
  it("shows no notice when the stack is known", () => {
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("AC-58/59: unknown stack shows a status notice with reason and Retry; grid still renders", async () => {
    h.stack = { status: "unknown", reason: "no_token", languages: [] };
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Stack unknown: no GitHub token is configured");
    expect(screen.getByRole("button", { name: "Add Perf to acme/py-api" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.retry).toHaveBeenCalledWith("r1");
  });

  it("stale stack shows the stale notice; Retry is disabled and busy while pending", () => {
    h.stack = { ...KNOWN, status: "stale", reason: "unreachable" };
    h.retryPending = true;
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Stack may be outdated: GitHub could not be reached");
    const btn = screen.getByRole("button", { name: "Retrying…" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("AgentsListView without a repo", () => {
  it("lists all agents with no buttons and the import hint", () => {
    h.repo = null;
    h.allAgents = [agent("a1", "Sec"), agent("a2", "Perf")];
    setup();
    expect(screen.getByText("Import a repository to add agents to it.")).toBeInTheDocument();
    expect(screen.getByText("Sec")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Add|Remove) .+ (to|from) / })).toBeNull();
  });
});
