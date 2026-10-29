import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { AgentHeader } from "./AgentHeader";

afterEach(cleanup);

const AGENT = {
  id: "ag1",
  name: "Py Reviewer",
  provider: "openai",
  model: "gpt-4.1",
  languages: ["Python"],
} as unknown as Agent;

function setup(agent: Agent, incompatibleRepo: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentHeader agent={agent} incompatibleRepo={incompatibleRepo} onRun={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("AgentHeader", () => {
  it("shows the language badge and the text note only when incompatible (AC-31, NFR-9)", () => {
    setup(AGENT, "acme/web");
    expect(screen.getByRole("img", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Not compatible with acme/web");
    cleanup();
    setup({ ...AGENT, languages: "any" }, null);
    expect(screen.getByRole("img", { name: "Any language" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
