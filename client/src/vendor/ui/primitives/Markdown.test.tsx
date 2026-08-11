import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown (XSS regression)", () => {
  it("does not render raw HTML tags from the source as live DOM", () => {
    const { container } = render(<Markdown>{'<img src=x onerror="window.__xss=1" />'}</Markdown>);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it("strips javascript: URIs from markdown image syntax", () => {
    const { container } = render(<Markdown>{"![x](javascript:alert(1))"}</Markdown>);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.getAttribute("src") ?? "").toBe("");
  });

  it("strips javascript: URIs from markdown link syntax", () => {
    const { container } = render(<Markdown>{"[click](javascript:alert(1))"}</Markdown>);
    const a = container.querySelector("a");
    expect(a).toBeInTheDocument();
    expect(a?.getAttribute("href")).toBe("");
  });
});
