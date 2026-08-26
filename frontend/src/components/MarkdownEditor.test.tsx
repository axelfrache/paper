import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { placeSelection, getSelectionRange } from "../lib/markdown/dom";
import { MarkdownEditor } from "./MarkdownEditor";

let root: Root | null = null;

function ControlledEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownEditor value={value} onChange={setValue} />
      <output data-value>{value}</output>
    </>
  );
}

function mount(initial: string) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ControlledEditor initial={initial} />);
  });
  return host;
}

function editorFrom(host: Element) {
  const editor = host.querySelector<HTMLDivElement>(".markdown-editor");
  if (!editor) {
    throw new Error("Missing editor");
  }
  return editor;
}

function valueFrom(host: Element) {
  return host.querySelector("[data-value]")?.textContent ?? "";
}

beforeEach(() => {
  if (!Range.prototype.getBoundingClientRect) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 0, 0),
    });
  }
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("MarkdownEditor integration", () => {
  it("wraps a selected range as a link and places the caret inside the href", () => {
    const host = mount("Visit Paper today");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit [Paper](https://) today");
    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: 22 },
      end: { line: 0, col: 22 },
    });
  });

  it("shows a floating toolbar for selected text", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 5 }, end: { line: 0, col: 10 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    expect(host.querySelector(".selection-toolbar button[aria-label='Bold']")).not.toBeNull();
    expect(host.querySelector(".selection-toolbar button[aria-label='Italic']")).not.toBeNull();
    expect(host.querySelector(".selection-toolbar button[aria-label='Code']")).not.toBeNull();
    expect(host.querySelector(".selection-toolbar button[aria-label='Strikethrough']")).not.toBeNull();
    expect(host.querySelector(".selection-toolbar button[aria-label='Underline']")).not.toBeNull();
    expect(host.querySelector(".selection-toolbar button[aria-label='Link']")).not.toBeNull();
  });

  it("applies formatting from the floating toolbar", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 5 }, end: { line: 0, col: 10 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Bold']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make **Paper** bold");
    expect(host.querySelector(".selection-toolbar")).toBeNull();
  });

  it("applies strikethrough from the floating toolbar", () => {
    const host = mount("Strike Paper");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 7 }, end: { line: 0, col: 12 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Strikethrough']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Strike ~~Paper~~");
  });

  it("applies underline from the floating toolbar", () => {
    const host = mount("Underline Paper");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 10 }, end: { line: 0, col: 15 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Underline']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Underline <u>Paper</u>");
  });

  it("applies links from the floating toolbar", () => {
    const host = mount("Visit Paper");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Link']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit [Paper](https://)");
    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: 22 },
      end: { line: 0, col: 22 },
    });
  });

  it("opens a rendered link on ctrl click", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const host = mount("[Paper](https://example.com/docs)");
    const editor = editorFrom(host);
    const link = editor.querySelector("a");

    act(() => {
      link?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(open).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
  });
});
