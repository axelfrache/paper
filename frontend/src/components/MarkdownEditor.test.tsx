import { act, useState } from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createDefaultDiagram, serializeDiagramMarker } from "../lib/diagram";
import { placeCaret, placeSelection, getSelectionRange } from "../lib/markdown/dom";
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
      host.querySelector(".selection-toolbar button[aria-label='Bold']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
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
      host.querySelector(".selection-toolbar button[aria-label='Bold']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
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
      host.querySelector(".selection-toolbar button[aria-label='Link']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
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
      host.querySelector(".selection-toolbar button[aria-label='Link']")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
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
});
