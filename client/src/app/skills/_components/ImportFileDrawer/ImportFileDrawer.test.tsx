import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const mutateAsync = vi.fn().mockResolvedValue({ id: "sk1", name: "Imported rule", version: 1 });
vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkillFile: () => ({ mutateAsync, isPending: false }),
}));

import { ImportFileDrawer } from "./ImportFileDrawer";

afterEach(cleanup);
beforeEach(() => mutateAsync.mockClear());

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportFileDrawer (smoke)", () => {
  it("reads a selected .md file into the body textarea via FileReader", async () => {
    renderWithIntl(<ImportFileDrawer onClose={() => {}} />);
    const file = new File(["# Imported rule\nBody text."], "rule.md", { type: "text/markdown" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const textarea = screen.getByPlaceholderText(/Describe the rule/) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("# Imported rule\nBody text."));
    expect(screen.getByText("rule.md")).toBeInTheDocument();
  });

  it("submits the read body via useImportSkillFile", async () => {
    renderWithIntl(<ImportFileDrawer onClose={() => {}} />);
    const file = new File(["# Imported rule\nBody text."], "rule.md", { type: "text/markdown" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    const textarea = screen.getByPlaceholderText(/Describe the rule/) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("# Imported rule\nBody text."));

    fireEvent.click(screen.getByText("Import skill"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ body: "# Imported rule\nBody text." });
    });
  });

  it("disables the import button until a body is present", () => {
    renderWithIntl(<ImportFileDrawer onClose={() => {}} />);
    expect(screen.getByText("Import skill").closest("button")).toBeDisabled();
  });
});
