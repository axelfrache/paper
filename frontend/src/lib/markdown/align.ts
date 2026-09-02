import { isDivider, isResourceLine } from "./resource";
import type { Caret, TextRange } from "./edit";
import { deleteBackward, deleteForward, insertLineBreak, normalizeRange } from "./edit";

export type TextAlign = "left" | "center" | "right" | "justify";

/** What a line without a marker is rendered as, and therefore what carries no marker. */
export const defaultTextAlign: TextAlign = "justify";

export const textAligns: TextAlign[] = ["left", "center", "right", "justify"];

const markerPattern = /\{align=(left|center|right|justify)\}$/;

/** Splits a line into the text to render and the alignment it asks for. */
export function readAlign(raw: string): { text: string; align: TextAlign } {
  const match = markerPattern.exec(raw);
  return match ? { text: raw.slice(0, match.index), align: match[1] as TextAlign } : { text: raw, align: defaultTextAlign };
}

/**
 * Only a line holding text can be aligned. A divider, an image or a diagram is a block of
 * its own, and an empty line would be turned into a non-empty one by the marker alone.
 */
export function alignable(raw: string) {
  const { text } = readAlign(raw);
  return text.trim().length > 0 && !isDivider(text) && !isResourceLine(text);
}

/** Rewrites a line to carry the alignment, or none when it is already the default. */
export function writeAlign(raw: string, align: TextAlign) {
  const { text } = readAlign(raw);
  if (!alignable(raw)) {
    return raw;
  }
  return align === defaultTextAlign ? text : `${text}{align=${align}}`;
}

/** Applies an alignment to every line the selection touches, leaving the caret put. */
export function alignRange(value: string, range: TextRange, align: TextAlign): { value: string; caret: Caret } {
  const normalized = normalizeRange(range);
  const lines = value.split("\n");
  for (let line = normalized.start.line; line <= normalized.end.line; line += 1) {
    if (lines[line] !== undefined) {
      lines[line] = writeAlign(lines[line], align);
    }
  }
  // The marker sits at the end of the line, so a caret inside the text keeps its column.
  const caretLine = Math.min(normalized.end.line, lines.length - 1);
  return {
    value: lines.join("\n"),
    caret: { line: caretLine, col: Math.min(normalized.end.col, readAlign(lines[caretLine] ?? "").text.length) },
  };
}

/** The alignment shared by every line a selection touches, or null when they disagree. */
export function alignOfRange(value: string, range: TextRange): TextAlign | null {
  const normalized = normalizeRange(range);
  const lines = value.split("\n");
  let shared: TextAlign | null = null;
  for (let line = normalized.start.line; line <= normalized.end.line; line += 1) {
    const raw = lines[line];
    if (raw === undefined || !alignable(raw)) {
      continue;
    }
    const { align } = readAlign(raw);
    if (shared === null) {
      shared = align;
    } else if (shared !== align) {
      return null;
    }
  }
  return shared;
}

/**
 * The editing operations below exist because a caret column addresses the *text* of a
 * line, while the marker trails it in the stored line. Every operation that touches the
 * tail of a line — splitting it, joining it to a neighbour — would otherwise cut in front
 * of the marker and carry it off to the wrong place.
 */

/** Enter on an aligned line: both halves keep the alignment. */
export function insertLineBreakAligned(value: string, caret: Caret) {
  const lines = value.split("\n");
  const { text, align } = readAlign(lines[caret.line] ?? "");
  if (align === defaultTextAlign) {
    return insertLineBreak(value, caret);
  }
  lines[caret.line] = text;
  const next = insertLineBreak(lines.join("\n"), caret);
  const split = next.value.split("\n");
  split[caret.line] = writeAlign(split[caret.line] ?? "", align);
  // An empty half stays unmarked: a marker alone would stop the line reading as blank.
  split[caret.line + 1] = writeAlign(split[caret.line + 1] ?? "", align);
  return { value: split.join("\n"), caret: next.caret };
}

/** Backspace, with the marker kept out of the text being joined. */
export function deleteBackwardAligned(value: string, caret: Caret) {
  if (caret.col > 0 || caret.line === 0) {
    return deleteBackward(value, caret);
  }
  return joinAligned(value, caret.line - 1, deleteBackward, caret);
}

/** Delete, which at the end of a line joins the next one to it. */
export function deleteForwardAligned(value: string, caret: Caret) {
  const lines = value.split("\n");
  const { text } = readAlign(lines[caret.line] ?? "");
  if (caret.col < text.length) {
    return deleteForward(value, caret);
  }
  if (caret.line >= lines.length - 1) {
    // At the very end of the note there is nothing to pull up — and the raw line still
    // has the marker after the caret, which a plain delete would start eating.
    return { value, caret };
  }
  return joinAligned(value, caret.line, deleteForward, caret);
}

/** Runs a join, stripping both lines first and restoring the surviving line's alignment. */
function joinAligned(
  value: string,
  keptLine: number,
  operation: (value: string, caret: Caret) => { value: string; caret: Caret },
  caret: Caret,
) {
  const lines = value.split("\n");
  const { align } = readAlign(lines[keptLine] ?? "");
  const stripped = lines.map((line) => readAlign(line).text);
  const next = operation(stripped.join("\n"), caret);
  const joined = next.value.split("\n");
  joined[keptLine] = writeAlign(joined[keptLine] ?? "", align);
  return { value: joined.join("\n"), caret: next.caret };
}

