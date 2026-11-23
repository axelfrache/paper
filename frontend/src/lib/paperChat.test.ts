import { describe, expect, it } from "vitest";
import {
  applicationProblem,
  chatHistory,
  chatPatch,
  mentionMatches,
  mentionQuery,
  stripMention,
  type ChatTurn,
} from "./paperChat";
import type { Note } from "../types/note";
const note: Note = {
  id: "a",
  title: "Plan",
  content: "Original text",
  tags: ["work"],
  favorite: false,
  createdAt: "",
  updatedAt: "",
};
const turn: ChatTurn = {
  id: "1",
  question: "Rewrite",
  text: "New text",
  status: "ready",
  sourceIds: ["a"],
  action: "clean_up",
  snapshot: note,
};
describe("Assistant proposals", () => {
  it("blocks application to another note, changed content, or an already applied result", () => {
    expect(chatPatch(turn, { ...note, id: "b" })).toBeNull();
    expect(
      chatPatch(turn, { ...note, content: "Edited while waiting" }),
    ).toBeNull();
    expect(chatPatch({ ...turn, applied: true }, note)).toBeNull();
    expect(applicationProblem(turn, note)).toBe("");
    expect(chatPatch(turn, note)).toEqual({ content: "New text" });
  });
  it("only blocks on the field each proposal actually touches", () => {
    expect(
      chatPatch(turn, { ...note, title: "Renamed", tags: ["other"] }),
    ).toEqual({ content: "New text" });
    const titleTurn = {
      ...turn,
      action: "suggest_title" as const,
      text: "New title",
    };
    expect(
      chatPatch(titleTurn, { ...note, content: "Edited while waiting" }),
    ).toEqual({ title: "New title" });
    expect(chatPatch(titleTurn, { ...note, title: "Renamed" })).toBeNull();
    const tagsTurn = {
      ...turn,
      action: "suggest_tags" as const,
      text: "cloud",
    };
    expect(
      chatPatch(tagsTurn, { ...note, content: "Edited while waiting" }),
    ).toEqual({ tags: ["work", "cloud"] });
    expect(chatPatch(tagsTurn, { ...note, tags: ["other"] })).toBeNull();
  });
  it("keeps diagram resources when replacing note text", () => {
    const original = { ...note, content: "Intro\n![diagram:abc123]" };
    expect(
      chatPatch({ ...turn, snapshot: original }, original)?.content,
    ).toContain("![diagram:abc123]");
  });
  it("replaces only the captured selection, even when the same words occur twice", () => {
    const original = { ...note, content: "word word" };
    const selection = {
      text: "word",
      content: original.content,
      range: { start: { line: 0, col: 5 }, end: { line: 0, col: 9 } },
    };
    expect(
      chatPatch({ ...turn, snapshot: original, selection }, original),
    ).toEqual({ content: "word New text" });
  });
  it("ignores edits outside the selection but blocks if the selection itself changed", () => {
    const original = { ...note, content: "word word" };
    const selection = {
      text: "word",
      content: original.content,
      range: { start: { line: 0, col: 5 }, end: { line: 0, col: 9 } },
    };
    const selectionTurn = { ...turn, snapshot: original, selection };
    const editedElsewhere = {
      ...original,
      content: "word word\nunrelated line added later",
    };
    expect(applicationProblem(selectionTurn, editedElsewhere)).toBe("");
    expect(chatPatch(selectionTurn, editedElsewhere)).toEqual({
      content: "word New text\nunrelated line added later",
    });
    const editedSelection = { ...original, content: "word xxxx" };
    expect(applicationProblem(selectionTurn, editedSelection)).not.toBe("");
    expect(chatPatch(selectionTurn, editedSelection)).toBeNull();
  });
  it("applies title, tags, tasks and answers as distinct operations", () => {
    expect(
      chatPatch(
        { ...turn, action: "suggest_title", text: "New title\nextra" },
        note,
      ),
    ).toEqual({ title: "New title" });
    expect(
      chatPatch(
        { ...turn, action: "suggest_tags", text: "work, architecture, #cloud" },
        note,
      ),
    ).toEqual({ tags: ["work", "architecture", "cloud"] });
    expect(
      chatPatch(
        { ...turn, action: "extract_tasks", text: "- [ ] Deploy\n- Check" },
        note,
      )?.content,
    ).toBe("Original text\n\n- [ ] Deploy\n- [ ] Check");
    expect(chatPatch({ ...turn, action: undefined }, note)?.content).toBe(
      "Original text\n\nNew text",
    );
  });
  it("bounds history by complete turns and byte size and excludes failed replies", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      ...turn,
      id: String(i),
      question: `question${i}`,
    }));
    expect(chatHistory(turns)).toHaveLength(12);
    expect(chatHistory(turns)[0].content).toBe("question4");
    expect(chatHistory([{ ...turn, status: "error" }])).toEqual([]);
    expect(chatHistory([{ ...turn, text: "é".repeat(13000) }])).toEqual([]);
  });
});
describe("@ mentions", () => {
  it("detects and strips only a trailing mention", () => {
    expect(mentionQuery("compare with @pl")).toBe("pl");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("mail me@home now")).toBeUndefined();
    expect(mentionQuery("done @plan ")).toBeUndefined();
    expect(stripMention("compare with @pl")).toBe("compare with ");
    expect(stripMention("@pl")).toBe("");
  });
  it("filters by title and skips excluded notes", () => {
    const other = { ...note, id: "b", title: "Planning" };
    expect(mentionMatches([note, other], "plan", ["a"])).toEqual([other]);
    expect(mentionMatches([note, other], "", [])).toHaveLength(2);
  });
});
