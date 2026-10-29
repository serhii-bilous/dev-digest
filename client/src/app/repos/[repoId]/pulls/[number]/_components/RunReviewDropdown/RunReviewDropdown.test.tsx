import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutateAsync = vi.fn().mockResolvedValue({ runs: [] });
let agents: Array<{ id: string; name: string; model: string; active: boolean }> = [];
let loading = false;
const useRepoAgents = vi.fn((_repoId: string) => ({ data: loading ? undefined : agents, isLoading: loading }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ repoId: "repo-py", number: "1" }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useRepoAgents: (repoId: string) => useRepoAgents(repoId),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

function renderMenu() {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunReviewDropdown prId="pr1" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Run Review"));
}

describe("RunReviewDropdown", () => {
  it("lists the repo's compatible agents, marks inactive ones as text, and runs one individually", async () => {
    agents = [
      { id: "a1", name: "Python Sec", model: "gpt-4.1", active: true },
      { id: "a2", name: "Style", model: "gpt-4.1-mini", active: false },
    ];
    renderMenu();
    expect(useRepoAgents).toHaveBeenCalledWith("repo-py");
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1-mini · inactive")).toBeInTheDocument();
    expect(screen.queryByText(/No agents are active/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Style"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentId: "a2" }));
  });

  it("mutes Run all with the tooltip text when no agent is active", () => {
    agents = [{ id: "a2", name: "Style", model: "gpt-4.1-mini", active: false }];
    renderMenu();
    expect(
      screen.getByText("No agents are active on this repository. Add them on the Agents page."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Run all active agents"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows a loading row, not the empty message, while agents load", () => {
    loading = true;
    renderMenu();
    loading = false;
    expect(screen.getByText("Loading agents…")).toBeInTheDocument();
    expect(screen.queryByText(/compatible with this repository/)).not.toBeInTheDocument();
  });

  it("explains that no agent fits the repo's languages when loaded and empty", () => {
    agents = [];
    renderMenu();
    expect(
      screen.getByText("No agents are compatible with this repository’s languages"),
    ).toBeInTheDocument();
    expect(screen.getByText("Open the Agents page")).toBeInTheDocument();
    expect(screen.queryByText(/No agents yet/)).not.toBeInTheDocument();
  });
});
