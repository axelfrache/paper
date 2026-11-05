import { describe, expect, it } from "vitest";
import {
  expandMermaid,
  parseMermaidMarker,
  projectMermaid,
  replaceMermaidSource,
  mermaidTitle,
  withMermaidTitle,
} from "./mermaid";

describe("Mermaid editor projection", () => {
  it("persists titles without changing graph source or fence style", () => {
    const original = "  ~~~MERMAID extra\nflowchart LR\nA --> B\n  ~~~~";
    const titled = withMermaidTitle(original, '  Architecture "API" `v2` <cloud>  ');
    expect(mermaidTitle(titled)).toBe('Architecture "API" `v2` <cloud>');
    expect(titled.split("\n").slice(1)).toEqual(original.split("\n").slice(1));
    expect(expandMermaid(projectMermaid(titled).value)).toBe(titled);
    expect(mermaidTitle(replaceMermaidSource(titled, "flowchart TD\nB --> C"))).toBe('Architecture "API" `v2` <cloud>');
    expect(withMermaidTitle(titled, "")).toBe(original);
    const renamed = withMermaidTitle(titled, "New title");
    expect(mermaidTitle(renamed)).toBe("New title");
    expect(renamed.match(/title=/g)).toHaveLength(1);
  });

  it("escapes backticks so a title cannot invalidate the Markdown fence", () => {
    const source = withMermaidTitle("```mermaid\nA --> B\n```", "Graph `test`");
    const marker = projectMermaid(source).value;
    expect(parseMermaidMarker(marker)?.title).toBe("Graph `test`");
    expect(parseMermaidMarker(marker)?.text).toBe("A --> B");
    expect(expandMermaid(marker)).toBe(source);
  });
  it("keeps an unchanged source byte for byte, including empty blocks and longer closing fences", () => {
    expect(replaceMermaidSource("```mermaid\n```", "")).toBe("```mermaid\n```");
    expect(replaceMermaidSource("```mermaid\nA --> B\n````", "A --> B")).toBe("```mermaid\nA --> B\n````");
  });
  it("round trips multiple fences exactly and maps editor lines to Markdown", () => {
    const source =
      "Before\n  ~~~MERMAID\nA[é] --> B\n  ~~~\nMiddle\n````mermaid\nsequenceDiagram\nA->>B: Hi\n````\nAfter";
    const projected = projectMermaid(source);
    expect(projected.sourceLines).toEqual([0, 1, 4, 5, 9]);
    expect(expandMermaid(projected.value)).toBe(source);
    expect(projected.caret({ line: 7, col: 2 })).toEqual({ line: 3, col: 0 });
    expect(projected.caret({ line: 9, col: 3 })).toEqual({ line: 4, col: 3 });
    expect(projectMermaid(projected.value).value).toBe(projected.value);
  });
  it("leaves nested and unfinished fences literal", () => {
    for (const source of [
      "````\n```mermaid\nA --> B\n```\n````",
      "```mermaid\nA --> B",
      "```iso\n{}\n```",
    ])
      expect(projectMermaid(source).value).toBe(source);
    expect(parseMermaidMarker("![mermaid:%bad]")).toBeNull();
  });
  it("keeps source edits inside a fence even when code contains closing fences", () => {
    const next = replaceMermaidSource(
      "```mermaid\nA --> B\n```",
      "A --> B\n```\nTail",
    );
    expect(next).toBe("````mermaid\nA --> B\n```\nTail\n````");
    expect(expandMermaid(projectMermaid(next).value)).toBe(next);
  });
});
