import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "# Rule v2\nUpdated body.", created_at: "2026-04-30T00:00:00Z" },
  { skill_id: "sk1", version: 1, body: "# Rule v1\nOriginal body.", created_at: "2026-01-22T00:00:00Z" },
];

const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "no-then-chains",
  description: "x",
  type: "convention",
  source: "manual",
  body: "# Rule v2\nUpdated body.",
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

describe("VersionsTab (smoke)", () => {
  it("lists every version, marking the current one and offering Diff/Restore on the rest", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("Restore")).toBeInTheDocument();
  });

  it("expands a side-by-side diff against the current body", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText(/Original body\./)).toBeInTheDocument();
    expect(screen.getByText(/Updated body\./)).toBeInTheDocument();
  });

  it("restores an old version's body after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Restore"));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# Rule v1\nOriginal body." } },
      expect.anything(),
    );
    vi.restoreAllMocks();
  });
});
