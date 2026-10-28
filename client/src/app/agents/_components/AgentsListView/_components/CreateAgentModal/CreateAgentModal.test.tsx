import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";
import { CreateAgentModal } from "./CreateAgentModal";

let status: { available: boolean; reason?: string; token_configured: boolean; cli_version?: string } | undefined;
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/local", () => ({ useLocalStatus: () => ({ data: status }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync, isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("CreateAgentModal Local provider", () => {
  it("AC-7: offers Local (Claude Code) and creates an agent with provider local", async () => {
    status = { available: true, token_configured: true, cli_version: "2.1.311" };
    mutateAsync.mockResolvedValue({ id: "a1" });
    setup();
    const select = screen.getByRole("combobox", { name: "Provider" });
    expect(screen.getByRole("option", { name: "Local (Claude Code)" })).toBeEnabled();
    fireEvent.change(select, { target: { value: "local" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]![0];
    expect(body.provider).toBe("local");
    // Local only accepts Claude aliases, so the model must not stay a non-alias default.
    expect(["opus", "sonnet", "haiku"]).toContain(body.model);
  });

  it("AC-8: shows Local disabled with the reason as text while unavailable", () => {
    status = { available: false, reason: "token_missing", token_configured: false };
    setup();
    expect(screen.getByRole("option", { name: /Unavailable: token not configured/ })).toBeDisabled();
  });
});
