import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearThreads, loadThreads, saveThreads } from "./chatStorage";
import type { ChatTurn } from "./paperChat";
import type { Thread } from "./usePaperChat";

const turn = (over: Partial<ChatTurn> = {}): ChatTurn => ({
  id: "t1",
  question: "Q",
  text: "A",
  status: "ready",
  sourceIds: [],
  ...over,
});
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: "all",
  ctxKey: "all",
  context: { scope: "all" },
  turns: [turn()],
  draft: "",
  updatedAt: 10,
  ...over,
});

beforeEach(() => localStorage.clear());

describe("chat storage", () => {
  it("round-trips conversations per user and clears them", () => {
    saveThreads("u1", [thread()]);
    expect(loadThreads("u1")).toHaveLength(1);
    expect(loadThreads("u2")).toEqual([]);
    clearThreads("u1");
    expect(loadThreads("u1")).toEqual([]);
  });
  it("drops snapshots, in-flight turns, empty threads and selections", () => {
    saveThreads("u1", [
      thread({
        id: "sel",
        ctxKey: "x",
        context: {
          scope: "selection",
          noteId: "a",
          selection: {
            range: { start: { line: 0, col: 0 }, end: { line: 0, col: 1 } },
            text: "t",
            content: "whole note",
          },
        },
        turns: [
          turn({
            snapshot: { id: "a", title: "T", content: "secret body", tags: [] },
            applied: true,
          }),
          turn({ id: "t2", status: "loading" }),
        ],
      }),
      thread({ id: "empty", turns: [] }),
    ]);
    const raw = localStorage.getItem("paper.chat.v1.u1") ?? "";
    expect(raw).not.toContain("secret body");
    expect(raw).not.toContain("whole note");
    const [loaded, ...rest] = loadThreads("u1");
    expect(rest).toEqual([]);
    expect(loaded.context).toEqual({ scope: "note", noteId: "a" });
    expect(loaded.ctxKey).toBe("note:a");
    expect(loaded.turns).toHaveLength(1);
    expect(loaded.turns[0].snapshot).toBeUndefined();
    expect(loaded.turns[0].applied).toBe(true);
  });
  it("ignores corrupt or foreign data", () => {
    for (const raw of [
      "not json",
      "null",
      '{"v":2}',
      '{"v":1,"threads":[1,{"id":3}]}',
    ]) {
      localStorage.setItem("paper.chat.v1.u1", raw);
      expect(loadThreads("u1")).toEqual([]);
    }
  });
  it("keeps only the newest conversations", () => {
    saveThreads(
      "u1",
      Array.from({ length: 40 }, (_, i) =>
        thread({ id: `t${i}`, updatedAt: i }),
      ),
    );
    const loaded = loadThreads("u1");
    expect(loaded).toHaveLength(30);
    expect(loaded.some((item) => item.id === "t39")).toBe(true);
    expect(loaded.some((item) => item.id === "t0")).toBe(false);
  });
  it("survives storage failures", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      expect(() => saveThreads("u1", [thread()])).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
