import type { NoteDraft } from "../types/note";
import { parseDiagramMarker } from "./diagram";

export const historyLimit = 120;
export type NoteHistory = {
  undo: NoteDraft[];
  redo: NoteDraft[];
  group?: { kind: string; position: number; at: number; started: number; after: string };
};

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Group contiguous typing/deletion and preview resizes, never paste or formatting. */
export function recordDraft(history: NoteHistory, before: NoteDraft, after: NoteDraft, now = Date.now()) {
  const change = editGroup(before, after);
  const previous = history.group;
  const merge = change && previous && previous.after === before.content &&
    previous.kind === change.kind && now - previous.at < 1200 && now - previous.started < 5000 &&
    (change.kind.startsWith("resize:") || change.start === previous.position ||
      (change.kind === "delete" && change.position === previous.position - change.length));
  if (!merge) {
    history.undo.push(before);
    if (history.undo.length > historyLimit) history.undo.shift();
  }
  history.redo = [];
  history.group = change ? {
    kind: change.kind, position: change.position, at: now,
    started: merge ? previous!.started : now, after: after.content,
  } : undefined;
}

function editGroup(before: NoteDraft, after: NoteDraft) {
  if (before.title !== after.title || before.favorite !== after.favorite || JSON.stringify(before.tags) !== JSON.stringify(after.tags)) return null;
  const a = before.content, b = after.content;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const removed = a.slice(start, endA), added = b.slice(start, endB);
  const text = added || removed;
  if ((!removed || !added) && text && !text.includes("\n") && [...segmenter.segment(text)].length === 1) {
    return { kind: added ? "insert" : "delete", start, position: start + added.length, length: text.length };
  }
  const oldLines = a.split("\n"), newLines = b.split("\n");
  if (oldLines.length !== newLines.length) return null;
  const line = oldLines.findIndex((text, index) => text !== newLines[index]);
  if (line < 0 || oldLines.some((text, index) => index !== line && text !== newLines[index])) return null;
  const oldDiagram = parseDiagramMarker(oldLines[line]), newDiagram = parseDiagramMarker(newLines[line]);
  const imageBase = (text: string) => text.replace(/\{width=\d+\}$/, "");
  const sameImage = oldLines[line].startsWith("![") && imageBase(oldLines[line]) === imageBase(newLines[line]);
  const sameDiagram = oldDiagram && newDiagram && JSON.stringify({ ...oldDiagram, preview: null }) === JSON.stringify({ ...newDiagram, preview: null });
  return sameImage || sameDiagram ? { kind: `resize:${line}`, start, position: start, length: 0 } : null;
}
