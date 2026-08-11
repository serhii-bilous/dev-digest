import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

vi.mock("../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flags hardcoded secrets.",
  type: "security",
  source: "manual",
  body: "# Rule\nFlag secrets.",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type chip and source badge", () => {
    renderWithIntl(<SkillCard sk={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard sk={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows a needs-vetting badge for imported_url/community sources, not for manual/extracted", () => {
    renderWithIntl(<SkillCard sk={{ ...SKILL, source: "imported_url" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    cleanup();
    renderWithIntl(<SkillCard sk={{ ...SKILL, source: "extracted" }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });
});
