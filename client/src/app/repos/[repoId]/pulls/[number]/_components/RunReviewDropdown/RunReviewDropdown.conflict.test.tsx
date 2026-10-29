import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ repoId: "repo-py", number: "1" }),
  usePathname: () => "/repos/repo-py/pulls/1",
}));

import { Providers } from "../../../../../../../lib/providers";
import { RunReviewDropdown } from "./RunReviewDropdown";

const MSG = "Agent Style (TypeScript) is not compatible with this repository (Python)";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RunReviewDropdown single-agent 409 (AC-35)", () => {
  it("shows the API's agent_incompatible message to the user", async () => {
    const posted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        if (init?.method === "POST") {
          posted.push(url);
          return json(409, {
            error: {
              code: "agent_incompatible",
              message: MSG,
              details: { agent_languages: ["TypeScript"], repo_languages: ["Python"] },
            },
          });
        }
        if (url.includes("/agents?repo=")) {
          return json(200, [{ id: "a2", name: "Style", model: "gpt-4.1-mini", active: false, compatible: true }]);
        }
        return json(200, []);
      }),
    );
    render(
      <Providers>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <RunReviewDropdown prId="pr1" />
        </NextIntlClientProvider>
      </Providers>,
    );
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(await screen.findByText("Style"));
    expect(await screen.findByText(MSG)).toBeInTheDocument();
    expect(posted).toEqual([expect.stringContaining("/pulls/pr1/review")]);
  });
});
