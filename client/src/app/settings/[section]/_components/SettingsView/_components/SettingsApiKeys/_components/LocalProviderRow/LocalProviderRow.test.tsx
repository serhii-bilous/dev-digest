import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../../../messages/en/settings.json";
import { LocalProviderRow } from "./LocalProviderRow";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api,
  ApiError: class ApiError extends Error {},
}));

afterEach(cleanup);

let status: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  status = { available: true, cli_version: "2.1.311", token_configured: true };
  api.get.mockImplementation(async (path: string) => (path.includes("local-status") ? status : {}));
});

function renderRow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
        <LocalProviderRow />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("LocalProviderRow", () => {
  it("shows the status line and a labelled write-only token field that clears after save", async () => {
    api.post.mockResolvedValue({});
    renderRow();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("CLI 2.1.311 · token configured · available"),
    );
    const field = screen.getByLabelText(/Claude Code OAuth token/i);
    expect(field).toHaveValue("");

    fireEvent.change(field, { target: { value: "sk-ant-oat-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/settings/secrets", { provider: "local", key: "sk-ant-oat-secret" }),
    );
    await waitFor(() => expect(field).toHaveValue(""));
  });

  it("shows the unavailable reason as text", async () => {
    status = { available: false, reason: "cli_missing", token_configured: false };
    renderRow();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/CLI not found · no token · unavailable: .*not installed/),
    );
  });

  it("test connection is busy and disabled while pending, keeps focus, then shows message and reason", async () => {
    let resolve!: (v: unknown) => void;
    api.post.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRow();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/available/));

    const btn = screen.getByRole("button", { name: "Test connection" });
    btn.focus();
    fireEvent.click(btn);
    const busy = await screen.findByRole("button", { name: "Testing…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(api.post).toHaveBeenCalledWith("/settings/test-connection", { provider: "local" });

    resolve({ provider: "local", ok: false, message: "Claude rejected the token", reason: "auth_failed" });
    expect(await screen.findByText(/Claude rejected the token/)).toHaveTextContent(/authentication failed/);
    const after = screen.getByRole("button", { name: "Test connection" });
    expect(after).toBeEnabled();
    expect(after).toHaveFocus();
  });
  it("AC-16/NFR-6: Test connection is a native, keyboard-operable button; success names the CLI version", async () => {
    api.post.mockResolvedValue({ provider: "local", ok: true, message: "Claude Code CLI 2.1.311 responded" });
    renderRow();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/available/));
    const btn = screen.getByRole("button", { name: "Test connection" });
    // A native <button> is in the tab order and fires on Enter/Space without extra key handlers.
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).not.toHaveAttribute("tabindex", "-1");
    btn.focus();
    fireEvent.click(btn);
    expect(await screen.findByText(/2\.1\.311 responded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toHaveFocus();
  });

  it("NFR-6: failure reason is conveyed as text and the token field has a visible label", async () => {
    api.post.mockResolvedValue({ provider: "local", ok: false, message: "Timed out", reason: "timeout" });
    renderRow();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/available/));
    expect(screen.getByText(/Claude Code OAuth token/i).tagName).toBe("LABEL");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/Timed out/)).toHaveTextContent(/\(.+\)/);
  });
});
