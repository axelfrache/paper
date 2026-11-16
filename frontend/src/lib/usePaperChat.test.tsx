import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatWithPaper } from "./api";
import { usePaperChat, type PaperChat } from "./usePaperChat";
import type { Note } from "../types/note";
vi.mock("./api", () => ({ chatWithPaper: vi.fn() }));
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
function Harness({ notes = [note] }: { notes?: Note[] }) {
  chat = usePaperChat(notes);
  return null;
}
beforeEach(() => {
  vi.mocked(chatWithPaper).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe("Paper conversations", () => {
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
  it("sends only the selected passage and rejects a selection after editing", async () => {
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
        <Harness notes={[{ ...note, content: "Unsaved draft changed" }]} />,
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
        selection: { ...selection, content: "Unsaved draft changed" },
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
