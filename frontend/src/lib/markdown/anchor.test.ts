import { expect, it } from "vitest";
import { remapCaret } from "./anchor";
it("moves upload anchors with edits before them", () => {
  expect(remapCaret("before\nafter", "new\nbefore\nafter", { line: 1, col: 0 })).toEqual({ line: 2, col: 0 });
  expect(remapCaret("before\nafter", "after", { line: 1, col: 0 })).toEqual({ line: 0, col: 0 });
});
it("keeps left affinity when typing at an upload anchor", () => {
  expect(remapCaret("ab", "aXXb", { line: 0, col: 1 })).toEqual({ line: 0, col: 1 });
});
