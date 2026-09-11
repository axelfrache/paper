import { describe, expect, it } from "vitest";
import { extractTagTokens, highlightSegments, matchesFilter, takeTrailingTag } from "./notesFilter";
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

describe("extractTagTokens", () => {
  it("lifts completed #tokens and keeps the rest as query", () => {
    const { query, tags } = extractTagTokens("meeting #work notes #urgent ");
    expect(tags).toEqual(["work", "urgent"]);
    expect(query).toBe("meeting notes ");
  });

  it("leaves an incomplete trailing token in the query", () => {
    const { query, tags } = extractTagTokens("todo #wo");
    expect(tags).toEqual([]);
    expect(query).toBe("todo #wo");
  });
});

describe("takeTrailingTag", () => {
  it("lifts a trailing #token even without a trailing space", () => {
    expect(takeTrailingTag("meeting #work")).toEqual({ tag: "work", rest: "meeting" });
    expect(takeTrailingTag("#work")).toEqual({ tag: "work", rest: "" });
  });

  it("ignores text with no trailing tag or a # glued to a word", () => {
    expect(takeTrailingTag("meeting")).toEqual({ tag: null, rest: "meeting" });
    expect(takeTrailingTag("foo#bar")).toEqual({ tag: null, rest: "foo#bar" });
  });
});

describe("matchesFilter", () => {
  const sample = note({ title: "Deploy plan", content: "Ship to prod", tags: ["work", "urgent"] });

  it("matches a substring across title, content and tags", () => {
    expect(matchesFilter(sample, { query: "ship", tags: [] })).toBe(true);
    expect(matchesFilter(sample, { query: "missing", tags: [] })).toBe(false);
  });

  it("requires all tags (AND)", () => {
    expect(matchesFilter(sample, { query: "", tags: ["work", "urgent"] })).toBe(true);
    expect(matchesFilter(sample, { query: "", tags: ["work", "later"] })).toBe(false);
  });

  it("combines query and tags", () => {
    expect(matchesFilter(sample, { query: "prod", tags: ["work"] })).toBe(true);
    expect(matchesFilter(sample, { query: "prod", tags: ["later"] })).toBe(false);
  });

  it("matches a #-prefixed tag typed as free text", () => {
    expect(matchesFilter(sample, { query: "#work", tags: [] })).toBe(true);
    expect(matchesFilter(sample, { query: "#missing", tags: [] })).toBe(false);
  });
});

describe("highlightSegments", () => {
  it("splits the text around case-insensitive matches", () => {
    const segments = highlightSegments("Deploy the Deployment", "deploy");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["Deploy", "Deploy"]);
    expect(segments.map((s) => s.text).join("")).toBe("Deploy the Deployment");
  });

  it("returns a single unmatched segment when the query is empty", () => {
    expect(highlightSegments("anything", "  ")).toEqual([{ text: "anything", match: false }]);
  });
});
