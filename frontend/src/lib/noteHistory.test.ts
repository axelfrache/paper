import { describe, expect, it } from "vitest";
import { recordDraft, type NoteHistory } from "./noteHistory";
const draft = (content: string) => ({ content, title: "", tags: [], favorite: false });
describe("note history", () => {
  it("groups contiguous typing and starts a new group after a pause", () => {
    const history: NoteHistory = { undo: [], redo: [] };
    recordDraft(history, draft(""), draft("h"), 0);
    recordDraft(history, draft("h"), draft("hi"), 100);
    expect(history.undo.map((d) => d.content)).toEqual([""]);
    recordDraft(history, draft("hi"), draft("hi!"), 2000);
    expect(history.undo.map((d) => d.content)).toEqual(["", "hi"]);
  });
  it("separates paste, formatting, and edits at another position", () => {
    const history: NoteHistory = { undo: [], redo: [] };
    recordDraft(history, draft(""), draft("hello"), 0);
    recordDraft(history, draft("hello"), draft("hello!"), 100);
    recordDraft(history, draft("hello!"), draft("Xhello!"), 200);
    recordDraft(history, draft("Xhello!"), draft("**Xhello!**"), 300);
    expect(history.undo).toHaveLength(4);
  });
  it("groups repeated backward deletions", () => {
    const history: NoteHistory = { undo: [], redo: [] };
    recordDraft(history, draft("abc"), draft("ab"), 0);
    recordDraft(history, draft("ab"), draft("a"), 100);
    expect(history.undo.map((d) => d.content)).toEqual(["abc"]);
  });
  it("groups image resizing", () => {
    const history: NoteHistory = { undo: [], redo: [] };
    recordDraft(history, draft("![x](/x){width=200}"), draft("![x](/x){width=240}"), 0);
    recordDraft(history, draft("![x](/x){width=240}"), draft("![x](/x){width=260}"), 100);
    expect(history.undo).toHaveLength(1);
  });
});
