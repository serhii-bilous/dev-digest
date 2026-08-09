import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flags hardcoded secrets.",
  type: "security",
  source: "manual",
  body: "# Rule\nFlag secrets.",
  enabled: true,
  version: 2,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab (smoke)", () => {
  it("renders the editable fields and the token/filename chrome", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByDisplayValue("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Flags hardcoded secrets.")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate.md")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    // Nothing edited yet — no "unsaved" badge.
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("shows the untrusted-source notice only for imported_url/community", () => {
    renderWithIntl(<ConfigTab skill={{ ...SKILL, source: "community" }} />);
    expect(screen.getByText(/untrusted source/i)).toBeInTheDocument();
    cleanup();
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.queryByText(/came from an untrusted source/i)).not.toBeInTheDocument();
  });
});
