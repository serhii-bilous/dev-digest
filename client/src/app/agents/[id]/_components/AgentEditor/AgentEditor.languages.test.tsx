import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../../../../../lib/api", () => ({
  api: { get: h.get, put: h.put, post: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: undefined }) }));

import { AgentEditor } from "./AgentEditor";
import { AgentHeader } from "../AgentHeader";
import { AgentCard } from "../../../_components/AgentCard";
import { useAgent, useAgents } from "../../../../../lib/hooks/agents";

const BASE: Agent = {
  id: "ag1",
  name: "Reviewer",
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

function Page() {
  const { data: agent } = useAgent("ag1");
  const { data: agents } = useAgents();
  if (!agent) return null;
  return (
    <>
      <AgentHeader agent={agent} incompatibleRepo={null} onRun={() => {}} />
      <AgentEditor agent={agent} tab="config" onTab={() => {}} />
      {(agents ?? []).map((a) => (
        <div key={a.id} data-testid="card">
          <AgentCard ag={a} />
        </div>
      ))}
    </>
  );
}

let stored: Agent;
beforeEach(() => {
  stored = BASE;
  h.get.mockReset().mockImplementation(async (p: string) => {
    if (p === "/agents") return [stored];
    if (p === "/agents/ag1") return stored;
    return [];
  });
  h.put.mockReset().mockImplementation(async (_p: string, patch: Partial<Agent>) => {
    stored = { ...stored, ...patch, version: 2 };
    return stored;
  });
});
afterEach(cleanup);

describe("AC-62: saving languages updates header badge and card in place", () => {
  it("[Python] -> any, save: both badges read 'Any language'", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <ToastProvider>
            <Page />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Python" })).toHaveLength(2));

    fireEvent.click(screen.getByRole("radio", { name: "Any language" }));
    fireEvent.click(screen.getByRole("button", { name: "Save agent" }));

    await waitFor(() => expect(screen.getAllByRole("img", { name: "Any language" })).toHaveLength(2));
    expect(screen.queryByRole("img", { name: "Python" })).toBeNull();
    expect(h.put).toHaveBeenCalledWith("/agents/ag1", expect.objectContaining({ languages: "any" }));
  });
});
