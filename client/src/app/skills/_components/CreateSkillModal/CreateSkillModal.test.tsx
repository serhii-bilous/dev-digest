import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CREATED_SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Use when reviewing PR quality.",
  type: "custom",
  source: "manual",
  body: "# Rule\nDescribe the rule.",
  enabled: true,
  version: 1,
};

function renderWithIntl(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CreateSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillModal", () => {
  it("disables Create skill until name and body are filled in", () => {
    renderWithIntl();
    const createBtn = screen.getByText("Create skill").closest("button");
    expect(createBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "pr-quality-rubric" },
    });
    expect(createBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/# Rule/), {
      target: { value: "# Rule\nDescribe it." },
    });
    expect(createBtn).not.toBeDisabled();
  });

  it("creates the skill (default type 'custom', manual source) and redirects to its detail page", async () => {
    mutateAsync.mockResolvedValue(CREATED_SKILL);
    const onClose = vi.fn();
    renderWithIntl(onClose);

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "pr-quality-rubric" },
    });
    fireEvent.change(screen.getByPlaceholderText("Use when …"), {
      target: { value: "Use when reviewing PR quality." },
    });
    fireEvent.change(screen.getByPlaceholderText(/# Rule/), {
      target: { value: "# Rule\nDescribe the rule." },
    });
    fireEvent.click(screen.getByText("Create skill"));
    await Promise.resolve();

    expect(mutateAsync).toHaveBeenCalledWith({
      name: "pr-quality-rubric",
      description: "Use when reviewing PR quality.",
      type: "custom",
      body: "# Rule\nDescribe the rule.",
    });
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });
});
