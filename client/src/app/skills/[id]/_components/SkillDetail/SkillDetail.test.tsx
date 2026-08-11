import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the shell renders without a network/query client.
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
}));

import { SkillDetail } from "./SkillDetail";

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

describe("SkillDetail (smoke)", () => {
  it("renders the tab bar and the Config tab by default", () => {
    renderWithIntl(<SkillDetail skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByDisplayValue("secret-leakage-gate")).toBeInTheDocument();
  });

  it("renders the Preview tab's rendered body instead of the edit form", () => {
    renderWithIntl(<SkillDetail skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("secret-leakage-gate")).not.toBeInTheDocument();
  });
});
