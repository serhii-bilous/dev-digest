import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agents.json";
import { LanguageBadge } from "./LanguageBadge";

afterEach(cleanup);

function renderBadge(languages: "any" | string[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <LanguageBadge languages={languages} />
    </NextIntlClientProvider>,
  );
}

describe("LanguageBadge", () => {
  it("joins declared languages in order", () => {
    renderBadge(["TypeScript", "JavaScript"]);
    expect(screen.getByText("TypeScript · JavaScript")).toBeInTheDocument();
  });

  it("shows 'Any language' for any", () => {
    renderBadge("any");
    expect(screen.getByText("Any language")).toBeInTheDocument();
  });

  it("truncates past 3 and exposes the full list as name and tooltip", () => {
    renderBadge(["A", "B", "C", "D", "E"]);
    const badge = screen.getByText("A · B · C +2");
    expect(badge).toHaveAccessibleName("A · B · C · D · E");
    expect(badge).toHaveAttribute("title", "A · B · C · D · E");
  });

  it("renders markup in a language name literally", () => {
    renderBadge(["<img src=x>"]);
    expect(screen.getByText("<img src=x>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
