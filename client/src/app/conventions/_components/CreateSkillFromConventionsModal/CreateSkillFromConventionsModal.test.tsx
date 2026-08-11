import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "c1",
    category: "error-handling",
    rule: "Always use async/await instead of .then() chains.",
    evidence_path: "src/api/users.ts",
    evidence_line_start: 23,
    evidence_line_end: 31,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: true,
  },
];

const CREATED_SKILL: Skill = {
  id: "sk1",
  name: "payments-api-conventions",
  description: "1 house convention extracted from acme/payments-api",
  type: "convention",
  source: "extracted",
  body: "# payments-api-conventions",
  enabled: true,
  version: 1,
};

function renderWithIntl(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillFromConventionsModal
        candidates={CANDIDATES}
        repoName="acme/payments-api"
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillFromConventionsModal", () => {
  it("prefills name/description/body from the accepted candidates", () => {
    renderWithIntl();
    expect(screen.getByDisplayValue("payments-api-conventions")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("1 house convention extracted from acme/payments-api"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Merged from 1 accepted convention in acme\/payments-api/)).toBeInTheDocument();
  });

  it("creates the skill with source=extracted and the candidates' evidence files, then closes", async () => {
    mutateAsync.mockResolvedValue(CREATED_SKILL);
    const onClose = vi.fn();
    renderWithIntl(onClose);

    fireEvent.click(screen.getByText("Create skill"));
    await Promise.resolve();

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payments-api-conventions",
        type: "convention",
        enabled: true,
        source: "extracted",
        evidence_files: ["src/api/users.ts"],
      }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });
});
