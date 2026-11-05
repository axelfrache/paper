import { describe, expect, it } from "vitest";
import { buildNoteGraph } from "./noteGraph";
import {
  defaultGraphFilters,
  graphNeighbors,
  neighborhood,
  visibleGraphIds,
} from "./graphExploration";
import type { Note } from "../types/note";
const note = (
  id: string,
  content = "",
  folderId: string | null = null,
  tags: string[] = [],
): Note => ({
  id,
  title: id.toUpperCase(),
  content,
  folderId,
  tags,
  favorite: false,
  createdAt: "",
  updatedAt: "",
});
const graph = buildNoteGraph([
  note("a", "[[B]]", "work", ["first", "second"]),
  note("b", "[[C]]", "work", ["second"]),
  note("c", "[[A]] [[D]]"),
  note("d"),
  note("orphan"),
]);
const neighbors = graphNeighbors(graph);
describe("graph exploration", () => {
  it("traverses one or two levels without duplicating cycles", () => {
    expect([...neighborhood(neighbors, "a", 1)].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect([...neighborhood(neighbors, "a", 2)].sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(neighborhood(neighbors, "deleted", 2).size).toBe(0);
  });
  it("combines folder, any tag and local depth filters", () => {
    expect([
      ...visibleGraphIds(
        graph,
        neighbors,
        { folders: ["work"], tags: ["SECOND"], hideIsolated: false, depth: 1 },
        "a",
      ),
    ]).toEqual(["a", "b"]);
    expect([
      ...visibleGraphIds(
        graph,
        neighbors,
        { ...defaultGraphFilters, folders: [null] },
        "a",
      ),
    ]).toEqual(["c", "d", "orphan"]);
  });
  it("hides nodes isolated inside the filtered subset", () => {
    expect([
      ...visibleGraphIds(
        graph,
        neighbors,
        { ...defaultGraphFilters, hideIsolated: true },
        "a",
      ),
    ]).toEqual(["a", "b", "c", "d"]);
    expect([
      ...visibleGraphIds(
        graph,
        neighbors,
        { ...defaultGraphFilters, tags: ["first"], hideIsolated: true },
        "a",
      ),
    ]).toEqual([]);
  });
  it("does not resolve ambiguous titles merely because a duplicate is hidden", () => {
    const input = buildNoteGraph([
      note("a", "[[B]]", "work"),
      note("b", "", "work"),
      { ...note("duplicate", "", "other"), title: "B" },
    ]);
    expect([
      ...visibleGraphIds(
        input,
        graphNeighbors(input),
        { ...defaultGraphFilters, folders: ["work"], hideIsolated: true },
        null,
      ),
    ]).toEqual([]);
    expect(input.issues[0].reason).toBe("ambiguous");
  });
});

it("unions folders and tags within a group, then intersects the groups", () => {
  const result = visibleGraphIds(
    graph,
    neighbors,
    { ...defaultGraphFilters, folders: ["work", null], tags: ["first", null] },
    null,
  );
  expect([...result]).toEqual(["a", "c", "d", "orphan"]);
});
