import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
const refetch = vi.fn();
const mutate = vi.fn();

let skillsState: { data: Skill[] | undefined; isLoading: boolean; isError: boolean };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsState, refetch }),
  useUpdateSkill: () => ({ mutate }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../ImportFileDrawer", () => ({
  ImportFileDrawer: ({ onClose }: { onClose: () => void }) => (
    <div>
      drawer-mock
      <button onClick={onClose}>close-drawer</button>
    </div>
  ),
}));
vi.mock("../CreateSkillModal", () => ({
  CreateSkillModal: ({ onClose }: { onClose: () => void }) => (
    <div>
      create-modal-mock
      <button onClick={onClose}>close-create-modal</button>
    </div>
  ),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SKILL_A: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flags hardcoded secrets.",
  type: "security",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
};

const SKILL_B: Skill = {
  id: "sk2",
  name: "test-coverage-nudge",
  description: "Pushes for happy-path tests.",
  type: "convention",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
};

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("renders the loading skeleton while skills are loading", () => {
    skillsState = { data: undefined, isLoading: true, isError: false };
    renderWithIntl();
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
  });

  it("renders the error state and retries on demand", () => {
    skillsState = { data: undefined, isLoading: false, isError: true };
    renderWithIntl();
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the empty state and opens the import drawer from its CTA", () => {
    skillsState = { data: [], isLoading: false, isError: false };
    renderWithIntl();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Import from file"));
    expect(screen.getByText("drawer-mock")).toBeInTheDocument();
  });

  it("opens the create-from-scratch modal from the Add Skill dropdown", () => {
    skillsState = { data: [], isLoading: false, isError: false };
    renderWithIntl();
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create from scratch"));
    expect(screen.getByText("create-modal-mock")).toBeInTheDocument();
  });

  it("renders a card per skill and navigates on click", () => {
    skillsState = { data: [SKILL_A, SKILL_B], isLoading: false, isError: false };
    renderWithIntl();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("test-coverage-nudge")).toBeInTheDocument();
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });

  it("filters the list as the search input changes", () => {
    skillsState = { data: [SKILL_A, SKILL_B], isLoading: false, isError: false };
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), {
      target: { value: "coverage" },
    });
    expect(screen.getByText("test-coverage-nudge")).toBeInTheDocument();
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
  });
});
