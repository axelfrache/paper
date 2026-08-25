import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "../diagram";
import { isDivider, normalizeMarkdown, parseBlocks, parseInline, safeHref } from "./render";

describe("markdown rendering parser", () => {
  it("parses headings up to level three", () => {
    expect(parseBlocks("# Title\n## Section\n### Detail")).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "heading", level: 2, text: "Section" },
      { type: "heading", level: 3, text: "Detail" },
    ]);
  });

  it("groups adjacent paragraph lines", () => {
    expect(parseBlocks("First line\nsecond line\n\nNext")).toEqual([
      { type: "paragraph", text: "First line second line" },
      { type: "paragraph", text: "Next" },
    ]);
  });

  it("parses inline strong, emphasis and code", () => {
    expect(parseInline("Use **bold**, *italic* and `code`.")).toEqual([
      { type: "text", text: "Use " },
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: ", " },
      { type: "em", children: [{ type: "text", text: "italic" }] },
      { type: "text", text: " and " },
      { type: "code", text: "code" },
      { type: "text", text: "." },
    ]);
  });

  it("parses nested inline formatting inside links", () => {
    expect(parseInline("[**Paper** notes](https://paper.home.axelfrache.com)")).toEqual([
      {
        type: "link",
        href: "https://paper.home.axelfrache.com",
        source: "https://paper.home.axelfrache.com",
        safe: true,
        text: [
          { type: "strong", children: [{ type: "text", text: "Paper" }] },
          { type: "text", text: " notes" },
        ],
      },
    ]);
  });

  it("marks unsafe links without dropping their href", () => {
    expect(parseInline("[bad](javascript:alert(1))")).toEqual([
      {
        type: "link",
        href: "javascript:alert(1)",
        source: "javascript:alert(1)",
        safe: false,
        text: [{ type: "text", text: "bad" }],
      },
    ]);
  });

  it("parses links with parenthesized URLs", () => {
    expect(parseInline("[wiki](https://example.com/a_(b))")).toEqual([
      {
        type: "link",
        href: "https://example.com/a_(b)",
        source: "https://example.com/a_(b)",
        safe: true,
        text: [{ type: "text", text: "wiki" }],
      },
    ]);
  });

  it("parses links with optional titles", () => {
    expect(parseInline('[docs](https://example.com/docs "Read docs")')).toEqual([
      {
        type: "link",
        href: "https://example.com/docs",
        source: 'https://example.com/docs "Read docs"',
        title: "Read docs",
        safe: true,
        text: [{ type: "text", text: "docs" }],
      },
    ]);
  });

  it("keeps empty label links as plain text", () => {
    expect(parseInline("[](https://example.com)")).toEqual([
      { type: "text", text: "[](https://example.com)" },
    ]);
  });

  it("keeps malformed links as plain text", () => {
    expect(parseInline("[docs](https://example.com \"title\" trailing)")).toEqual([
      { type: "text", text: "[docs](https://example.com \"title\" trailing)" },
    ]);
  });

  it("accepts only safe href schemes and local absolute paths", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(safeHref("tel:+33123456789")).toBe("tel:+33123456789");
    expect(safeHref("/notes/123")).toBe("/notes/123");
    expect(safeHref("//example.com")).toBe("");
    expect(safeHref("https://example.com/bad url")).toBe("");
    expect(safeHref("javascript:alert(1)")).toBe("");
  });

  it("groups task list items", () => {
    expect(parseBlocks("- [ ] Write tests\n- [x] Ship parser")).toEqual([
      {
        type: "tasks",
        items: [
          { done: false, text: "Write tests" },
          { done: true, text: "Ship parser" },
        ],
      },
    ]);
  });

  it("groups unordered list items", () => {
    expect(parseBlocks("- Alpha\n* Beta\n• Gamma")).toEqual([
      { type: "ul", items: ["Alpha", "Beta", "Gamma"] },
    ]);
  });

  it("groups ordered list items", () => {
    expect(parseBlocks("1. Alpha\n2) Beta")).toEqual([
      { type: "ol", items: ["Alpha", "Beta"] },
    ]);
  });

  it("parses quotes", () => {
    expect(parseBlocks("> quoted text")).toEqual([
      { type: "quote", text: "quoted text" },
    ]);
  });

  it("parses fenced code blocks", () => {
    expect(parseBlocks("Before\n```\nconst value = 1;\n```\nAfter")).toEqual([
      { type: "paragraph", text: "Before" },
      { type: "code", text: "const value = 1;" },
      { type: "paragraph", text: "After" },
    ]);
  });

  it("keeps unterminated fenced code blocks", () => {
    expect(parseBlocks("```\nopen block")).toEqual([
      { type: "code", text: "open block" },
    ]);
  });

  it("detects divider lines", () => {
    expect(isDivider("---")).toBe(true);
    expect(isDivider("  * * *")).toBe(true);
    expect(isDivider("___")).toBe(true);
    expect(isDivider("--")).toBe(false);
    expect(parseBlocks("Intro\n---\nOutro")).toEqual([
      { type: "paragraph", text: "Intro" },
      { type: "divider" },
      { type: "paragraph", text: "Outro" },
    ]);
  });

  it("parses diagram markers as diagram blocks", () => {
    const diagram = createDefaultDiagram();
    const marker = serializeDiagramMarker(diagram);
    expect(parseBlocks(marker)).toEqual([{ type: "diagram", diagram }]);
  });

  it("normalizes generated markdown bullets", () => {
    expect(normalizeMarkdown("Summary - **Task one** - Task two")).toBe("Summary\n- **Task one**\n- Task two");
  });
});
