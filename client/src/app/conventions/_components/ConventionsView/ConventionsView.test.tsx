import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const extractMutate = vi.fn();
const updateMutate = vi.fn();
const refetch = vi.fn();

let activeRepoState: { repoId: string | null; activeRepo: { full_name: string } | null; reposLoaded: boolean };
let staleRepoState = false;
let conventionsState: {
  data: { candidates: ConventionCandidate[]; scan: { sample_file_count: number; scanned_at: string | null } } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => activeRepoState,
  useRepoNotFound: () => staleRepoState,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ ...conventionsState, refetch }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false, isError: false }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo-not-found-mock</div>,
}));
vi.mock("../CreateSkillFromConventionsModal", () => ({
  CreateSkillFromConventionsModal: () => <div>create-skill-modal-mock</div>,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  staleRepoState = false;
});

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "error-handling",
  rule: "Always use async/await instead of .then() chains.",
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 24,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  accepted: true,
};

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("shows RepoNotFound when repos have loaded and none is active", () => {
    activeRepoState = { repoId: null, activeRepo: null, reposLoaded: true };
    conventionsState = { data: undefined, isLoading: false, isError: false, error: null };
    renderWithIntl();
    expect(screen.getByText("repo-not-found-mock")).toBeInTheDocument();
  });

  it("shows RepoNotFound when the stored repo id is stale (matches no known repo)", () => {
    // regression: a leftover localStorage repo id that no longer exists must
    // not fall through to the "Conventions in repo" fallback view.
    staleRepoState = true;
    activeRepoState = { repoId: "stale-id", activeRepo: null, reposLoaded: true };
    conventionsState = { data: undefined, isLoading: false, isError: false, error: null };
    renderWithIntl();
    expect(screen.getByText("repo-not-found-mock")).toBeInTheDocument();
  });

  it("shows the error state and retries on demand", () => {
    activeRepoState = { repoId: "r1", activeRepo: { full_name: "acme/payments-api" }, reposLoaded: true };
    conventionsState = { data: undefined, isLoading: false, isError: true, error: null };
    renderWithIntl();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state before any scan and runs extraction from its CTA", () => {
    activeRepoState = { repoId: "r1", activeRepo: { full_name: "acme/payments-api" }, reposLoaded: true };
    conventionsState = {
      data: { candidates: [], scan: { sample_file_count: 0, scanned_at: null } },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderWithIntl();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Run extraction"));
    expect(extractMutate).toHaveBeenCalled();
  });

  it("renders candidates, the accepted summary, and enables Create skill once scanned", () => {
    activeRepoState = { repoId: "r1", activeRepo: { full_name: "acme/payments-api" }, reposLoaded: true };
    conventionsState = {
      data: {
        candidates: [CANDIDATE],
        scan: { sample_file_count: 12, scanned_at: new Date().toISOString() },
      },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderWithIntl();
    expect(
      screen.getByText("Always use async/await instead of .then() chains."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Create skill"));
    expect(screen.getByText("create-skill-modal-mock")).toBeInTheDocument();
  });

  it("disables Create skill and shows the no-candidates note when a scan finds nothing", () => {
    activeRepoState = { repoId: "r1", activeRepo: { full_name: "acme/payments-api" }, reposLoaded: true };
    conventionsState = {
      data: { candidates: [], scan: { sample_file_count: 12, scanned_at: new Date().toISOString() } },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderWithIntl();
    expect(screen.getByText(/This scan found no candidates/)).toBeInTheDocument();
    expect(screen.getByText("Create skill").closest("button")).toBeDisabled();
  });
});
