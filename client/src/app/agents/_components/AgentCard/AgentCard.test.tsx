import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

let localStatus: { available: boolean; reason?: string; token_configured: boolean } | undefined;
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: localStatus }) }));

afterEach(() => {
  cleanup();
  localStatus = undefined;
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_paths: [],
  languages: "any",
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("AgentCard Local badge (AC-12)", () => {
  it.each([
    ["cli_missing", "Local unavailable: CLI not found"],
    ["token_missing", "Local unavailable: token not configured"],
  ])("shows a text badge naming the reason when %s", (reason, text) => {
    localStatus = { available: false, reason, token_configured: false };
    renderWithIntl(<AgentCard ag={{ ...AGENT, provider: "local", model: "opus" }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows no badge when Local is available or the agent is not local", () => {
    localStatus = { available: true, token_configured: true };
    renderWithIntl(<AgentCard ag={{ ...AGENT, provider: "local", model: "opus" }} />);
    expect(screen.queryByText(/Local unavailable/)).toBeNull();
    cleanup();
    localStatus = { available: false, reason: "cli_missing", token_configured: false };
    renderWithIntl(<AgentCard ag={AGENT} />);
    expect(screen.queryByText(/Local unavailable/)).toBeNull();
  });
});

describe("AgentCard language badge (AC-58..60, AC-63)", () => {
  it("shows the declaration in order, 'Any language', and caps at 3 with +N", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, languages: ["TypeScript", "JavaScript"] }} />);
    expect(screen.getByRole("img", { name: "TypeScript · JavaScript" })).toHaveTextContent("TypeScript · JavaScript");
    cleanup();
    renderWithIntl(<AgentCard ag={{ ...AGENT, languages: "any" }} />);
    expect(screen.getByRole("img", { name: "Any language" })).toHaveTextContent("Any language");
    cleanup();
    renderWithIntl(<AgentCard ag={{ ...AGENT, languages: ["A", "B", "C", "D", "E"] }} />);
    const badge = screen.getByRole("img", { name: "A · B · C · D · E" });
    expect(badge).toHaveTextContent("A · B · C +2");
  });

  it("AC-60: with a 120-char name only the name is truncated, the badge is not", () => {
    const name = "N".repeat(120);
    renderWithIntl(<AgentCard ag={{ ...AGENT, name, languages: ["TypeScript", "JavaScript"] }} />, );
    const nameEl = screen.getByText(name);
    const badge = screen.getByRole("img", { name: "TypeScript · JavaScript" });
    expect(badge).toHaveTextContent("TypeScript · JavaScript");
    expect(nameEl.style.textOverflow).toBe("ellipsis");
    expect(nameEl).not.toContainElement(badge);
    expect(badge.style.textOverflow).not.toBe("ellipsis");
    expect(badge.style.overflow).not.toBe("hidden");
  });
});
