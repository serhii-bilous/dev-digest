import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const push = vi.fn();
const setRepoId = vi.fn();
let pathname = "/agents";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", repos: [], activeRepo: null, setRepoId }),
}));
vi.mock("../../../lib/hooks", () => ({
  usePulls: () => ({ data: [] }),
  useDeleteRepo: () => ({ mutate: vi.fn() }),
}));

import { useShellContext } from "./useShellContext";

describe("useShellContext onSelectRepo", () => {
  beforeEach(() => {
    push.mockClear();
    setRepoId.mockClear();
  });

  it("only switches the active repo on /agents and /agents/:id", () => {
    for (const p of ["/agents", "/agents/a1"]) {
      pathname = p;
      const { result } = renderHook(() => useShellContext({ onOpenCommandPalette: vi.fn() }));
      result.current.onSelectRepo?.("r2");
    }
    expect(setRepoId).toHaveBeenCalledTimes(2);
    expect(setRepoId).toHaveBeenCalledWith("r2");
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to the repo's PRs elsewhere", () => {
    pathname = "/repos/r1/pulls";
    const { result } = renderHook(() => useShellContext({ onOpenCommandPalette: vi.fn() }));
    result.current.onSelectRepo?.("r2");
    expect(setRepoId).toHaveBeenCalledWith("r2");
    expect(push).toHaveBeenCalledWith("/repos/r2/pulls");
  });
});
