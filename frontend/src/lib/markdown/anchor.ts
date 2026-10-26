import type { Caret } from "./edit";

export function remapCaret(before: string, after: string, caret: Caret): Caret {
  const lines = before.split("\n");
  const offset = lines.slice(0, caret.line).reduce((sum, line) => sum + line.length + 1, 0) + caret.col;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  // Left affinity: text typed at the upload position stays after the inserted image.
  const next = offset <= start ? offset : offset >= oldEnd ? offset + newEnd - oldEnd : newEnd;
  const prefix = after.slice(0, Math.max(0, Math.min(next, after.length))).split("\n");
  return { line: prefix.length - 1, col: prefix[prefix.length - 1].length };
}
