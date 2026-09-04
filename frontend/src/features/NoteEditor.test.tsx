import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/note";
import { createDefaultDiagram, serializeDiagramMarker } from "../lib/diagram";
import { getSelectionRange, placeCaret } from "../lib/markdown/dom";
import { NoteEditor, type AIResult } from "./NoteEditor";

let root: Root | null = null;

const note: Note = {
  id: "note-1",
  title: "Paper architecture",
  content: "Client calls an API backed by PostgreSQL.",
  tags: ["architecture"],
  favorite: false,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("NoteEditor AI integration", () => {
  it("docks structured AI results outside the scrolling document", () => {
    const result: AIResult = {
      action: "suggest_tags",
      status: "ready",
      text: "kubernetes, Cloud, #architecture",
    };
    const { host, onApplyResult, onDismissResult } = mount(result);
    const dock = host.querySelector(".ai-result-dock");
    const scroll = host.querySelector(".editor-scroll");

    expect(dock).not.toBeNull();
    expect(scroll?.contains(dock)).toBe(false);
    expect(Array.from(host.querySelectorAll(".ai-result-tags span")).map((tag) => tag.textContent)).toEqual([
      "#kubernetes",
      "#cloud",
      "#architecture",
    ]);
    expect(host.querySelector(".ai-result header small")?.textContent).toBe("3 items");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true })));
    expect(onApplyResult).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    expect(onDismissResult).toHaveBeenCalledOnce();
  });

  it("opens the native diagram dialog with note context", () => {
    const { host } = mount(null);
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>(".ai-bar button")).find(
      (item) => item.textContent === "Diagram",
    );

    act(() => button?.click());

    const dialog = host.querySelector<HTMLDialogElement>(".diagram-ai-dialog");
    const prompt = dialog?.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "";
    expect(dialog?.open).toBe(true);
    expect(prompt).toContain("Title: Paper architecture");
    expect(prompt).toContain("Tags: architecture");
    expect(prompt).toContain(note.content);
  });

  it("does not leave a stale caret stuck in front of a leading resource when switching notes", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
    // Note A: plain text, caret placed deep in it.
    act(() => render({ ...note, id: "a", content: "one\ntwo\nthree" }, null));
    const editorA = host.querySelector<HTMLDivElement>(".markdown-editor")!;
    act(() => {
      editorA.focus();
      placeCaret(editorA, { line: 2, col: 3 });
      editorA.dispatchEvent(new KeyboardEvent("keyup", { key: "e", bubbles: true }));
    });

    // Note B: starts with a diagram. Switching must not carry A's caret onto B's first line.
    const marker = serializeDiagramMarker(createDefaultDiagram("iso"));
    act(() => render({ ...note, id: "b", content: `${marker}\nAfter` }, null));

    const editorB = host.querySelector<HTMLDivElement>(".markdown-editor")!;
    // The editor remounts fresh: no caret parked in front of the diagram.
    expect(getSelectionRange(editorB)).toBeNull();
    expect(document.activeElement).not.toBe(editorB);
  });

  it("supports compact navigation and AI actions", () => {
    const { host, onBackToNotes } = mount(null);

    act(() => host.querySelector<HTMLButtonElement>(".editor-back-button")?.click());
    expect(onBackToNotes).toHaveBeenCalledOnce();

    const menu = host.querySelector<HTMLDetailsElement>(".ai-bar-menu");
    const summarize = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
      (button) => button.textContent === "Summarize",
    );
    act(() => {
      menu?.setAttribute("open", "");
      summarize?.click();
    });
    expect(menu?.hasAttribute("open")).toBe(false);
  });
});

function render(target: Note, aiResult: AIResult | null, onApplyResult = vi.fn(), onDismissResult = vi.fn(), onBackToNotes = vi.fn()) {
  root?.render(
    <NoteEditor
      note={target}
      tagDraft=""
      aiResult={aiResult}
      titleFocusRequest={null}
      contentFocusRequest={null}
      onTitleChange={vi.fn()}
      onContentChange={vi.fn()}
      onUploadImage={vi.fn()}
      onTagDraftChange={vi.fn()}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onToggleFavorite={vi.fn()}
      onDelete={vi.fn()}
      onSearch={vi.fn()}
      onToggleTheme={vi.fn()}
      onFocusNoteList={vi.fn()}
      onBackToNotes={onBackToNotes}
      onAssist={vi.fn()}
      onCaretLineChange={vi.fn()}
      onApplyResult={onApplyResult}
      onDismissResult={onDismissResult}
      theme="light"
    />,
  );
}

function mount(aiResult: AIResult | null) {
  const host = document.createElement("div");
  const onApplyResult = vi.fn();
  const onDismissResult = vi.fn();
  const onBackToNotes = vi.fn();
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <NoteEditor
        note={note}
        tagDraft=""
        aiResult={aiResult}
        titleFocusRequest={null}
        contentFocusRequest={null}
        onTitleChange={vi.fn()}
        onContentChange={vi.fn()}
        onUploadImage={vi.fn()}
        onTagDraftChange={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
        onSearch={vi.fn()}
        onToggleTheme={vi.fn()}
        onFocusNoteList={vi.fn()}
        onBackToNotes={onBackToNotes}
        onAssist={vi.fn()}
        onCaretLineChange={vi.fn()}
        onApplyResult={onApplyResult}
        onDismissResult={onDismissResult}
        theme="light"
      />,
    );
  });
  return { host, onApplyResult, onDismissResult, onBackToNotes };
}
