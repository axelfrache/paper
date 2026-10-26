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
  toggleLink,
  toggleSelection,
  wrapLink,
  wrapLinkWithHref,
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

  it("wraps a selected word with different opening and closing marks", () => {
    expect(wrapSelection("underline this", { start: { line: 0, col: 0 }, end: { line: 0, col: 9 } }, "<u>", "</u>")).toEqual({
      value: "<u>underline</u> this",
      caret: { line: 0, col: 16 },
    });
  });

  it("toggles selected plain text into formatting", () => {
    expect(toggleSelection("make this bold", { start: { line: 0, col: 10 }, end: { line: 0, col: 14 } }, "**")).toEqual({
      value: "make this **bold**",
      caret: { line: 0, col: 18 },
    });
  });

  it("toggles selected formatted text back to plain text", () => {
    expect(toggleSelection("make this **bold**", { start: { line: 0, col: 12 }, end: { line: 0, col: 16 } }, "**")).toEqual({
      value: "make this bold",
      caret: { line: 0, col: 14 },
    });
  });

  it("toggles selected formatted text when the selection reaches the closing mark", () => {
    expect(toggleSelection("make this **bold**", { start: { line: 0, col: 12 }, end: { line: 0, col: 18 } }, "**")).toEqual({
      value: "make this bold",
      caret: { line: 0, col: 14 },
    });
  });

  it("toggles formatted text when the selection includes trailing text", () => {
    expect(toggleSelection("make this **bold** now", { start: { line: 0, col: 12 }, end: { line: 0, col: 19 } }, "**")).toEqual({
      value: "make this bold now",
      caret: { line: 0, col: 14 },
    });
  });

  it("adds italic inside bold without capturing bold markers", () => {
    expect(toggleSelection("make this **bold** now", { start: { line: 0, col: 12 }, end: { line: 0, col: 18 } }, "*")).toEqual({
      value: "make this ***bold*** now",
      caret: { line: 0, col: 18 },
    });
  });

  it("removes bold from combined bold and italic text", () => {
    expect(toggleSelection("make this ***bold*** now", { start: { line: 0, col: 13 }, end: { line: 0, col: 19 } }, "**")).toEqual({
      value: "make this *bold* now",
      caret: { line: 0, col: 16 },
    });
  });

  it("removes italic from combined bold and italic text", () => {
    expect(toggleSelection("make this ***bold*** now", { start: { line: 0, col: 13 }, end: { line: 0, col: 19 } }, "*")).toEqual({
      value: "make this **bold** now",
      caret: { line: 0, col: 16 },
    });
  });

  it("toggles underline formatting back to plain text", () => {
    expect(toggleSelection("underline <u>this</u>", { start: { line: 0, col: 13 }, end: { line: 0, col: 17 } }, "<u>", "</u>")).toEqual({
      value: "underline this",
      caret: { line: 0, col: 14 },
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

  it("uses a selected URL as the markdown link href", () => {
    expect(wrapLink("https://axelfrache.com", { start: { line: 0, col: 0 }, end: { line: 0, col: 22 } })).toEqual({
      value: "[https://axelfrache.com](https://axelfrache.com)",
      caret: { line: 0, col: 48 },
    });
  });

  it("inserts a placeholder link at a collapsed caret", () => {
    expect(wrapLink("Visit ", { start: { line: 0, col: 6 }, end: { line: 0, col: 6 } })).toEqual({
      value: "Visit [link](https://)",
      caret: { line: 0, col: 21 },
    });
  });

  it("wraps selected text with a supplied href", () => {
    expect(wrapLinkWithHref("Visit Paper", { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } }, "https://example.com")).toEqual({
      value: "Visit [Paper](https://example.com)",
      caret: { line: 0, col: 34 },
    });
  });

  it("toggles plain selected text into a markdown link", () => {
    expect(toggleLink("Visit Paper", { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } })).toEqual({
      value: "Visit [Paper](https://)",
      caret: { line: 0, col: 22 },
    });
  });

  it("toggles a selected markdown link label back to plain text", () => {
    expect(toggleLink("Visit [Paper](https://example.com) today", { start: { line: 0, col: 7 }, end: { line: 0, col: 12 } })).toEqual({
      value: "Visit Paper today",
      caret: { line: 0, col: 11 },
    });
  });

  it("toggles a rendered-link-like selection back to plain text", () => {
    expect(toggleLink("Visit [Paper](https://example.com) today", { start: { line: 0, col: 7 }, end: { line: 0, col: 34 } })).toEqual({
      value: "Visit Paper today",
      caret: { line: 0, col: 11 },
    });
  });

  it("toggles a collapsed caret inside a markdown link back to plain text", () => {
    expect(toggleLink("Visit [Paper](https://example.com) today", { start: { line: 0, col: 9 }, end: { line: 0, col: 9 } })).toEqual({
      value: "Visit Paper today",
      caret: { line: 0, col: 11 },
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

  it("preserves inline hyphens when pasting", () => {
    expect(normalizeMarkdownText("Intro - **Task** - next")).toBe("Intro - **Task** - next");
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

describe("Unicode and literal editing regressions", () => {
  it.each(["😀", "👨‍👩‍👧‍👦", "🇫🇷", "e\u0301", "👍🏽"])("deletes the whole grapheme %s", (text) => {
    expect(deleteBackward(`a${text}b`, { line: 0, col: 1 + text.length }).value).toBe("ab");
    expect(deleteForward(`a${text}b`, { line: 0, col: 1 }).value).toBe("ab");
  });
  it("continues and exits numbered lists", () => {
    expect(insertLineBreak("3. Item", { line: 0, col: 7 }).value).toBe("3. Item\n4. ");
    expect(insertLineBreak("4. ", { line: 0, col: 3 }).value).toBe("");
  });
  it("does not continue bullets inside fenced code", () => {
    expect(insertLineBreak("```\n- code\n```", { line: 1, col: 6 }).value).toBe("```\n- code\n\n```");
  });
});

it.each([
  ["**salut la team**", "team", "**salut la** team"],
  ["**salut la team**", "salut", "salut **la team**"],
  ["**salut la team**", "la", "**salut** la **team**"],
  ["**salut la team**", "alu", "**s**alu**t la team**"],
  ["***salut la team***", "team", "***salut la*** *team*"],
  ["**salut *la team* ici**", "team", "**salut *la*** *team* **ici**"],
  ["**salut [la team](https://example.com) ici**", "team", "**salut [la](https://example.com)** [team](https://example.com) **ici**"],
])("removes bold only from the selected substring of %s", (source, selected, expected) => {
  const start = source.indexOf(selected);
  const result = toggleSelection(source, { start: { line: 0, col: start }, end: { line: 0, col: start + selected.length } }, "**");
  expect(result.value).toBe(expected);
});

it.each([["*", "*"], ["~~", "~~"], ["`", "`"], ["<u>", "</u>"]])("removes only the selected word from %s formatting", (open, close) => {
  const source = `${open}salut la team${close}`;
  const start = source.indexOf("team");
  expect(toggleSelection(source, { start: { line: 0, col: start }, end: { line: 0, col: start + 4 } }, open, close).value).toBe(`${open}salut la${close} team`);
});

it("removes bold across multiple runs while preserving unselected text", () => {
  const source = "**one two** and **three four**";
  const result = toggleSelection(source, { start: { line: 0, col: source.indexOf("two") }, end: { line: 0, col: source.indexOf(" four") } }, "**");
  expect(result.value).toBe("**one** two and three **four**");
});

it("keeps code contents literal when splitting nested formatting", () => {
  const source = "**hello `*literal*` world**";
  const start = source.indexOf("ter");
  expect(toggleSelection(source, { start: { line: 0, col: start }, end: { line: 0, col: start + 3 } }, "**").value).toBe("**hello `*li`**`ter`**`al*` world**");
});
