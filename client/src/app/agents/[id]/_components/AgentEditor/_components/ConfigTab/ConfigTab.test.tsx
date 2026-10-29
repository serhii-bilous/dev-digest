import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ConfigTab } from "./ConfigTab";

const mutate = vi.fn();
let status: { available: boolean; reason?: string; token_configured: boolean } | undefined;
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: status }) }));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false }),
  useProviderModels: () => ({ data: [] }),
}));
vi.mock("../../../../../../../lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Local Reviewer",
  description: "",
  provider: "local",
  model: "opus",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_paths: [],
  languages: "any",
  version: 1,
};

function setup(agent: Agent) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ConfigTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab Local provider", () => {
  it.each([
    ["cli_missing", /Unavailable: Claude Code CLI not found/],
    ["token_missing", /Unavailable: token not configured/],
  ])("warns naming the reason (%s) and keeps the stored model (AC-11)", (reason, re) => {
    status = { available: false, reason, token_configured: false };
    setup(AGENT);
    expect(screen.getByRole("alert")).toHaveTextContent(re);
    expect(screen.getByText("opus")).toBeInTheDocument();
  });

  it("shows no warning when Local is available", () => {
    status = { available: true, token_configured: true };
    setup(AGENT);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables Local for a non-local agent while unavailable (AC-8)", () => {
    status = { available: false, reason: "cli_missing", token_configured: false };
    setup({ ...AGENT, provider: "openai", model: "gpt-4.1" });
    expect(screen.getByRole("option", { name: /Unavailable: Claude Code CLI not found/ })).toBeDisabled();
  });

  it("resets the model to a Local alias when switching an API agent to Local", () => {
    status = { available: true, token_configured: true };
    setup({ ...AGENT, provider: "openai", model: "gpt-4.1" });
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "local" } });
    expect(screen.getByText("sonnet")).toBeInTheDocument();
    expect(screen.queryByText("gpt-4.1")).toBeNull();
  });

  it("resets the model when switching a Local agent away from Local", () => {
    status = { available: true, token_configured: true };
    setup(AGENT);
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "openai" } });
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.queryByText("opus")).toBeNull();
  });
});

describe("ConfigTab Languages field", () => {
  it("edits Any -> specific list and sends languages in the save payload (AC-12)", () => {
    status = { available: true, token_configured: true };
    setup(AGENT);
    fireEvent.click(screen.getByRole("radio", { name: "Specific languages" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one language/i);
    expect(screen.getByRole("button", { name: "Save agent" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "+ Python" }));
    const input = screen.getByPlaceholderText("Add a language…");
    fireEvent.change(input, { target: { value: "Zig" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save agent" }));
    expect(mutate.mock.calls[0]![0].patch.languages).toEqual(["Python", "Zig"]);
  });

  it("saves 'any' and rejects names over 50 chars", () => {
    status = { available: true, token_configured: true };
    setup({ ...AGENT, languages: ["Go"] });
    fireEvent.change(screen.getByPlaceholderText("Add a language…"), { target: { value: "x".repeat(51) } });
    fireEvent.click(screen.getByRole("button", { name: "Add language" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 50/i);
    fireEvent.click(screen.getByRole("radio", { name: "Any language" }));
    fireEvent.click(screen.getByRole("button", { name: "Save agent" }));
    expect(mutate.mock.calls[0]![0].patch.languages).toBe("any");
  });
});
