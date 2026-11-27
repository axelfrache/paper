import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatWithPaper, titleChat } from "./api";
import { threadTitle, usePaperChat, type PaperChat } from "./usePaperChat";
import { chatPatch } from "./paperChat";
import type { Note } from "../types/note";
vi.mock("./api", () => ({ chatWithPaper: vi.fn(), titleChat: vi.fn() }));
const note: Note = {
  id: "a",
  title: "Draft",
  content: "Unsaved draft",
  tags: [],
  favorite: false,
  createdAt: "",
  updatedAt: "",
};
let root: Root;
let host: HTMLDivElement;
let chat: PaperChat;
function Harness({
  notes = [note],
  userId,
}: {
  notes?: Note[];
  userId?: string;
}) {
  chat = usePaperChat(notes, userId);
  return null;
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(chatWithPaper).mockReset();
  vi.mocked(titleChat).mockReset();
  vi.mocked(titleChat).mockRejectedValue(new Error("no title"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe("Paper conversation titles", () => {
  it("names a conversation after its first answer, once", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({
      text: "Answer",
      sourceIds: [],
    });
    vi.mocked(titleChat).mockResolvedValue({ title: "Haute dispo" });
    await act(async () => {
      await chat.send("What is missing for HA?");
    });
    expect(titleChat).toHaveBeenCalledWith({
      question: "What is missing for HA?",
      answer: "Answer",
    });
    expect(threadTitle(chat.thread)).toBe("Haute dispo");
    await act(async () => {
      await chat.send("And storage?");
    });
    expect(titleChat).toHaveBeenCalledTimes(1);
  });
  it("falls back to the question when titling fails", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({
      text: "Answer",
      sourceIds: [],
    });
    await act(async () => {
      await chat.send("What is missing for HA?");
    });
    expect(threadTitle(chat.thread)).toBe("What is missing for HA?");
  });
});
describe("Paper conversation persistence", () => {
  it("restores saved conversations for the same user only", async () => {
    vi.useFakeTimers();
    vi.mocked(chatWithPaper).mockResolvedValue({ text: "ok", sourceIds: [] });
    act(() => root.render(<Harness userId="u1" />));
    await act(async () => {
      await chat.send("Remember me", undefined, { scope: "note", noteId: "a" });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<Harness userId="u1" />));
    expect(chat.history.map((item) => item.turns[0].question)).toEqual([
      "Remember me",
    ]);
    act(() => chat.show({ scope: "note", noteId: "a" }));
    expect(chat.thread.turns[0].question).toBe("Remember me");
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<Harness userId="u2" />));
    expect(chat.history).toHaveLength(0);
  });
});
describe("Paper conversation history", () => {
  it("keeps previous conversations when starting a new one", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({ text: "ok", sourceIds: [] });
    await act(async () => {
      await chat.send("First question", undefined, {
        scope: "note",
        noteId: "a",
      });
    });
    const first = chat.thread.id;
    act(() => chat.reset());
    expect(chat.thread.id).not.toBe(first);
    expect(chat.thread.turns).toHaveLength(0);
    expect(chat.thread.context).toMatchObject({ scope: "note", noteId: "a" });
    expect(chat.history.map((item) => item.id)).toEqual([first]);
    await act(async () => {
      await chat.send("Second question");
    });
    expect(chat.history).toHaveLength(2);
    expect(chat.history[0].turns[0].question).toBe("Second question");
    // reopening the same context resumes the newest conversation
    act(() => chat.show({ scope: "note", noteId: "a" }));
    expect(chat.thread.turns[0].question).toBe("Second question");
    act(() => chat.select(first));
    expect(chat.thread.turns[0].question).toBe("First question");
    expect(chat.history[0].id).toBe(first);
  });
  it("does not stack empty conversations", () => {
    act(() => chat.reset());
    act(() => chat.reset());
    expect(Object.keys(chat.threads)).toHaveLength(1);
    expect(chat.history).toHaveLength(0);
  });
  it("removes a conversation and falls back to another one", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({ text: "ok", sourceIds: [] });
    await act(async () => {
      await chat.send("Keep me", undefined, { scope: "note", noteId: "a" });
    });
    const keep = chat.thread.id;
    act(() => chat.reset());
    await act(async () => {
      await chat.send("Delete me");
    });
    const doomed = chat.thread.id;
    act(() => chat.remove(doomed));
    expect(chat.thread.id).toBe(keep);
    expect(chat.threads[doomed]).toBeUndefined();
    act(() => chat.remove(keep));
    expect(chat.history).toHaveLength(0);
    expect(chat.thread.turns).toHaveLength(0);
  });
});
describe("Paper conversations", () => {
  it("sends pinned notes and keeps them when the scope is shown again", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({ text: "ok", sourceIds: [] });
    act(() => chat.show({ scope: "all" }));
    act(() => chat.pinNote("b"));
    act(() => chat.pinNote("b"));
    act(() => chat.show({ scope: "all" }));
    expect(chat.thread.context.noteIds).toEqual(["b"]);
    await act(async () => {
      await chat.send("Compare");
    });
    expect(vi.mocked(chatWithPaper).mock.calls[0][0].noteIds).toEqual(["b"]);
    act(() => chat.unpinNote("b"));
    await act(async () => {
      await chat.send("Again");
    });
    expect(vi.mocked(chatWithPaper).mock.calls[1][0].noteIds).toBeUndefined();
  });
  it("sends unsaved context and follows up with completed messages", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({
      text: "Summary",
      sourceIds: ["a"],
    });
    await act(async () => {
      await chat.send("Summarize", "summarize", { scope: "note", noteId: "a" });
    });
    expect(vi.mocked(chatWithPaper).mock.calls[0][0].draft?.content).toBe(
      "Unsaved draft",
    );
    await act(async () => {
      await chat.send("Shorter");
    });
    expect(vi.mocked(chatWithPaper).mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Summarize" },
      { role: "assistant", content: "Summary" },
      { role: "user", content: "Shorter" },
    ]);
    expect(vi.mocked(chatWithPaper).mock.calls[1][0].action).toBe("summarize");
    act(() => chat.close());
    act(() => chat.show({ scope: "note", noteId: "a" }));
    expect(chat.thread.turns).toHaveLength(2);
  });
  it("isolates conversations and marks late responses unread", async () => {
    let resolve!: (value: { text: string; sourceIds: string[] }) => void;
    vi.mocked(chatWithPaper).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let request!: Promise<void>;
    act(() => {
      request = chat.send("Question", undefined, {
        scope: "note",
        noteId: "a",
      });
    });
    act(() => chat.show({ scope: "all" }));
    await act(async () => {
      resolve({ text: "Answer", sourceIds: ["a"] });
      await request;
    });
    expect(chat.thread.turns).toHaveLength(0);
    expect(chat.unread).toBe(true);
    act(() => chat.show({ scope: "note", noteId: "a" }));
    expect(chat.thread.turns[0].text).toBe("Answer");
  });
  it("aborts and ignores late responses after cancellation or a new conversation", async () => {
    let resolve!: (value: { text: string; sourceIds: string[] }) => void;
    vi.mocked(chatWithPaper).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let request!: Promise<void>;
    act(() => {
      request = chat.send("Question", undefined, {
        scope: "note",
        noteId: "a",
      });
    });
    const signal = vi.mocked(chatWithPaper).mock.calls[0][1];
    act(() => chat.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve({ text: "Late", sourceIds: [] });
      await request;
    });
    expect(chat.thread.turns[0].status).toBe("cancelled");
    expect(chat.thread.draft).toBe("Question");
    expect(chat.thread.turns[0].text).toBe("");
    act(() => chat.reset());
    expect(chat.thread.turns).toHaveLength(0);
  });
  it("restores a failed prompt and excludes the failure from subsequent history", async () => {
    vi.mocked(chatWithPaper)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue({ text: "Recovered", sourceIds: [] });
    await act(async () => {
      await chat.send("Question", undefined, { scope: "note", noteId: "a" });
    });
    expect(chat.thread.draft).toBe("Question");
    expect(chat.thread.turns[0].error).toBe("Unavailable");
    await act(async () => {
      await chat.send(chat.thread.draft);
    });
    expect(vi.mocked(chatWithPaper).mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Question" },
    ]);
  });
  it("sends only the selected passage and rejects edits to that passage", async () => {
    vi.mocked(chatWithPaper).mockResolvedValue({
      text: "Answer",
      sourceIds: [],
    });
    const selection = {
      text: "draft",
      content: note.content,
      range: { start: { line: 0, col: 8 }, end: { line: 0, col: 13 } },
    };
    await act(async () => {
      await chat.send("Explain", undefined, {
        scope: "selection",
        noteId: "a",
        selection,
      });
    });
    expect(vi.mocked(chatWithPaper).mock.calls[0][0].draft?.content).toBe(
      "draft",
    );
    act(() =>
      root.render(
        <Harness notes={[{ ...note, content: "Unsaved changed" }]} />,
      ),
    );
    await act(async () => {
      await chat.send("Again");
    });
    expect(chat.thread.turns.at(-1)?.status).toBe("error");
    expect(chatWithPaper).toHaveBeenCalledTimes(1);
    await act(async () => {
      await chat.send("Explain again", undefined, {
        scope: "selection",
        noteId: "a",
        selection: {
          ...selection,
          text: "changed",
          range: { start: { line: 0, col: 8 }, end: { line: 0, col: 15 } },
          content: "Unsaved changed",
        },
      });
    });
    expect(chatWithPaper).toHaveBeenCalledTimes(2);
  });
  it("preserves a new draft when a pending response fails", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(chatWithPaper).mockImplementation(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    let request!: Promise<void>;
    act(() => {
      request = chat.send("Question", undefined, {
        scope: "note",
        noteId: "a",
      });
    });
    act(() => chat.setDraft("Next question"));
    await act(async () => {
      reject(new Error("Unavailable"));
      await request;
    });
    expect(chat.thread.draft).toBe("Next question");
  });
});

it("proposes a native diagram after rewrite and continues after applying a selection", async () => {
  vi.mocked(chatWithPaper)
    .mockResolvedValueOnce({ text: "Rewritten", sourceIds: ["a"] })
    .mockResolvedValueOnce({
      text: '```paper-diagram\n{"mode":"iso","nodes":[{"id":"api","kind":"server","label":"API"}],"edges":[]}\n```',
      sourceIds: ["a"],
    })
    .mockResolvedValue({ text: "Next answer", sourceIds: ["a"] });
  await act(async () => {
    await chat.send("Rewrite", "clean_up", {
      scope: "selection",
      noteId: "a",
      selection: {
        text: note.content,
        content: note.content,
        range: {
          start: { line: 0, col: 0 },
          end: { line: 0, col: note.content.length },
        },
      },
    });
  });
  act(() => {
    chat.markApplied(chat.thread.turns[0].id, note, {
      ...note,
      content: "Rewritten",
    });
    root.render(<Harness notes={[{ ...note, content: "Rewritten" }]} />);
  });
  await act(async () => {
    await chat.send("ajoute un diagramme isométrique à la suite");
  });
  expect(chat.thread.turns[1].operation).toBe("append_diagram");
  expect(chat.thread.turns[1].text).toMatch(/^!\[diagram:/);
  expect(chat.thread.turns[1].action).toBeUndefined();
  expect(vi.mocked(chatWithPaper).mock.calls[1][0].draft?.content).toBe(
    "Rewritten",
  );
  await act(async () => {
    await chat.send("Continue");
  });
  expect(chat.thread.turns[2].status).toBe("ready");
});

it("rewrites a multiline selection twice using the applied content, without reload", async () => {
  const original = { ...note, content: "Intro\nLong selected text\nOutro" };
  act(() => root.render(<Harness notes={[original]} />));
  vi.mocked(chatWithPaper)
    .mockResolvedValueOnce({ text: "Clearer\npassage", sourceIds: ["a"] })
    .mockResolvedValueOnce({ text: "Short", sourceIds: ["a"] });
  await act(async () => {
    await chat.send("Rewrite", "clean_up", {
      scope: "selection",
      noteId: "a",
      selection: {
        text: "Long selected text",
        content: original.content,
        range: { start: { line: 1, col: 0 }, end: { line: 1, col: 18 } },
      },
    });
  });
  const first = chat.thread.turns[0];
  const updated = { ...original, ...chatPatch(first, original) };
  act(() => {
    chat.markApplied(first.id, original, updated);
    root.render(<Harness notes={[updated]} />);
  });
  expect(chat.thread.context.selection?.text).toBe("Clearer\npassage");
  expect(chat.thread.context.selection?.range).toEqual({
    start: { line: 1, col: 0 },
    end: { line: 2, col: 7 },
  });
  await act(async () => {
    await chat.send("Plus court");
  });
  expect(vi.mocked(chatWithPaper).mock.calls[1][0]).toMatchObject({
    scope: "selection",
    selection: "Clearer\npassage",
    action: "clean_up",
    draft: { content: "Clearer\npassage" },
  });
  expect(chatPatch(chat.thread.turns[1], updated)?.content).toBe(
    "Intro\nShort\nOutro",
  );
  expect(chatPatch(first, updated)).toBeNull();
});

it("recovers from an invalid selection by continuing on the current note", async () => {
  vi.mocked(chatWithPaper).mockResolvedValue({
    text: "Answer",
    sourceIds: ["a"],
  });
  await act(async () => {
    await chat.send("Rewrite", "clean_up", {
      scope: "selection",
      noteId: "a",
      selection: {
        text: note.content,
        content: note.content,
        range: {
          start: { line: 0, col: 0 },
          end: { line: 0, col: note.content.length },
        },
      },
    });
  });
  const edited = { ...note, content: "Manually replaced" };
  act(() => root.render(<Harness notes={[edited]} />));
  await act(async () => {
    await chat.send("Plus court");
  });
  expect(chat.thread.turns.at(-1)?.status).toBe("error");
  expect(chatWithPaper).toHaveBeenCalledTimes(1);
  act(() => chat.continueOnNote());
  await act(async () => {
    await chat.send("Plus court");
  });
  expect(vi.mocked(chatWithPaper).mock.calls[1][0]).toMatchObject({
    scope: "note",
    draft: { content: edited.content },
  });
  expect(chat.thread.context.selection).toBeUndefined();
});

it("uses the applied whole-note draft for the next rewrite and blocks stale proposals", async () => {
  vi.mocked(chatWithPaper)
    .mockResolvedValueOnce({ text: "Clearer note", sourceIds: ["a"] })
    .mockResolvedValueOnce({ text: "Short note", sourceIds: ["a"] });
  await act(async () => {
    await chat.send("Rewrite", "clean_up", { scope: "note", noteId: "a" });
  });
  const first = chat.thread.turns[0];
  const updated = { ...note, ...chatPatch(first, note) };
  act(() => {
    chat.markApplied(first.id, note, updated);
    root.render(<Harness notes={[updated]} />);
  });
  await act(async () => {
    await chat.send("Plus court");
  });
  expect(vi.mocked(chatWithPaper).mock.calls[1][0]).toMatchObject({
    action: "clean_up",
    draft: { content: "Clearer note" },
  });
  expect(chatPatch(chat.thread.turns[1], updated)?.content).toBe("Short note");
  expect(chatPatch(first, updated)).toBeNull();
  expect(
    chatPatch(chat.thread.turns[1], { ...updated, content: "Manual changes" }),
  ).toBeNull();
});
