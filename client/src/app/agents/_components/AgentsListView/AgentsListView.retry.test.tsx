import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../messages/en/agents.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/py-api" }, repoId: "r1" }),
}));
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: undefined }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/CreateAgentModal", () => ({ CreateAgentModal: () => null }));

import { AgentsListView } from "./AgentsListView";

const mk = (id: string, name: string, languages: unknown) => ({
  id, name, description: "", provider: "openai", model: "gpt-4.1", system_prompt: "p",
  output_schema: null, strategy: "single-pass", ci_fail_on: "critical", repo_intel: true,
  context_paths: [], languages, version: 1, compatible: true, active: false,
});

let stackKnown = false;
let refreshCalls = 0;
let release!: () => void;
let refreshFails = false;

beforeEach(() => {
  stackKnown = false;
  refreshCalls = 0;
  refreshFails = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown) =>
        new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/repos/r1/stack/refresh") && init?.method === "POST") {
        refreshCalls++;
        await new Promise<void>((r) => (release = r));
        if (refreshFails) {
          return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 502, headers: { "content-type": "application/json" } });
        }
        stackKnown = true;
        return json({ status: "known", languages: [{ name: "<img src=x>", bytes: 1, percent: 100 }], fetched_at: "2026-10-27T10:00:00Z" });
      }
      if (url.endsWith("/repos/r1/stack")) {
        return json({ status: "unknown", reason: "no_token", languages: [] });
      }
      if (url.includes("/agents?repo=r1")) {
        // Once the stack is known, the compatible set changes.
        return json(stackKnown ? [mk("a1", "Sec", "any"), mk("a2", "Zig Linter", ["<img src=x>"])] : [mk("a1", "Sec", "any")]);
      }
      if (url.endsWith("/agents")) return json([]);
      return json([]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AgentsListView stack Retry (AC-29, AC-30, AC-45, NFR-8)", () => {
  it("Retry: one refresh call, busy while pending, then notice disappears and the new compatible agents appear", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <AgentsListView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Stack unknown: no GitHub token is configured");
    expect(await screen.findByText("Sec")).toBeInTheDocument();
    expect(screen.queryByText("Zig Linter")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const busy = await screen.findByRole("button", { name: "Retrying…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    release();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    // NFR-9: the notice is gone, so focus moves to the stack header.
    await waitFor(() => expect(screen.getByLabelText("acme/py-api")).toHaveFocus());
    expect(await screen.findByText("Zig Linter")).toBeInTheDocument();
    expect(refreshCalls).toBe(1);
    // NFR-8: GitHub-provided names render as literal text, never HTML.
    expect(screen.getAllByText(/<img src=x>/).length).toBeGreaterThan(0);
    expect(document.querySelector("img")).toBeNull();
  });

  it("NFR-9: after a failed Retry the notice stays and focus stays on the Retry button", async () => {
    refreshFails = true;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <AgentsListView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("status");
    const retry = screen.getByRole("button", { name: "Retry" });
    retry.focus();
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "Retrying…" });
    release();
    const again = await screen.findByRole("button", { name: "Retry" });
    await waitFor(() => expect(again).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Stack unknown");
  });
});
