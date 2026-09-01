import { act, useState } from "react";
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
}: {
  initial: string;
  focusRequest?: { key: string; placement: "start" | "end" | "last" } | null;
  onUploadImage?: (file: File) => Promise<NoteImage>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownEditor value={value} onChange={setValue} focusRequest={focusRequest} onUploadImage={onUploadImage} />
      <output data-value>{value}</output>
    </>
  );
}

function mount(
  initial: string,
  focusRequest: { key: string; placement: "start" | "end" | "last" } | null = null,
  onUploadImage?: (file: File) => Promise<NoteImage>,
) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ControlledEditor initial={initial} focusRequest={focusRequest} onUploadImage={onUploadImage} />);
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
      editor.querySelector("[data-resource-surface='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(editor.querySelector("[data-resource-line='0']")?.classList.contains("is-selected")).toBe(true);
    expect(editor.textContent).not.toContain(marker);

    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("After");
  });

  it("deletes a selected diagram from its resource action", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram("flat"));
    const host = mount(`${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.querySelector("[data-resource-surface='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    });

    act(() => {
      editor.querySelector("[data-resource-delete-line='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    });

    expect(valueFrom(host)).toBe("After");
  });

  it("moves an image resource from its drag handle", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = mount(`Before\n${marker}\nAfter`);
    const editor = editorFrom(host);

    act(() => {
      editor.querySelector("[data-resource-drag-line='1']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
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
      editor.querySelector("[data-resource-surface='0']")?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
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
});
