import { parseDiagramMarker } from "../diagram";
import { parseInline } from "./inline";
import type { MarkdownInline } from "./inline";
import type { Caret } from "./edit";

export type ResourceEdit = { value: string; caret: Caret };

/**
 * A "resource" is an image or a diagram that occupies a whole markdown line.
 * The editor renders it as a block but treats it as a single atomic character:
 * the caret can only sit before it (col 0 of its own line) or after it
 * (col 0 of the next line), and any edit replaces or removes the whole line.
 */
export function isDiagramLine(line: string) {
  return Boolean(parseDiagramMarker(line));
}

export function standaloneImage(line: string) {
  const nodes = parseInline(line);
  return nodes.length === 1 && nodes[0].type === "image"
    ? (nodes[0] as Extract<MarkdownInline, { type: "image" }>)
    : null;
}

export function isResourceLine(line: string) {
  return isDiagramLine(line) || Boolean(standaloneImage(line)?.safe);
}

export function resourceLineAt(value: string, line: number) {
  const raw = value.split("\n")[line];
  return raw !== undefined && isResourceLine(raw) ? raw : null;
}

/** Removes the resource line entirely, keeping at least one (empty) line. */
export function removeResourceAt(
  value: string,
  line: number,
  caret?: Caret,
): ResourceEdit | null {
  const lines = value.split("\n");
  if (!resourceLineAt(value, line)) {
    return null;
  }
  lines.splice(line, 1);
  if (lines.length === 0) {
    lines.push("");
  }
  return {
    value: lines.join("\n"),
    caret: caret ?? { line: Math.min(line, lines.length - 1), col: 0 },
  };
}

/** Replaces the resource with plain text — typing over a "selected character". */
export function replaceResourceAt(
  value: string,
  line: number,
  text: string,
): ResourceEdit | null {
  const lines = value.split("\n");
  if (!resourceLineAt(value, line)) {
    return null;
  }
  lines[line] = text;
  return { value: lines.join("\n"), caret: { line, col: text.length } };
}

/** Pushes the resource down one line, leaving the caret in front of it. */
export function insertLineBeforeResource(
  value: string,
  line: number,
): ResourceEdit | null {
  const lines = value.split("\n");
  if (!resourceLineAt(value, line)) {
    return null;
  }
  lines.splice(line, 0, "");
  return { value: lines.join("\n"), caret: { line: line + 1, col: 0 } };
}
