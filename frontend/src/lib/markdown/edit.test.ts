import { describe, expect, it } from "vitest";
import {
  deleteBackward,
  deleteBackwardWord,
  deleteForward,
  deleteForwardWord,
  deleteRange,
  focusCaret,
  fullTextRange,
  insertLineBreak,
  insertText,
  isCollapsedRange,
  normalizeMarkdownText,
  normalizeRange,
  replaceRange,
  selectedText,
  wrapLink,
  wrapSelection,
} from "./edit";

describe("markdown editing operations", () => {
  it("wraps a collapsed caret and keeps the caret between markers", () => {
    expect(wrapSelection("hello", { start: { line: 0, col: 5 }, end: { line: 0, col: 5 } }, "**")).toEqual({
      value: "hello****",
      caret: { line: 0, col: 7 },
    });
  });

  it("wraps a selected word in bold markers", () => {
    expect(wrapSelection("make this bold", { start: { line: 0, col: 10 }, end: { line: 0, col: 14 } }, "**")).toEqual({
      value: "make this **bold**",
      caret: { line: 0, col: 18 },
    });
  });

  it("preserves bold markers when typing after a bold word", () => {
    expect(insertText("**bold**", { start: { line: 0, col: 8 }, end: { line: 0, col: 8 } }, " text")).toEqual({
      value: "**bold** text",
      caret: { line: 0, col: 13 },
    });
  });

  it("preserves bold markers when deleting after a bold word", () => {
    expect(deleteBackward("**bold** text", { line: 0, col: 9 })).toEqual({
      value: "**bold**text",
      caret: { line: 0, col: 8 },
    });
  });

  it("preserves link syntax when typing after a link", () => {
    const value = "[Paper](https://paper.home.axelfrache.com)";
    expect(insertText(value, { start: { line: 0, col: value.length }, end: { line: 0, col: value.length } }, " notes")).toEqual({
      value: `${value} notes`,
      caret: { line: 0, col: value.length + 6 },
    });
  });

  it("wraps selected text as a markdown link and focuses the href", () => {
    expect(wrapLink("Visit Paper today", { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } })).toEqual({
      value: "Visit [Paper](https://) today",
      caret: { line: 0, col: 22 },
    });
  });

  it("inserts a placeholder link at a collapsed caret", () => {
    expect(wrapLink("Visit ", { start: { line: 0, col: 6 }, end: { line: 0, col: 6 } })).toEqual({
      value: "Visit [link](https://)",
      caret: { line: 0, col: 21 },
    });
  });

  it("replaces a selected range with pasted text", () => {
    expect(insertText("hello world", { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } }, "Paper")).toEqual({
      value: "hello Paper",
      caret: { line: 0, col: 11 },
    });
  });

  it("replaces a multi-line range", () => {
    expect(replaceRange("one two\nthree four\nfive", { start: { line: 0, col: 4 }, end: { line: 1, col: 5 } }, "next")).toEqual({
      value: "one next four\nfive",
      caret: { line: 0, col: 8 },
    });
  });

  it("deletes a selected multi-line range", () => {
    expect(deleteRange("alpha beta\ngamma delta\nomega", { start: { line: 0, col: 6 }, end: { line: 1, col: 5 } })).toEqual({
      value: "alpha  delta\nomega",
      caret: { line: 0, col: 6 },
    });
  });

  it("continues bullet lists on enter", () => {
    expect(insertLineBreak("- first", { line: 0, col: 7 })).toEqual({
      value: "- first\n- ",
      caret: { line: 1, col: 2 },
    });
  });

  it("continues task lists on enter", () => {
    expect(insertLineBreak("- [x] done", { line: 0, col: 10 })).toEqual({
      value: "- [x] done\n- [ ] ",
      caret: { line: 1, col: 6 },
    });
  });

  it("exits an empty list item on enter", () => {
    expect(insertLineBreak("- ", { line: 0, col: 2 })).toEqual({
      value: "",
      caret: { line: 0, col: 0 },
    });
  });

  it("joins lines on backspace at the beginning of a line", () => {
    expect(deleteBackward("first\nsecond", { line: 1, col: 0 })).toEqual({
      value: "firstsecond",
      caret: { line: 0, col: 5 },
    });
  });

  it("joins lines on delete at the end of a line", () => {
    expect(deleteForward("first\nsecond", { line: 0, col: 5 })).toEqual({
      value: "firstsecond",
      caret: { line: 0, col: 5 },
    });
  });

  it("deletes the previous word", () => {
    expect(deleteBackwardWord("hello brave world", { line: 0, col: 17 })).toEqual({
      value: "hello brave ",
      caret: { line: 0, col: 12 },
    });
  });

  it("deletes the next word", () => {
    expect(deleteForwardWord("hello brave world", { line: 0, col: 6 })).toEqual({
      value: "hello  world",
      caret: { line: 0, col: 6 },
    });
  });

  it("normalizes pasted markdown-ish bullet text", () => {
    expect(normalizeMarkdownText("Intro - **Task** - next")).toBe("Intro\n- **Task**\n- next");
  });

  it("normalizes reversed ranges", () => {
    expect(normalizeRange({ start: { line: 2, col: 4 }, end: { line: 0, col: 1 } })).toEqual({
      start: { line: 0, col: 1 },
      end: { line: 2, col: 4 },
    });
  });

  it("reads selected text across lines", () => {
    expect(selectedText("alpha beta\ngamma delta\nomega", { start: { line: 0, col: 6 }, end: { line: 1, col: 5 } })).toBe("beta\ngamma");
  });

  it("detects collapsed ranges", () => {
    expect(isCollapsedRange({ start: { line: 0, col: 2 }, end: { line: 0, col: 2 } })).toBe(true);
    expect(isCollapsedRange({ start: { line: 0, col: 2 }, end: { line: 0, col: 3 } })).toBe(false);
  });

  it("returns focus carets for document placements", () => {
    expect(fullTextRange("one\ntwo")).toEqual({
      start: { line: 0, col: 0 },
      end: { line: 1, col: 3 },
    });
    expect(focusCaret("one\ntwo", null, "end")).toEqual({ line: 1, col: 3 });
    expect(focusCaret("one\ntwo", { line: 0, col: 2 }, "last")).toEqual({ line: 0, col: 2 });
  });
});
