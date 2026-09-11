import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createDefaultDiagram, serializeDiagramMarker } from "../lib/diagram";
import type { Note } from "../types/note";
import { NotesColumn } from "./NotesColumn";

let root: Root | null = null;
const NL = String.fromCharCode(10);

function noteWith(content: string): Note {
  return {
    id: "n1",
    title: "Rich note",
    content,
    tags: [],
    favorite: false,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

function mount(note: Note) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <NotesColumn
        title="Notes"
        notes={[note]}
        activeId={null}
        selectedIds={[]}
        query=""
        activeTags={[]}
        sidebarHidden={false}
        focusRequest={0}
        onQueryChange={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onClearFilters={vi.fn()}
        onNew={vi.fn()}
        onSelect={vi.fn()}
        onFavoriteNote={vi.fn()}
        onDuplicateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onNavigate={vi.fn()}
        onFocusTitle={vi.fn()}
        onFocusContent={vi.fn()}
        onToggleSidebar={vi.fn()}
        onResizeStart={vi.fn()}
        onResizeBy={vi.fn()}
      />,
    );
  });
  return host.querySelector(".note-card p") as HTMLParagraphElement;
}

beforeEach(() => {
  if (!Range.prototype.getBoundingClientRect) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
  }
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("note summary preview", () => {
  it("renders inline formatting", () => {
    const p = mount(noteWith("Plain **bold** and *italic* and ~~gone~~ and <u>underlined</u> and `code`"));
    expect(p.querySelector("strong")?.textContent).toBe("bold");
    expect(p.querySelector("em")?.textContent).toBe("italic");
    expect(p.querySelector("s")?.textContent).toBe("gone");
    expect(p.querySelector("u")?.textContent).toBe("underlined");
    expect(p.querySelector("code")?.textContent).toBe("code");
  });

  it("keeps a link's text but drops the link itself", () => {
    const p = mount(noteWith("See [the docs](https://example.com/page) now"));
    expect(p.textContent).toContain("the docs");
    expect(p.querySelector("a")).toBeNull();
    expect(p.textContent).not.toContain("example.com");
  });

  it("skips dividers, standalone images and diagrams", () => {
    const diagram = serializeDiagramMarker(createDefaultDiagram("iso"));
    const p = mount(
      noteWith(
        ["Intro line", "---", "![shot](/api/images/0123456789abcdef0123456789abcdef.png)", diagram, "Outro line"].join(NL),
      ),
    );
    expect(p.textContent).toContain("Intro line");
    expect(p.textContent).toContain("Outro line");
    expect(p.querySelector("img")).toBeNull();
    expect(p.textContent).not.toContain("diagram:");
    expect(p.textContent).not.toContain("(diagram)");
    expect(p.textContent).not.toContain("/api/images/");
  });

  it("strips heading and list markers so the preview reads as prose", () => {
    const p = mount(noteWith(["# Title here", "- first item", "> quoted"].join(NL)));
    expect(p.textContent).toContain("Title here");
    expect(p.textContent).toContain("first item");
    expect(p.textContent).not.toContain("#");
    expect(p.textContent).not.toMatch(/^\s*-\s/);
  });

  it("falls back to No content for an empty or resource-only note", () => {
    const diagram = serializeDiagramMarker(createDefaultDiagram("flat"));
    expect(mount(noteWith("")).textContent).toBe("No content");
    expect(mount(noteWith(diagram)).textContent).toBe("No content");
  });
});

describe("note context menu", () => {
  function mountColumn(note: Note) {
    const spies = { onDuplicateNote: vi.fn(), onDeleteNote: vi.fn(), onFavoriteNote: vi.fn() };
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <NotesColumn
          title="Notes"
          notes={[note]}
          activeId={null}
          selectedIds={[]}
          query=""
          activeTags={[]}
          sidebarHidden={false}
          focusRequest={0}
          onQueryChange={vi.fn()}
          onAddTag={vi.fn()}
          onRemoveTag={vi.fn()}
          onClearFilters={vi.fn()}
          onNew={vi.fn()}
          onSelect={vi.fn()}
          onFavoriteNote={spies.onFavoriteNote}
          onDuplicateNote={spies.onDuplicateNote}
          onDeleteNote={spies.onDeleteNote}
          onNavigate={vi.fn()}
          onFocusTitle={vi.fn()}
          onFocusContent={vi.fn()}
          onToggleSidebar={vi.fn()}
          onResizeStart={vi.fn()}
          onResizeBy={vi.fn()}
        />,
      );
    });
    return { host, spies };
  }

  it("opens on right-click and runs the chosen action", () => {
    const { host, spies } = mountColumn(noteWith("Body"));
    expect(host.querySelector(".note-context-menu")).toBeNull();

    act(() => {
      host.querySelector(".note-card")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const menu = host.querySelector(".note-context-menu");
    expect(menu).not.toBeNull();

    const duplicate = Array.from(menu!.querySelectorAll("button")).find((button) => /duplicate/i.test(button.textContent ?? ""));
    act(() => duplicate?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

    expect(spies.onDuplicateNote).toHaveBeenCalledOnce();
    expect(spies.onDuplicateNote.mock.calls[0][0].id).toBe("n1");
    expect(host.querySelector(".note-context-menu")).toBeNull();
  });
});
