import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, AgentSkillLink } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const SKILLS: Skill[] = [
  { id: "s1", name: "no-then-chains", description: "x", type: "convention", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s2", name: "secret-leakage-gate", description: "x", type: "security", source: "manual", body: "b", enabled: true, version: 1 },
];

// Both attached, s1 first (order 0), s2 second (order 1) — lets a reorder test
// move s1 down / s2 up.
let LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s1", order: 0 },
  { agent_id: "ag1", skill_id: "s2", order: 1 },
];

const setSkillsMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkillLinks: () => ({ data: LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);
beforeEach(() => {
  setSkillsMutate.mockClear();
  LINKS = [
    { agent_id: "ag1", skill_id: "s1", order: 0 },
    { agent_id: "ag1", skill_id: "s2", order: 1 },
  ];
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (smoke)", () => {
  it("shows the enabled count and both attached skills, checked", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toHaveAttribute("aria-checked", "true");
  });

  it("filtering narrows the list by name", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "secret" } });
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.queryByText("no-then-chains")).not.toBeInTheDocument();
  });

  it("unchecking a skill calls useSetAgentSkills without it", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!); // uncheck s1 (first row, order 0)
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s2"] });
  });

  it("moving the first attached skill down reorders the linked set", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    const downButtons = screen.getAllByLabelText("Move down");
    fireEvent.click(downButtons[0]!); // move s1 (order 0) down past s2
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s2", "s1"] });
  });
});
