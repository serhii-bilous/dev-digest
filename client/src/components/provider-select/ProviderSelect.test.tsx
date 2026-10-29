import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { LocalStatus } from "@devdigest/shared";
import messages from "../../../messages/en/agents.json";
import { ProviderSelect } from "./ProviderSelect";

let status: LocalStatus | undefined;
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: status }) }));

afterEach(cleanup);

function setup(value: "openai" | "local") {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ProviderSelect value={value} onChange={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("ProviderSelect", () => {
  it("lists Local (Claude Code) enabled when available (AC-7)", () => {
    status = { available: true, token_configured: true, cli_version: "2.1.311" };
    setup("openai");
    expect(screen.getByRole("option", { name: "Local (Claude Code)" })).toBeEnabled();
  });

  it("disables Local with the CLI-missing reason as text (AC-8)", () => {
    status = { available: false, reason: "cli_missing", token_configured: true };
    setup("openai");
    const o = screen.getByRole("option", { name: /Unavailable: Claude Code CLI not found/ });
    expect(o).toBeDisabled();
  });

  it("disables Local with the token-missing reason as text (AC-8)", () => {
    status = { available: false, reason: "token_missing", token_configured: false };
    setup("openai");
    expect(screen.getByRole("option", { name: /Unavailable: token not configured/ })).toBeDisabled();
  });

  it("keeps Local selectable when the agent is already on local", () => {
    status = { available: false, reason: "cli_missing", token_configured: true };
    setup("local");
    expect(screen.getByRole("option", { name: /Unavailable: Claude Code CLI not found/ })).toBeEnabled();
  });
});
