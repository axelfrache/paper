import { codeLines } from "./fences";
import { diagramToSvgMarkup, parseDiagramMarker } from "../diagram";
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
/** A horizontal rule: a line that is a block of its own, like a resource. */
export function isDivider(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

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
  const lines = value.split("\n");
  const raw = lines[line];
  return raw !== undefined && isResourceLine(raw) && !codeLines(lines)[line] ? raw : null;
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

const CLIPBOARD_RESOURCE_ATTR = "data-paper-resource";
const clipboardResourcePattern = new RegExp(`${CLIPBOARD_RESOURCE_ATTR}="([^"]*)"`);

export function resourceClipboardHtml(line: string): string | null {
  const diagram = parseDiagramMarker(line);
  if (diagram) {
    return `<div ${CLIPBOARD_RESOURCE_ATTR}="${encodeURIComponent(line)}">${diagramToSvgMarkup(diagram, 480)}</div>`;
  }
  const image = standaloneImage(line);
  if (image?.safe) {
    return `<div ${CLIPBOARD_RESOURCE_ATTR}="${encodeURIComponent(line)}"><img src="${escapeAttr(image.href)}" alt="${escapeAttr(image.alt)}" /></div>`;
  }
  return null;
}

export function resourceLineFromHtml(html: string): string | null {
  if (!html) {
    return null;
  }
  const match = clipboardResourcePattern.exec(html);
  if (!match) {
    return null;
  }
  try {
    const line = decodeURIComponent(match[1]);
    return isResourceLine(line) ? line : null;
  } catch {
    return null;
  }
}

export function resourceLineFromPlainText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed && !trimmed.includes("\n") && isResourceLine(trimmed) ? trimmed : null;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
