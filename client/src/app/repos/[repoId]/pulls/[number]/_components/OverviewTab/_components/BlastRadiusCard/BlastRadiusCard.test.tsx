import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

describe("BlastRadiusCard", () => {
  it("renders the section label and the coming-soon placeholder", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <BlastRadiusCard />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
  });
});
