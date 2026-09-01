import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/note";
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
});

function mount(aiResult: AIResult | null) {
  const host = document.createElement("div");
  const onApplyResult = vi.fn();
  const onDismissResult = vi.fn();
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
        onAssist={vi.fn()}
        onCaretLineChange={vi.fn()}
        onApplyResult={onApplyResult}
        onDismissResult={onDismissResult}
        theme="light"
      />,
    );
  });
  return { host, onApplyResult, onDismissResult };
}
