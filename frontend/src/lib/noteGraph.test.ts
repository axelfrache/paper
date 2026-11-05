import { describe, expect, it } from "vitest";
import {
  buildNoteGraph,
  buildNoteTitleIndex,
  colorForTag,
  extractWikilinkTitles,
} from "./noteGraph";
import type { Note } from "../types/note";

function note(overrides: Partial<Note>): Note {
  return {
    id: "n1",
    title: "",
    content: "",
    tags: [],
    favorite: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractWikilinkTitles", () => {
  it("returns nothing for plain text", () => {
    expect(extractWikilinkTitles("No links here.")).toEqual([]);
  });

  it("extracts a single wikilink", () => {
    expect(extractWikilinkTitles("See [[Grocery list]].")).toEqual([
      "Grocery list",
    ]);
  });

  it("extracts multiple wikilinks", () => {
    expect(extractWikilinkTitles("[[A]] and [[B]]")).toEqual(["A", "B"]);
  });

  it("extracts wikilinks nested inside bold, italic, strike and underline", () => {
    expect(extractWikilinkTitles("**[[Bold link]]**")).toEqual(["Bold link"]);
    expect(extractWikilinkTitles("*[[Italic link]]*")).toEqual(["Italic link"]);
    expect(extractWikilinkTitles("~~[[Strike link]]~~")).toEqual([
      "Strike link",
    ]);
    expect(extractWikilinkTitles("<u>[[Underline link]]</u>")).toEqual([
      "Underline link",
    ]);
  });

  it("extracts a wikilink nested inside a regular link label", () => {
    expect(
      extractWikilinkTitles("[see [[Nested]]](https://example.com)"),
    ).toEqual(["Nested"]);
  });
});

describe("buildNoteTitleIndex", () => {
  it("maps lowercased, trimmed titles to ids, excluding ambiguous duplicates", () => {
    const index = buildNoteTitleIndex([
      { id: "a", title: "Deploy plan" },
      { id: "b", title: "deploy plan" },
      { id: "c", title: "Grocery list" },
    ]);
    expect(index.has("deploy plan")).toBe(false);
    expect(index.get("grocery list")).toBe("c");
  });
});

describe("buildNoteGraph", () => {
  it("includes every note as a node, even with no links", () => {
    const notes = [note({ id: "a", title: "Orphan" })];
    const { nodes, edges } = buildNoteGraph(notes);
    expect(nodes).toEqual([
      { id: "a", title: "Orphan", folderId: null, tags: [] },
    ]);
    expect(edges).toEqual([]);
  });

  it("creates one deduplicated edge for a mutual link", () => {
    const notes = [
      note({ id: "a", title: "A", content: "[[B]]" }),
      note({ id: "b", title: "B", content: "[[A]]" }),
    ];
    const { edges } = buildNoteGraph(notes);
    expect(edges).toEqual([{ source: "a", target: "b" }]);
  });

  it("excludes a link to a title that does not resolve to any note", () => {
    const notes = [note({ id: "a", title: "A", content: "[[Nonexistent]]" })];
    expect(buildNoteGraph(notes).edges).toEqual([]);
  });

  it("excludes a self-link", () => {
    const notes = [note({ id: "a", title: "A", content: "[[A]]" })];
    expect(buildNoteGraph(notes).edges).toEqual([]);
  });

  it("carries folderId and tags onto the node", () => {
    const notes = [
      note({ id: "a", title: "A", folderId: "f1", tags: ["work"] }),
    ];
    expect(buildNoteGraph(notes).nodes).toEqual([
      { id: "a", title: "A", folderId: "f1", tags: ["work"] },
    ]);
  });

  it("keeps physics stable when presentation or unresolved links change", () => {
    const base = note({ id: "a", title: "A", content: "" });
    const baseline = buildNoteGraph([base]).signature;
    expect(buildNoteGraph([{ ...base, title: "A renamed" }]).signature).toBe(
      baseline,
    );
    expect(buildNoteGraph([{ ...base, folderId: "f1" }]).signature).toBe(
      baseline,
    );
    expect(buildNoteGraph([{ ...base, tags: ["work"] }]).signature).toBe(
      baseline,
    );
    expect(buildNoteGraph([{ ...base, content: "[[Other]]" }]).signature).toBe(
      baseline,
    );
  });

  it("keeps the same signature when content changes without adding or removing any link", () => {
    const notes = [note({ id: "a", title: "A", content: "hello" })];
    const first = buildNoteGraph(notes).signature;
    const second = buildNoteGraph([
      { ...notes[0], content: "hello world" },
    ]).signature;
    expect(second).toBe(first);
  });
});

describe("colorForTag", () => {
  it("is deterministic for the same tag", () => {
    expect(colorForTag("work")).toBe(colorForTag("work"));
  });

  it("returns an hsl() color string", () => {
    expect(colorForTag("urgent")).toMatch(/^hsl\(\d+, 55%, 55%\)$/);
  });
});

describe("graph link reliability", () => {
  it.each([
    "~~~js\n[[Hidden]]\n~~~",
    "```\n[[Hidden]]\n```",
    "~~~\n[[Hidden]]",
    "```mermaid\ngraph LR\n[[Hidden]]\n```",
    "`[[Hidden]]`",
    "``a ` [[Hidden]] b``",
    "\\[[Escaped]]",
  ])("ignores literal links in %s", (content) => {
    expect(extractWikilinkTitles(content + "\n\n[[Visible]]")).toEqual(
      content === "~~~\n[[Hidden]]" ? [] : ["Visible"],
    );
  });
  it("walks headings, quotes, lists and task text", () => {
    expect(
      extractWikilinkTitles(
        "# [[Heading]]\n> [[Quote]]\n- [[List]]\n1. [[Ordered]]\n- [ ] [[Task]]",
      ),
    ).toEqual(["Heading", "Quote", "List", "Ordered", "Task"]);
  });
  it("reports ambiguous and missing targets without choosing an arbitrary note", () => {
    const input = [
      note({ id: "a", title: "A", content: "[[B]] [[Missing]] [[B]]" }),
      note({ id: "b", title: "B" }),
      note({ id: "c", title: " b " }),
      note({ id: "d", title: "B" }),
    ];
    expect(buildNoteGraph(input).edges).toEqual([]);
    expect(buildNoteGraph(input).issues).toEqual([
      { source: "a", title: "B", reason: "ambiguous" },
      { source: "a", title: "Missing", reason: "missing" },
    ]);
    expect(buildNoteGraph([...input].reverse()).issues).toEqual(
      buildNoteGraph(input).issues,
    );
  });
  it("updates topology after links resolve or a target is renamed, regardless of note ordering", () => {
    const a = note({ id: "a", title: "A", content: "[[B]]" });
    const b = note({ id: "b", title: "B" });
    const linked = buildNoteGraph([a, b]);
    expect(buildNoteGraph([b, a]).signature).toBe(linked.signature);
    expect(buildNoteGraph([a, { ...b, title: "Renamed" }]).issues).toEqual([
      { source: "a", title: "B", reason: "missing" },
    ]);
    expect(buildNoteGraph([a, { ...b, title: "Renamed" }]).signature).not.toBe(
      linked.signature,
    );
    expect(buildNoteGraph([a]).signature).not.toBe(linked.signature);
    expect(
      buildNoteGraph([
        { ...a, content: "[[Renamed]]" },
        { ...b, title: "Renamed" },
      ]).signature,
    ).toBe(linked.signature);
  });
});
