import { describe, expect, it } from "vitest";
import {
  domPointForCaret,
  getSelectionRange,
  linkElementFromTarget,
  lineLength,
  lineNodes,
  placeCaret,
  placeSelection,
  pointToCaret,
  readSource,
  sourceTextLength,
  stepColumn,
} from "./dom";

function makeEditor(html: string) {
  const editor = document.createElement("div");
  editor.innerHTML = html;
  document.body.replaceChildren(editor);
  return editor as HTMLDivElement;
}

describe("markdown DOM mapping", () => {
  it("reads source text without visual decorations", () => {
    const editor = makeEditor(`
      <div data-line="0"><span data-deco="1">☐</span><span>- [ ] </span><span>Task</span></div>
      <div data-line="1"><span># </span><strong>Title</strong></div>
    `);

    expect(readSource(editor)).toBe("- [ ] Task\n# Title");
  });

  it("collects only source text nodes for a line", () => {
    const editor = makeEditor(`
      <div data-line="0"><span data-deco="1">•</span><span>- </span><span>Item</span></div>
    `);
    const line = editor.querySelector("[data-line]");

    expect(lineNodes(line).map((node) => node.nodeValue)).toEqual(["- ", "Item"]);
  });

  it("measures line length from source nodes only", () => {
    const editor = makeEditor(`
      <div data-line="0"><span data-deco="1">preview</span><span>[</span><a href="https://x.test">Link</a><span>](https://x.test)</span></div>
    `);
    const line = editor.querySelector("[data-line]");

    expect(line ? lineLength(line) : 0).toBe("[Link](https://x.test)".length);
  });

  it("ignores decoration subtrees when measuring source text", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>before</span><span data-deco="1"><span>ignored</span></span><span>after</span></div>
    `);
    const line = editor.querySelector("[data-line]");

    expect(line ? sourceTextLength(line) : 0).toBe("beforeafter".length);
  });

  it("finds a link from a nested event target", () => {
    const editor = makeEditor(`
      <div data-line="0"><a href="https://x.test"><span>Paper</span></a></div>
    `);
    const target = editor.querySelector("span");

    expect(linkElementFromTarget(target)?.getAttribute("href")).toBe("https://x.test");
  });

  it("returns null when the event target is not inside a link", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>Paper</span></div>
    `);
    const target = editor.querySelector("span");

    expect(linkElementFromTarget(target)).toBeNull();
  });

  it("maps a caret at the end of bold text after closing markers", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>**</span><strong>bold</strong><span>**</span><span> text</span></div>
    `);
    const boldText = editor.querySelector("strong")?.firstChild;

    expect(boldText ? pointToCaret(editor, boldText, 4) : null).toEqual({ line: 0, col: 8 });
  });

  it("maps a caret inside bold text before closing markers", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>**</span><strong>bold</strong><span>**</span></div>
    `);
    const boldText = editor.querySelector("strong")?.firstChild;

    expect(boldText ? pointToCaret(editor, boldText, 2) : null).toEqual({ line: 0, col: 4 });
  });

  it("maps a caret at the end of a link after the closing href syntax", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>[</span><a href="https://x.test">Paper</a><span>](https://x.test)</span><span> notes</span></div>
    `);
    const linkText = editor.querySelector("a")?.firstChild;

    expect(linkText ? pointToCaret(editor, linkText, 5) : null).toEqual({ line: 0, col: "[Paper](https://x.test)".length });
  });

  it("maps a caret at the end of strikethrough text after closing markers", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>~~</span><s>strike</s><span>~~</span></div>
    `);
    const strikeText = editor.querySelector("s")?.firstChild;

    expect(strikeText ? pointToCaret(editor, strikeText, 6) : null).toEqual({ line: 0, col: 10 });
  });

  it("maps a caret at the end of underline text after closing markers", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>&lt;u&gt;</span><u>line</u><span>&lt;/u&gt;</span></div>
    `);
    const underlineText = editor.querySelector("u")?.firstChild;

    expect(underlineText ? pointToCaret(editor, underlineText, 4) : null).toEqual({ line: 0, col: 11 });
  });

  it("maps a caret inside a link label without jumping past href syntax", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>[</span><a href="https://x.test">Paper</a><span>](https://x.test)</span></div>
    `);
    const linkText = editor.querySelector("a")?.firstChild;

    expect(linkText ? pointToCaret(editor, linkText, 2) : null).toEqual({ line: 0, col: 3 });
  });

  it("maps editor child offsets to line boundaries", () => {
    const editor = makeEditor(`
      <div data-line="0">First</div>
      <div data-line="1">Second</div>
    `);

    expect(pointToCaret(editor, editor, 0)).toEqual({ line: 0, col: 0 });
    expect(pointToCaret(editor, editor, 1)).toEqual({ line: 1, col: 0 });
    expect(pointToCaret(editor, editor, 99)).toEqual({ line: 1, col: 6 });
  });

  it("places the caret at a source offset", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>Hello </span><strong>world</strong></div>
    `);

    placeCaret(editor, { line: 0, col: 8 });

    const selection = window.getSelection();
    expect(selection?.focusNode?.nodeValue).toBe("world");
    expect(selection?.focusOffset).toBe(2);
  });

  it("returns the DOM point for a caret after a link", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>[</span><a href="https://x.test">Paper</a><span>](https://x.test)</span></div>
    `);
    const point = domPointForCaret(editor, { line: 0, col: "[Paper](https://x.test)".length });

    expect(point?.node.nodeValue).toBe("](https://x.test)");
    expect(point?.offset).toBe("](https://x.test)".length);
  });

  it("never places the caret inside a hidden syntax marker", () => {
    const editor = makeEditor(`
      <div data-line="0"><span data-syntax-mark="1">**</span><strong>bold</strong><span data-syntax-mark="1">**</span><span> text</span></div>
    `);

    const afterClosingMark = domPointForCaret(editor, { line: 0, col: "**bold**".length });
    expect(afterClosingMark?.node.nodeValue).toBe(" text");
    expect(afterClosingMark?.offset).toBe(0);

    const beforeOpeningMark = domPointForCaret(editor, { line: 0, col: 0 });
    expect(beforeOpeningMark?.node.nodeValue).toBe("bold");
    expect(beforeOpeningMark?.offset).toBe(0);
  });

  it("falls back to the preceding visible node when a hidden marker is last on the line", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>Use </span><span data-syntax-mark="1">**</span><strong>bold</strong><span data-syntax-mark="1">**</span></div>
    `);

    const point = domPointForCaret(editor, { line: 0, col: "Use **bold**".length });

    expect(point?.node.nodeValue).toBe("bold");
    expect(point?.offset).toBe("bold".length);
  });

  it("keeps exact column fidelity when the whole line is a hidden marker", () => {
    const editor = makeEditor(`
      <div data-line="0" class="markdown-editor-divider"><span data-syntax-mark="1">---</span><span data-deco="1" class="markdown-editor-divider-rule"></span></div>
    `);
    const marker = editor.querySelector("[data-syntax-mark]")?.firstChild;

    const start = domPointForCaret(editor, { line: 0, col: 0 });
    expect(start?.node).toBe(marker);
    expect(start?.offset).toBe(0);

    const end = domPointForCaret(editor, { line: 0, col: 3 });
    expect(end?.node).toBe(marker);
    expect(end?.offset).toBe(3);
  });

  it("places and reads a normalized multi-line selection", () => {
    const editor = makeEditor(`
      <div data-line="0">Alpha</div>
      <div data-line="1">Beta</div>
    `);

    placeSelection(editor, { start: { line: 1, col: 2 }, end: { line: 0, col: 2 } });

    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: 2 },
      end: { line: 1, col: 2 },
    });
  });

  it("steps one plain character at a time", () => {
    const editor = makeEditor(`<div data-line="0">Hello</div>`);
    const line = editor.querySelector("[data-line]")!;

    expect(stepColumn(line, 2, 1)).toBe(3);
    expect(stepColumn(line, 2, -1)).toBe(1);
  });

  it("returns null at the true edges of a line", () => {
    const editor = makeEditor(`<div data-line="0">Hi</div>`);
    const line = editor.querySelector("[data-line]")!;

    expect(stepColumn(line, 2, 1)).toBeNull();
    expect(stepColumn(line, 0, -1)).toBeNull();
  });

  it("skips a whole hidden marker in one step instead of stopping inside it", () => {
    const editor = makeEditor(`
      <div data-line="0"><span>Use </span><span data-syntax-mark="1">**</span><strong>bold</strong><span data-syntax-mark="1">**</span></div>
    `);
    const line = editor.querySelector("[data-line]")!;

    expect(stepColumn(line, 4, 1)).toBe(7);
    expect(stepColumn(line, 10, 1)).toBeNull();
  });

  it("treats a hidden prefix at the very start of a line as the true edge", () => {
    const editor = makeEditor(`
      <div data-line="0"><span data-syntax-mark="1">- </span><span>Item</span></div>
    `);
    const line = editor.querySelector("[data-line]")!;

    expect(stepColumn(line, "- ".length, -1)).toBeNull();
  });
});

it("clamps a stale column to visible content before a trailing hidden marker", () => {
  const editor = makeEditor('<div data-line="0"><span data-syntax-mark="1">**</span><strong>test</strong><span data-syntax-mark="1">**</span></div>');
  const point = domPointForCaret(editor, { line: 0, col: 200 });
  expect(point?.node.nodeValue).toBe("test");
  expect(point?.offset).toBe(4);
});

it("crosses adjacent markers and emoji as one visible grapheme", () => {
  const editor = makeEditor('<div data-line="0"><strong>a</strong><span data-syntax-mark="1">**</span><span data-syntax-mark="1">*</span><em>👨‍👩‍👧‍👦</em><span data-syntax-mark="1">*</span></div>');
  const line = editor.firstElementChild!;
  expect(stepColumn(line, 1, 1)).toBe(4 + "👨‍👩‍👧‍👦".length);
  expect(stepColumn(line, 4 + "👨‍👩‍👧‍👦".length, -1)).toBe(4);
  expect(stepColumn(line, 4, -1)).toBe(0);
});
