import { act, useState } from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createDefaultDiagram, parseDiagramMarker, serializeDiagramMarker } from "../lib/diagram";
import { placeCaret, placeSelection, getSelectionRange, pointToCaret } from "../lib/markdown/dom";
import type { NoteImage } from "../types/note";
import { MarkdownEditor } from "./MarkdownEditor";

let root: Root | null = null;

function ControlledEditor({
  initial,
  focusRequest = null,
  onUploadImage,
  extra,
}: {
  initial: string;
  focusRequest?: { key: string; placement: "start" | "end" | "last" } | null;
  onUploadImage?: (file: File) => Promise<NoteImage>;
  extra?: Partial<ComponentProps<typeof MarkdownEditor>>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownEditor value={value} onChange={setValue} focusRequest={focusRequest} onUploadImage={onUploadImage} {...extra} />
      <output data-value>{value}</output>
    </>
  );
}

function mount(
  initial: string,
  focusRequest: { key: string; placement: "start" | "end" | "last" } | null = null,
  onUploadImage?: (file: File) => Promise<NoteImage>,
  extra?: Partial<ComponentProps<typeof MarkdownEditor>>,
) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ControlledEditor initial={initial} focusRequest={focusRequest} onUploadImage={onUploadImage} extra={extra} />);
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

/** Selects a range and lets the editor place its floating toolbar. */
function showSelectionToolbar(editor: HTMLDivElement, start: number, end: number) {
  editor.focus();
  placeSelection(editor, { start: { line: 0, col: start }, end: { line: 0, col: end } });
  editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
}

/** Presses and releases on a resource block, the way a click selects it. */
function selectResourceBlock(editor: Element, line: number) {
  editor
    .querySelector(`[data-resource-surface='${line}']`)
    ?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

/** The resource line currently selected as a whole, if any. */
function selectedResourceLine(editor: Element) {
  const selected = editor.querySelector(".markdown-editor-resource-line.is-selected");
  return selected ? Number(selected.getAttribute("data-resource-line")) : null;
}

function stubClipboard() {
  if (typeof (globalThis as { ClipboardItem?: unknown }).ClipboardItem === "undefined") {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    };
  }
  const write = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write, writeText },
  });
  return { write, writeText };
}

function pasteText(editor: Element, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : ""), files: [] },
  });
  editor.dispatchEvent(event);
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
  Reflect.deleteProperty(document, "elementFromPoint");
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

  it("uses a selected URL as the link href with ctrl k", () => {
    const host = mount("https://axelfrache.com");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 0 }, end: { line: 0, col: 22 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("[https://axelfrache.com](https://axelfrache.com)");
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
      host.querySelector(".selection-toolbar button[aria-label='Bold']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make **Paper** bold");
    expect(host.querySelector(".selection-toolbar")).toBeNull();
  });

  it("removes existing bold formatting with ctrl b", () => {
    const host = mount("Make **Paper** bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 7 }, end: { line: 0, col: 12 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make Paper bold");
  });

  it("keeps resources atomic while formatting text in a select-all range with ctrl b", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter\nText`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 0 }, end: { line: 2, col: 4 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`${marker}\n**After**\n**Text**`);
    expect(editor.textContent).not.toContain(marker);
  });

  it("removes existing bold formatting when selecting the rendered bold text", () => {
    const host = mount("Make **Paper** bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
    });

    const boldText = editor.querySelector("strong")?.firstChild;
    if (!boldText) {
      throw new Error("Missing bold text");
    }

    act(() => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(boldText, 0);
      range.setEnd(boldText, 5);
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make Paper bold");
  });

  it("removes existing bold formatting from the floating toolbar", () => {
    const host = mount("Make **Paper** bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 7 }, end: { line: 0, col: 14 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Bold']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make Paper bold");
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
      host.querySelector(".selection-toolbar button[aria-label='Strikethrough']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
      host.querySelector(".selection-toolbar button[aria-label='Underline']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Underline <u>Paper</u>");
  });

  it("applies underline with ctrl u", () => {
    const host = mount("Underline Paper");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 10 }, end: { line: 0, col: 15 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "u", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Underline <u>Paper</u>");
  });

  it("removes existing underline formatting with ctrl u", () => {
    const host = mount("Underline <u>Paper</u>");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 13 }, end: { line: 0, col: 18 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "u", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Underline Paper");
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
      host.querySelector(".selection-toolbar button[aria-label='Link']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit [Paper](https://)");
    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: 22 },
      end: { line: 0, col: 22 },
    });
  });

  it("removes an existing markdown link from the floating toolbar", () => {
    const host = mount("Visit [Paper](https://example.com)");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 7 }, end: { line: 0, col: 12 } });
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    act(() => {
      host.querySelector(".selection-toolbar button[aria-label='Link']")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit Paper");
  });

  it("removes an existing markdown link with ctrl k", () => {
    const host = mount("Visit [Paper](https://example.com)");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 7 }, end: { line: 0, col: 12 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit Paper");
  });

  it("removes an existing markdown link with ctrl k from a collapsed caret", () => {
    const host = mount("Visit [Paper](https://example.com)");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 9 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Visit Paper");
  });

  it("turns selected text into a link when pasting a safe URL", () => {
    const host = mount("Visit Paper");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 6 }, end: { line: 0, col: 11 } });
      const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, "clipboardData", {
        value: {
          getData: (type: string) => type === "text/plain" ? "https://example.com/docs" : "",
        },
      });
      editor.dispatchEvent(paste);
    });

    expect(valueFrom(host)).toBe("Visit [Paper](https://example.com/docs)");
  });

  it("opens a rendered link on ctrl click", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const host = mount("[Paper](https://example.com/docs)");
    const editor = editorFrom(host);
    const link = editor.querySelector("a");

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { button: 0, ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(open).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
  });

  it("selects an image resource without exposing its markdown and deletes it with Delete", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    expect(editor.querySelector("[data-resource-line='0']")?.classList.contains("is-selected")).toBe(true);
    expect(editor.textContent).not.toContain(marker);

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("After");
  });

  it("accepts text input on the line after a trailing image", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(marker);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`${marker}\nx`);
  });

  it("treats a resource as a navigable atomic line", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });

    expect(selectedResourceLine(editor)).toBe(0);

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`\n${marker}\nAfter`);
  });

  it("deletes a selected diagram from its resource action", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("flat"));
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.querySelector("[data-resource-delete-line='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("After");
  });

  it("moves an image resource by dragging the block itself", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.querySelector("[data-resource-surface='1']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    });

    const target = editor.querySelector("[data-line='2']");
    if (!target) {
      throw new Error("Missing drop target");
    }
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));

    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 30, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 10, clientY: 30, bubbles: true }));
    });

    expect(valueFrom(host)).toBe(`Before\nAfter\n${marker}`);
  });

  it("resizes an image resource and persists its width", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(marker);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    const surface = editor.querySelector("[data-resource-surface='0']");
    if (!surface) {
      throw new Error("Missing image surface");
    }
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 120));
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    act(() => {
      editor.querySelector("[data-image-resize-line='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 200, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 350, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 350, bubbles: true }));
    });

    expect(valueFrom(host)).toBe(`${marker}{width=350}`);
  });

  it("inserts an uploaded image at the slash command caret after the file picker blurs", async () => {
    const upload = vi.fn(async (): Promise<NoteImage> => ({
      id: "0123456789abcdef0123456789abcdef.png",
      name: "architecture.png",
      contentType: "image/png",
      size: 128,
      url: "/api/images/0123456789abcdef0123456789abcdef.png",
    }));
    const host = mount("Before\n/image\nAfter", null, upload);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 6 });
      editor.dispatchEvent(new KeyboardEvent("keyup", { key: "e", bubbles: true }));
    });

    const imageCommand = Array.from(host.querySelectorAll<HTMLButtonElement>(".slash-menu-row")).find((button) => button.textContent?.includes("Image"));
    act(() => {
      imageCommand?.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
    });

    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error("Missing image input");
    }
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "architecture.png", { type: "image/png" })],
    });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(upload).toHaveBeenCalledOnce();
    expect(valueFrom(host)).toBe("Before\n![architecture](/api/images/0123456789abcdef0123456789abcdef.png)\n\nAfter");
  });

  it("focuses after a trailing diagram marker", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("flat"));
    const host = mount(marker, { key: "open", placement: "last" });

    expect(valueFrom(host)).toBe(`${marker}\n`);
    expect(getSelectionRange(editorFrom(host))).toEqual({
      start: { line: 1, col: 0 },
      end: { line: 1, col: 0 },
    });
  });
  it("deletes a resource with Delete from in front of it", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("After");
  });

  it("deletes a resource with Delete from the end of the previous line", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 6 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Before");
  });

  it("replaces a selected resource with typed text", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("x\nAfter");
  });

  it("leaves a selected resource with the arrow keys", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });

    expect(editor.querySelector("[data-resource-line='0']")?.classList.contains("is-selected")).toBe(false);
    expect(getSelectionRange(editor)).toEqual({ start: { line: 1, col: 0 }, end: { line: 1, col: 0 } });
  });

  it("selects the resource when an arrow key reaches it", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 6 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(selectedResourceLine(editor)).toBe(1);

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(selectedResourceLine(editor)).toBeNull();
    expect(getSelectionRange(editor)).toEqual({ start: { line: 2, col: 0 }, end: { line: 2, col: 0 } });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(selectedResourceLine(editor)).toBe(1);

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(selectedResourceLine(editor)).toBeNull();
    expect(getSelectionRange(editor)).toEqual({ start: { line: 0, col: 6 }, end: { line: 0, col: 6 } });
  });

  it("steps across a bold word one visible character at a time with ArrowRight", () => {
    const host = mount("Use **bold** text.");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 0 });
    });

    const stops: number[] = [];
    for (let i = 0; i < "Use bold text.".length + 2; i++) {
      act(() => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      });
      const selection = window.getSelection();
      const raw = selection?.focusNode ? pointToCaret(editor, selection.focusNode, selection.focusOffset, false) : null;
      stops.push(raw?.col ?? -1);
    }

    expect(stops.slice(0, 14)).toEqual([1, 2, 3, 4, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18]);
    expect(stops.every((col) => col !== 5 && col !== 11)).toBe(true);
  });

  it("steps back across a bold word one visible character at a time with ArrowLeft", () => {
    const host = mount("Use **bold** text.");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 19 });
    });

    const stops: number[] = [];
    for (let i = 0; i < "Use bold text.".length + 2; i++) {
      act(() => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
      });
      const selection = window.getSelection();
      const raw = selection?.focusNode ? pointToCaret(editor, selection.focusNode, selection.focusOffset, false) : null;
      stops.push(raw?.col ?? -1);
    }

    expect(stops.slice(0, 14)).toEqual([17, 16, 15, 14, 13, 12, 9, 8, 7, 6, 3, 2, 1, 0]);
    expect(stops.every((col) => col !== 5 && col !== 11)).toBe(true);
  });

  it("keeps the caret visible when ArrowLeft reaches a bold word at the very start of the document", () => {
    const host = mount("**bold** text.");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 2 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });

    const selection = window.getSelection();
    const isHiddenMarker = selection?.focusNode?.nodeType === Node.TEXT_NODE && selection.focusNode.parentElement?.getAttribute("data-syntax-mark") === "1";
    expect(isHiddenMarker).toBe(false);
  });

  it("keeps the caret visible when ArrowRight reaches a bold word at the very end of the document", () => {
    const host = mount("Text **bold**");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Text **bold**".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });

    const selection = window.getSelection();
    const isHiddenMarker = selection?.focusNode?.nodeType === Node.TEXT_NODE && selection.focusNode.parentElement?.getAttribute("data-syntax-mark") === "1";
    expect(isHiddenMarker).toBe(false);
  });

  it("extends a selection across a bold word one visible character at a time with Shift+ArrowRight", () => {
    const host = mount("Use **bold** text.");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 0 });
    });

    const stops: number[] = [];
    for (let i = 0; i < "Use bold text.".length + 2; i++) {
      act(() => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
      });
      const selection = window.getSelection();
      const node = selection?.focusNode;
      const isHiddenMarker = node?.nodeType === Node.TEXT_NODE && node.parentElement?.getAttribute("data-syntax-mark") === "1";
      expect(isHiddenMarker).toBe(false);
      const raw = node ? pointToCaret(editor, node, selection!.focusOffset, false) : null;
      stops.push(raw?.col ?? -1);
    }

    expect(stops.slice(0, 14)).toEqual([1, 2, 3, 4, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18]);
  });

  it("keeps the selection anchor fixed while extending with Shift+ArrowRight", () => {
    const host = mount("Use **bold** text.");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 4 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 0, col: 4 }, end: { line: 0, col: 8 } });
  });

  it("navigates across a divider line and lands past it on the following line", () => {
    const host = mount("Before\n---\nAfter");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Before".length });
    });

    for (let i = 0; i < 3; i++) {
      act(() => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      });
    }

    expect(getSelectionRange(editor)).toEqual({ start: { line: 2, col: 0 }, end: { line: 2, col: 0 } });
  });

  it("moves to the end of the previous line with ArrowLeft from column 0", () => {
    const host = mount("First line\nSecond");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: "First line".length },
      end: { line: 0, col: "First line".length },
    });
  });

  it("moves to the end of the previous line with ArrowLeft from the visual start of a bullet", () => {
    const host = mount("First line\n- Item");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: "- ".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({
      start: { line: 0, col: "First line".length },
      end: { line: 0, col: "First line".length },
    });
  });

  it("moves to the start of the next line with ArrowRight from the end of a line", () => {
    const host = mount("First\nSecond line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "First".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 1, col: 0 }, end: { line: 1, col: 0 } });
  });

  it("clamps the column with ArrowDown onto a shorter line", () => {
    const host = mount("Long first line\nxy");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Long first line".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 1, col: 2 }, end: { line: 1, col: 2 } });
  });

  it("remembers the preferred column across a shorter line with ArrowDown", () => {
    const host = mount("Long first line\nxy\nAnother long line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Long first line".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({
      start: { line: 2, col: "Long first line".length },
      end: { line: 2, col: "Long first line".length },
    });
  });

  it("resets the preferred column once another key is pressed", () => {
    const host = mount("Long first line\nxy\nAnother long line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Long first line".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 2, col: 1 }, end: { line: 2, col: 1 } });
  });

  it("clamps the column with ArrowUp onto a shorter line", () => {
    const host = mount("xy\nLong second line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: "Long second line".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 0, col: 2 }, end: { line: 0, col: 2 } });
  });

  it("moves onto a divider line with ArrowRight, keeping exact column fidelity", () => {
    const host = mount("Before\n---\nAfter");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: "Before".length });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 1, col: 0 }, end: { line: 1, col: 0 } });
  });

  it("gives a divider's hidden marker a paintable caret without shifting the rule", () => {
    const host = mount("---");
    const editor = editorFrom(host);
    const style = editor.querySelector("[data-syntax-mark]")?.getAttribute("style") ?? "";

    expect(style).toContain("caret-color:var(--text)");
    expect(style).not.toContain("font-size:0");
    expect(style).toContain("display:inline-block");
    expect(style).toContain("width:0");
  });

  it("selects the next resource after deleting one that sits right above it", () => {
    const image = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const diagram = serializeDiagramMarker(createDefaultDiagram("flat"));
    const host = mount(`${image}\n${diagram}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`${diagram}\nAfter`);
    expect(selectedResourceLine(editorFrom(host))).toBe(0);
  });

  it("selects the resource when arrowing down from the line above", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    expect(selectedResourceLine(editor)).toBe(1);
  });

  it("stays inside the note while a resource is the first line", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const onFocusPrevious = vi.fn();
    const host = mount(`${marker}\nAfter`, null, undefined, { onFocusPrevious });
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });

    expect(selectedResourceLine(editor)).toBe(0);
    expect(onFocusPrevious).not.toHaveBeenCalled();
  });

  it("pushes the resource down with Enter and keeps it selected", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`\n${marker}\nAfter`);
    expect(selectedResourceLine(editorFrom(host))).toBe(1);
  });

  it("deletes a selected resource with a word-wise delete instead of splitting its markup", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 6 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Before\nAfter");
  });

  it("moves a selected resource with alt and the arrow keys", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 1);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
    });
    expect(valueFrom(host)).toBe(`${marker}\nBefore\nAfter`);
    expect(selectedResourceLine(editorFrom(host))).toBe(0);

    act(() => {
      editorFrom(host).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    });
    expect(valueFrom(host)).toBe(`Before\n${marker}\nAfter`);
    expect(selectedResourceLine(editorFrom(host))).toBe(1);
  });

  it("stops moving a resource at the edges of the note", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      selectResourceBlock(editor, 0);
    });

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe(`${marker}\nAfter`);
    expect(selectedResourceLine(editorFrom(host))).toBe(0);
  });

  it("shows an insertion bar while dragging and keeps the block selected after the drop", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    const target = editor.querySelector("[data-line='2']");
    if (!target) {
      throw new Error("Missing drop target");
    }
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 40));

    act(() => {
      editor.querySelector("[data-resource-surface='1']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 130, bubbles: true }));
    });

    expect(host.querySelector(".markdown-editor-drop-indicator")).not.toBeNull();
    expect(editor.querySelector("[data-resource-line='1']")?.classList.contains("is-dragging")).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 10, clientY: 130, bubbles: true }));
    });

    expect(host.querySelector(".markdown-editor-drop-indicator")).toBeNull();
    expect(valueFrom(host)).toBe(`Before\nAfter\n${marker}`);
    expect(selectedResourceLine(editorFrom(host))).toBe(2);
  });

  it("keeps the selection toolbar above the selection when there is room", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);
    const wrap = host.querySelector<HTMLElement>(".markdown-editor-wrap");
    if (!wrap) {
      throw new Error("Missing editor wrap");
    }
    vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 400));
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 200, 60, 20));

    act(() => {
      showSelectionToolbar(editor, 5, 10);
    });

    const toolbar = host.querySelector<HTMLElement>(".selection-toolbar");
    expect(toolbar?.classList.contains("is-below")).toBe(false);
    expect(toolbar?.style.top).toBe("192px");
    expect(toolbar?.style.left).toBe("130px");
  });

  it("flips the selection toolbar below the selection when it would overflow the top", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);
    const wrap = host.querySelector<HTMLElement>(".markdown-editor-wrap");
    if (!wrap) {
      throw new Error("Missing editor wrap");
    }
    vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 400));
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 4, 60, 20));

    act(() => {
      showSelectionToolbar(editor, 5, 10);
    });

    const toolbar = host.querySelector<HTMLElement>(".selection-toolbar");
    if (!toolbar) {
      throw new Error("Missing selection toolbar");
    }
    expect(toolbar.classList.contains("is-below")).toBe(true);

    // jsdom reports a zero-sized toolbar, so pin the real arithmetic with a measured height.
    Object.defineProperty(toolbar, "offsetHeight", { configurable: true, value: 44 });
    act(() => {
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    expect(toolbar.style.top).toBe("76px");
  });

  it("keeps the selection toolbar inside the editor near an edge", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);
    const wrap = host.querySelector<HTMLElement>(".markdown-editor-wrap");
    if (!wrap) {
      throw new Error("Missing editor wrap");
    }
    vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 400));
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 200, 4, 20));

    act(() => {
      showSelectionToolbar(editor, 5, 10);
    });

    const toolbar = host.querySelector<HTMLElement>(".selection-toolbar");
    if (!toolbar) {
      throw new Error("Missing selection toolbar");
    }
    Object.defineProperty(toolbar, "offsetWidth", { configurable: true, value: 240 });
    act(() => {
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });

    expect(toolbar.style.left).toBe("128px");
  });

  it("leaves the next line alone when the selection spills onto it", () => {
    const host = mount("salut la team\n---\ndadadada");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      // What a double or triple click produces: the range ends at column 0 of the next line.
      placeSelection(editor, { start: { line: 0, col: 0 }, end: { line: 1, col: 0 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("**salut la team**\n---\ndadadada");
  });

  it("keeps a divider intact when a spilled selection is turned into a link", () => {
    const host = mount("salut la team\n---\ndadadada");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 0 }, end: { line: 1, col: 0 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("[salut la team](https://)\n---\ndadadada");
  });

  it("still opens empty marks at a bare caret with ctrl b", () => {
    const host = mount("Make Paper bold");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 7 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Make Pa****per bold");
  });

  it("formats each line of a multi-line selection on its own", () => {
    const host = mount("first line\nsecond line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeSelection(editor, { start: { line: 0, col: 0 }, end: { line: 1, col: 6 } });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("**first line**\n**second** line");
  });

  it("inserts a divider without pushing a blank line between paragraphs", () => {
    const host = mount("Before\n/divider\nAfter");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 8 });
      editor.dispatchEvent(new KeyboardEvent("keyup", { key: "r", bubbles: true }));
    });

    const command = Array.from(host.querySelectorAll<HTMLButtonElement>(".slash-menu-row")).find((button) => button.textContent?.includes("Divider"));
    act(() => {
      command?.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Before\n---\nAfter");
    expect(getSelectionRange(editorFrom(host))).toEqual({ start: { line: 2, col: 0 }, end: { line: 2, col: 0 } });
  });

  it("leaves no line after a divider that ends the note", () => {
    const host = mount("Before\n/divider");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 8 });
      editor.dispatchEvent(new KeyboardEvent("keyup", { key: "r", bubbles: true }));
    });

    const command = Array.from(host.querySelectorAll<HTMLButtonElement>(".slash-menu-row")).find((button) => button.textContent?.includes("Divider"));
    act(() => {
      command?.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Before\n---");
    expect(editorFrom(host).querySelectorAll("[data-line]")).toHaveLength(2);
    // The caret rests at the end of the divider; Enter is what opens a line below it.
    expect(getSelectionRange(editorFrom(host))).toEqual({ start: { line: 1, col: 3 }, end: { line: 1, col: 3 } });

    act(() => {
      editorFrom(host).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("Before\n---\n");
  });

  it("aligns the selected lines from the toolbar and keeps the marker out of the text", () => {
    const host = mount("first line\nsecond line");
    const editor = editorFrom(host);

    act(() => {
      showSelectionToolbar(editor, 0, 5);
    });

    const button = host.querySelector<HTMLButtonElement>(".selection-toolbar button[aria-label='Align center']");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("first line{align=center}\nsecond line");
    const line = editorFrom(host).querySelector<HTMLElement>("[data-line='0']");
    expect(line?.style.textAlign).toBe("center");
    // The marker is stored, never shown.
    expect(line?.textContent).toBe("first line");
  });

  it("drops the marker when the selection goes back to the default", () => {
    const host = mount("first line{align=center}");
    const editor = editorFrom(host);

    act(() => {
      showSelectionToolbar(editor, 0, 5);
    });

    const button = host.querySelector<HTMLButtonElement>(".selection-toolbar button[aria-label='Justify']");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("first line");
  });

  it("keeps the alignment on the line when Enter splits it", () => {
    const host = mount("hello world{align=right}");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 5 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("hello{align=right}\n world{align=right}");
    expect(editorFrom(host).querySelector<HTMLElement>("[data-line='0']")?.style.textAlign).toBe("right");
  });

  it("keeps typing on an aligned line free of the marker", () => {
    const host = mount("hello{align=right}");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 0, col: 5 });
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "!", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("hello!{align=right}");
  });

  it("collapses a full selection to the bottom on ArrowDown", () => {
    const host = mount("first line\nsecond line\nthird line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({
      start: { line: 2, col: "third line".length },
      end: { line: 2, col: "third line".length },
    });
  });

  it("collapses a full selection to the top on ArrowUp", () => {
    const host = mount("first line\nsecond line\nthird line");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });

    expect(getSelectionRange(editor)).toEqual({ start: { line: 0, col: 0 }, end: { line: 0, col: 0 } });
  });

  it("selects the whole document with Ctrl+A while a diagram is selected", async () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("iso"));
    const host = mount(`${marker}\nsome text`);
    const editor = editorFrom(host);

    act(() => {
      editor.querySelector("[data-resource-surface='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    });
    expect(editorFrom(host).querySelector("[data-resource-line='0']")?.classList.contains("is-selected")).toBe(true);

    const prevented = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      editorFrom(host).dispatchEvent(prevented);
    });

    expect(prevented.defaultPrevented).toBe(true);
    expect(editorFrom(host).querySelector(".is-selected")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(getSelectionRange(editorFrom(host))).toEqual({
      start: { line: 0, col: 0 },
      end: { line: 1, col: "some text".length },
    });
  });
});

describe("MarkdownEditor resource copy, cut, and paste", () => {
  async function blobText(blob: Blob) {
    return await blob.text();
  }

  it("copies a selected diagram as marker text and an HTML preview, leaving the note unchanged", async () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("flat"));
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);
    const { write } = stubClipboard();

    act(() => {
      selectResourceBlock(editor, 0);
    });

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(write).toHaveBeenCalledOnce();
    const item = write.mock.calls[0]?.[0]?.[0] as { items: Record<string, Blob> };
    expect(await blobText(item.items["text/plain"])).toBe(marker);
    expect(await blobText(item.items["text/html"])).toContain("data-paper-resource");
    expect(valueFrom(host)).toBe(`${marker}\nAfter`);
  });

  it("cuts a selected image with Ctrl+X: writes it to the clipboard, then removes it", async () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);
    const { write } = stubClipboard();

    act(() => {
      selectResourceBlock(editor, 0);
    });

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true, bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(write).toHaveBeenCalledOnce();
    expect(valueFrom(host)).toBe("After");
  });

  it("copies a resource through its toolbar button, without the keyboard", async () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("iso"));
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);
    const { write } = stubClipboard();

    act(() => {
      selectResourceBlock(editor, 0);
    });

    await act(async () => {
      editor.querySelector("[data-resource-copy-line='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(write).toHaveBeenCalledOnce();
    expect(valueFrom(host)).toBe(`${marker}\nAfter`);
  });

  it("pastes a copied diagram as a new block with fresh node and edge ids", async () => {
    const original = createDefaultDiagram("flat");
    const marker = serializeDiagramMarker(original);
    const host = mount("Before\nAfter");
    const editor = editorFrom(host);

    act(() => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      pasteText(editor, marker);
    });

    const pastedLine = valueFrom(host).split("\n").find((line) => line.startsWith("![diagram:"));
    expect(pastedLine).toBeDefined();
    expect(pastedLine).not.toBe(marker);
    const pasted = parseDiagramMarker(pastedLine ?? "");
    expect(pasted?.nodes.map((node) => node.id)).not.toEqual(original.nodes.map((node) => node.id));
    expect(pasted?.edges.every((edge) => pasted.nodes.some((node) => node.id === edge.from) && pasted.nodes.some((node) => node.id === edge.to))).toBe(true);
  });

  it("re-uploads a pasted image into the destination note instead of reusing the source note's URL", async () => {
    const sourceUrl = "/api/images/0123456789abcdef0123456789abcdef.png";
    const marker = `![Architecture](${sourceUrl})`;
    const blob = new Blob(["image-bytes"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => ({
      id: "new",
      name: "Architecture.png",
      contentType: "image/png",
      size: blob.size,
      url: "/api/images/fedcba9876543210fedcba9876543210.png",
    }));
    const host = mount("Before\nAfter", null, upload);
    const editor = editorFrom(host);

    await act(async () => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      pasteText(editor, marker);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(sourceUrl);
    expect(upload).toHaveBeenCalledOnce();
    expect(valueFrom(host)).toContain("/api/images/fedcba9876543210fedcba9876543210.png");
    expect(valueFrom(host)).not.toContain(sourceUrl);
  });

  it("keeps the original reference when re-uploading a pasted image fails", async () => {
    const sourceUrl = "https://example.com/pic.png";
    const marker = `![Pic](${sourceUrl})`;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const upload = vi.fn();
    const host = mount("Before\nAfter", null, upload);
    const editor = editorFrom(host);

    await act(async () => {
      editor.focus();
      placeCaret(editor, { line: 1, col: 0 });
      pasteText(editor, marker);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upload).not.toHaveBeenCalled();
    expect(valueFrom(host)).toContain(sourceUrl);
  });
});

describe("editor reliability regressions", () => {
  it("keeps a cut resource if clipboard access fails", async () => {
    const source = "![image](/image.png)\nAfter";
    const host = mount(source), editor = editorFrom(host);
    const clipboard = stubClipboard();
    clipboard.write.mockRejectedValue(new Error("denied"));
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    act(() => selectResourceBlock(editor, 0));
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(valueFrom(host)).toBe(source);
    expect(host.querySelector("[role=status]")?.textContent).toContain("kept");
  });
  it("does not delete a block after the document changed during clipboard permission", async () => {
    const source = "![image](/image.png)\nAfter";
    const host = mount(source), editor = editorFrom(host);
    const clipboard = stubClipboard();
    let resolve!: () => void;
    clipboard.write.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    act(() => selectResourceBlock(editor, 0));
    act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true, bubbles: true, cancelable: true })));
    act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    await act(async () => resolve());
    expect(valueFrom(host)).toContain("![image](/image.png)");
    expect(host.querySelector("[role=status]")?.textContent).toContain("note changed");
  });
  it("does not render or intercept Enter during composition", () => {
    const host = mount("before"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 6 }); });
    const line = editor.firstElementChild!;
    act(() => editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    const enter = new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    act(() => {
      line.textContent = "before日本";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
      editor.dispatchEvent(enter);
    });
    expect(valueFrom(host)).toBe("before");
    expect(editor.firstElementChild).toBe(line);
    expect(enter.defaultPrevented).toBe(false);
    act(() => editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    expect(valueFrom(host)).toBe("before日本");
  });
  it("handles mobile Enter through beforeinput", () => {
    const host = mount("hello"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 2 }); });
    const event = new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true });
    act(() => editor.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(valueFrom(host)).toBe("he\nllo");
  });
  it("lets the browser move vertically inside a wrapped paragraph", () => {
    const host = mount("A long paragraph\nNext"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 4 }); });
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 0, 20));
    vi.spyOn(editor.firstElementChild!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 80));
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    act(() => editor.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  });
  it("keeps untouched paragraph DOM nodes while typing", () => {
    const host = mount("first\nsecond"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 5 }); });
    const second = editor.children[1];
    act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "!", bubbles: true, cancelable: true })));
    expect(valueFrom(host)).toBe("first!\nsecond");
    expect(editor.children[1]).toBe(second);
  });
  it("allows keyboard activation of task checkboxes", () => {
    const host = mount("- [ ] Task"), editor = editorFrom(host);
    const button = editor.querySelector<HTMLButtonElement>("[role=checkbox]")!;
    expect(button.getAttribute("aria-checked")).toBe("false");
    act(() => button.click());
    expect(valueFrom(host)).toBe("- [x] Task");
  });
});

it("tracks an upload position while text is inserted before it", async () => {
  let resolve!: (image: NoteImage) => void;
  const upload = vi.fn(() => new Promise<NoteImage>((done) => { resolve = done; }));
  const host = mount("Before\n\nAfter", null, upload), editor = editorFrom(host);
  act(() => { editor.focus(); placeCaret(editor, { line: 1, col: 0 }); editor.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true })); });
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "photo.png", { type: "image/png" })] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector("[role=status]")?.textContent).toContain("Uploading");
  act(() => {
    editor.focus(); placeCaret(editor, { line: 0, col: 0 });
    pasteText(editor, "New\n");
  });
  await act(async () => resolve({ id: "image", url: "/image.png", name: "photo.png", contentType: "image/png", size: 5 }));
  expect(valueFrom(host)).toBe("New\nBefore\n![photo](/image.png)\n\nAfter");
  expect(host.textContent).not.toContain("Uploading");
});

it("keeps focus on task controls without moving the caret into the text", () => {
  const host = mount("- [ ] Task"), editor = editorFrom(host);
  const button = editor.querySelector<HTMLButtonElement>("[role=checkbox]")!;
  act(() => button.focus());
  expect(document.activeElement).toBe(button);
  const key = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  act(() => button.dispatchEvent(key));
  expect(key.defaultPrevented).toBe(false);
  act(() => button.click());
  expect(valueFrom(host)).toBe("- [x] Task");
  expect(host.querySelector(".markdown-editor")).not.toBeNull();
});

it("routes native undo gestures to note history", () => {
  const onUndo = vi.fn(), onRedo = vi.fn();
  const host = mount("Text", null, undefined, { onUndo, onRedo });
  for (const inputType of ["historyUndo", "historyRedo"]) {
    const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
    act(() => editorFrom(host).dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  }
  expect(onUndo).toHaveBeenCalledOnce();
  expect(onRedo).toHaveBeenCalledOnce();
});

it("handles mobile text replacement of a selected resource", () => {
  const host = mount("![image](/image.png)\nAfter"), editor = editorFrom(host);
  act(() => selectResourceBlock(editor, 0));
  act(() => editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "é", bubbles: true, cancelable: true })));
  expect(valueFrom(host)).toBe("é\nAfter");
});

describe("visible caret at formatting boundaries", () => {
  const formats = [
    ["**test**", 2, 6], ["*test*", 1, 5], ["`test`", 1, 5],
    ["~~test~~", 2, 6], ["<u>test</u>", 3, 7], ["***test***", 3, 7],
  ] as const;
  const press = (editor: HTMLElement, key: string, shiftKey = false) => {
    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keyup", { key, shiftKey, bubbles: true, cancelable: true }));
    });
  };
  const rawCaret = (editor: HTMLDivElement) => {
    const selection = window.getSelection()!;
    expect(selection.focusNode?.parentElement?.closest('[data-syntax-mark="1"]')).toBeNull();
    return pointToCaret(editor, selection.focusNode!, selection.focusOffset, false);
  };
  it.each(formats)("moves past %s without a delimiter-only stop", (source, _start, end) => {
    const host = mount(`${source} salut la team ça va ?\n- yo ça va ou quoi ?`), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: end }); });
    press(editor, "ArrowRight");
    expect(rawCaret(editor)).toEqual({ line: 0, col: source.length + 1 });
    press(editor, "ArrowLeft");
    expect(rawCaret(editor)).toEqual({ line: 0, col: source.length });
    press(editor, "ArrowLeft");
    expect(rawCaret(editor)).toEqual({ line: 0, col: end - 1 });
  });
  it.each(formats)("leaves a line ending in %s", (source, _start, end) => {
    const host = mount(`${source}\nAfter`), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: end }); });
    press(editor, "ArrowRight");
    expect(rawCaret(editor)).toEqual({ line: 1, col: 0 });
    press(editor, "ArrowLeft");
    expect(rawCaret(editor)).toEqual({ line: 0, col: end });
    press(editor, "ArrowLeft");
    expect(rawCaret(editor)).toEqual({ line: 0, col: end - 1 });
  });
  it.each(formats)("deletes visible text at the end of %s without breaking its wrapper", (source, _start, end) => {
    const host = mount(`${source} next`), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: end }); });
    press(editor, "Backspace");
    expect(valueFrom(host)).toBe(`${source.replace("test", "tes")} next`);
  });
  it.each(["**x**", "*x*", "`x`", "~~x~~", "<u>x</u>", "***x***"])("removes the empty wrapper when deleting the final character in %s", (source) => {
    const host = mount(`${source} next`), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: source.indexOf("x") + 1 }); });
    press(editor, "Backspace");
    expect(valueFrom(host)).toBe(" next");
  });
  it("types outside all nested closing markers", () => {
    const host = mount("***test***"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 7 }); });
    press(editor, "!");
    expect(valueFrom(host)).toBe("***test***!");
  });
  it("extends a selection past formatting without a hidden stop", () => {
    const host = mount("**test** next"), editor = editorFrom(host);
    act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 5 }); });
    press(editor, "ArrowRight", true);
    expect(rawCaret(editor)).toEqual({ line: 0, col: 6 });
    press(editor, "ArrowRight", true);
    expect(rawCaret(editor)).toEqual({ line: 0, col: 9 });
    expect(window.getSelection()?.anchorOffset).toBe(3);
  });
});

it("preserves formatting when a mobile keyboard deletes at its boundary", () => {
  const host = mount("**test** next"), editor = editorFrom(host);
  act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 6 }); });
  act(() => editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true })));
  expect(valueFrom(host)).toBe("**tes** next");
});

it("does not delete an invisible opening marker at the document start", () => {
  const host = mount("**test**"), editor = editorFrom(host);
  act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 2 }); });
  act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })));
  expect(valueFrom(host)).toBe("**test**");
});

it("deletes a selection ending at a formatted word without removing its closing markers", () => {
  const host = mount("**test** next"), editor = editorFrom(host);
  act(() => {
    editor.focus();
    placeSelection(editor, { start: { line: 0, col: 5 }, end: { line: 0, col: 6 } });
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
  });
  expect(valueFrom(host)).toBe("**tes** next");
});

it("removes both delimiters when replacing an entirely selected formatted word", () => {
  const host = mount("***test*** next"), editor = editorFrom(host);
  act(() => {
    editor.focus();
    placeSelection(editor, { start: { line: 0, col: 3 }, end: { line: 0, col: 7 } });
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
  });
  expect(valueFrom(host)).toBe("x next");
});

it("handles held arrows and immediate reversal across formatted and empty lines", () => {
  const source = "**ab**\n\n*cd*\n`ef`\n~~gh~~";
  const host = mount(source), editor = editorFrom(host);
  act(() => { editor.focus(); placeCaret(editor, { line: 0, col: 2 }); });
  const rawCaret = () => {
    const selection = window.getSelection()!;
    return pointToCaret(editor, selection.focusNode!, selection.focusOffset, false);
  };
  for (const key of ["ArrowRight", "ArrowLeft"]) {
    for (let i = 0; i < 12; i++) {
      const before = rawCaret();
      act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key, repeat: i > 0, bubbles: true, cancelable: true })));
      expect(rawCaret()).not.toEqual(before);
    }
  }
  expect(rawCaret()).toEqual({ line: 0, col: 2 });
  act(() => editor.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true })));
  expect(rawCaret()).toEqual({ line: 0, col: 2 });
  expect(valueFrom(host)).toBe(source);
});

it("updates link syntax on line crossings while preserving unrelated DOM", () => {
  const host = mount("[a](https://example.com)\nb\n```\n**literal**\n```"), editor = editorFrom(host);
  act(() => { editor.focus(); placeCaret(editor, { line: 1, col: 0 }); });
  const code = editor.children[3];
  act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
  expect(editor.children[0].textContent).toBe("[a](https://example.com)");
  expect(editor.children[0].querySelectorAll("[data-syntax-mark]")).toHaveLength(0);
  act(() => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
  expect(editor.children[0].querySelectorAll("[data-syntax-mark]").length).toBeGreaterThan(0);
  expect(editor.children[3]).toBe(code);
  expect(code.textContent).toBe("**literal**");
});

it.each(["toolbar", "shortcut"])("removes bold from only the selected word using the %s", (method) => {
  const host = mount("**salut la team**"), editor = editorFrom(host);
  act(() => {
    editor.focus();
    const text = editor.querySelector("strong")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 9);
    range.setEnd(text, 13);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  act(() => {
    if (method === "toolbar") {
      host.querySelector(".selection-toolbar button[aria-label='Bold']")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } else {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    }
  });
  expect(valueFrom(host)).toBe("**salut la** team");
  expect(editor.querySelector("strong")!.textContent).toBe("salut la");
});
