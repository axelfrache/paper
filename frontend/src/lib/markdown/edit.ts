import { safeHref } from "./inline";

export type Caret = {
  line: number;
  col: number;
};

export type TextRange = {
  start: Caret;
  end: Caret;
};

export function fullTextRange(value: string): TextRange {
  const lines = value.split("\n");
  const lastLine = Math.max(0, lines.length - 1);
  return {
    start: { line: 0, col: 0 },
    end: { line: lastLine, col: lines[lastLine]?.length ?? 0 },
  };
}

export function focusCaret(value: string, current: Caret | null, placement: "start" | "end" | "last"): Caret {
  if (placement === "start") {
    return { line: 0, col: 0 };
  }
  if (placement === "end") {
    return endCaret(value);
  }
  return current ?? endCaret(value);
}

export function endCaret(value: string): Caret {
  const lines = value.split("\n");
  const lastLine = Math.max(0, lines.length - 1);
  return { line: lastLine, col: lines[lastLine]?.length ?? 0 };
}

export function wrapSelection(value: string, range: TextRange, mark: string, closingMark = mark) {
  const lines = value.split("\n");
  range = normalizeRange(range);
  if (range.start.line !== range.end.line) {
    const selected = selectedText(value, range);
    return replaceRange(value, range, mark + selected + closingMark);
  }
  const line = lines[range.start.line] ?? "";
  lines[range.start.line] = line.slice(0, range.start.col) + mark + line.slice(range.start.col, range.end.col) + closingMark + line.slice(range.end.col);
  return {
    value: lines.join("\n"),
    caret: {
      line: range.start.line,
      col: isCollapsedRange(range) ? range.start.col + mark.length : range.end.col + mark.length + closingMark.length,
    },
  };
}

export function toggleSelection(value: string, range: TextRange, mark: string, closingMark = mark) {
  range = normalizeRange(range);
  const wrapper = wrapperAtRange(value, range, mark, closingMark);
  if (!wrapper) {
    return wrapSelection(value, normalizeRangeForInlineWrap(value, range), mark, closingMark);
  }
  return replaceRange(value, {
    start: { line: range.start.line, col: wrapper.start },
    end: { line: range.start.line, col: wrapper.end },
  }, wrapper.text);
}

export function wrapLink(value: string, range: TextRange) {
  range = normalizeRangeForLinkWrap(value, normalizeRange(range));
  const text = selectedText(value, range) || "link";
  const selectedHref = safeHref(text.trim());
  if (selectedHref) {
    return replaceRange(value, range, `[${text}](${selectedHref})`);
  }
  const href = "https://";
  return replaceRange(value, range, `[${text}](${href})`, text.length + href.length + 3);
}

export function wrapLinkWithHref(value: string, range: TextRange, href: string) {
  range = normalizeRange(range);
  const text = selectedText(value, range) || href;
  return replaceRange(value, range, `[${text}](${href})`);
}

export function toggleLink(value: string, range: TextRange) {
  range = normalizeRange(range);
  const link = linkAtRange(value, range);
  if (!link) {
    return wrapLink(value, range);
  }
  return replaceRange(value, {
    start: { line: range.start.line, col: link.start },
    end: { line: range.start.line, col: link.end },
  }, link.label);
}

export function normalizeRange(range: TextRange): TextRange {
  return compareCarets(range.start, range.end) <= 0 ? range : { start: range.end, end: range.start };
}

export function compareCarets(a: Caret, b: Caret) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.col - b.col;
}

export function isCollapsedRange(range: TextRange) {
  return range.start.line === range.end.line && range.start.col === range.end.col;
}

export function selectedText(value: string, range: TextRange) {
  range = normalizeRange(range);
  const lines = value.split("\n");
  if (range.start.line === range.end.line) {
    return (lines[range.start.line] ?? "").slice(range.start.col, range.end.col);
  }
  return [
    (lines[range.start.line] ?? "").slice(range.start.col),
    ...lines.slice(range.start.line + 1, range.end.line),
    (lines[range.end.line] ?? "").slice(0, range.end.col),
  ].join("\n");
}

export function replaceRange(value: string, range: TextRange, text: string, caretOffset?: number) {
  range = normalizeRange(range);
  const lines = value.split("\n");
  const startLine = lines[range.start.line] ?? "";
  const endLine = lines[range.end.line] ?? "";
  const chunks = text.split("\n");
  const before = startLine.slice(0, range.start.col);
  const after = endLine.slice(range.end.col);

  if (chunks.length === 1) {
    lines.splice(range.start.line, range.end.line - range.start.line + 1, before + chunks[0] + after);
    return {
      value: lines.join("\n"),
      caret: { line: range.start.line, col: before.length + (caretOffset ?? chunks[0].length) },
    };
  }

  const replacement = [
    before + chunks[0],
    ...chunks.slice(1, -1),
    chunks[chunks.length - 1] + after,
  ];
  lines.splice(range.start.line, range.end.line - range.start.line + 1, ...replacement);
  return {
    value: lines.join("\n"),
    caret: { line: range.start.line + chunks.length - 1, col: chunks[chunks.length - 1].length },
  };
}

export function insertLineBreak(value: string, caret: Caret) {
  const lines = value.split("\n");
  const current = lines[caret.line] ?? "";
  const prefixMatch = /^(\s*)(-\s\[[ xX]\]\s|[-*]\s)/.exec(current);
  let prefix = "";
  if (prefixMatch) {
    if (current.slice(prefixMatch[0].length).trim() === "" && caret.col >= prefixMatch[0].length) {
      lines[caret.line] = "";
      return { value: lines.join("\n"), caret: { line: caret.line, col: 0 } };
    }
    prefix = prefixMatch[1] + (prefixMatch[2].startsWith("- [") ? "- [ ] " : `${prefixMatch[2][0]} `);
  }
  const before = current.slice(0, caret.col);
  const after = current.slice(caret.col);
  lines.splice(caret.line, 1, before, prefix + after);
  return { value: lines.join("\n"), caret: { line: caret.line + 1, col: prefix.length } };
}

export function joinWithPreviousLine(value: string, caret: Caret) {
  const lines = value.split("\n");
  const previousLength = lines[caret.line - 1]?.length ?? 0;
  lines[caret.line - 1] = (lines[caret.line - 1] ?? "") + (lines[caret.line] ?? "");
  lines.splice(caret.line, 1);
  return { value: lines.join("\n"), caret: { line: caret.line - 1, col: previousLength } };
}

export function deleteBackward(value: string, caret: Caret) {
  const lines = value.split("\n");
  const current = lines[caret.line] ?? "";
  if (caret.col === 0) {
    if (caret.line === 0) {
      return { value, caret };
    }
    return joinWithPreviousLine(value, caret);
  }
  lines[caret.line] = current.slice(0, caret.col - 1) + current.slice(caret.col);
  return { value: lines.join("\n"), caret: { line: caret.line, col: caret.col - 1 } };
}

export function deleteForward(value: string, caret: Caret) {
  const lines = value.split("\n");
  const current = lines[caret.line] ?? "";
  if (caret.col < current.length) {
    lines[caret.line] = current.slice(0, caret.col) + current.slice(caret.col + 1);
    return { value: lines.join("\n"), caret };
  }
  if (caret.line >= lines.length - 1) {
    return { value, caret };
  }
  lines[caret.line] = current + (lines[caret.line + 1] ?? "");
  lines.splice(caret.line + 1, 1);
  return { value: lines.join("\n"), caret };
}

export function deleteRange(value: string, range: TextRange) {
  return replaceRange(value, range, "");
}

export function deleteBackwardWord(value: string, caret: Caret) {
  const start = previousWordCaret(value, caret);
  if (compareCarets(start, caret) === 0) {
    return deleteBackward(value, caret);
  }
  return deleteRange(value, { start, end: caret });
}

export function deleteForwardWord(value: string, caret: Caret) {
  const end = nextWordCaret(value, caret);
  if (compareCarets(caret, end) === 0) {
    return deleteForward(value, caret);
  }
  return deleteRange(value, { start: caret, end });
}

export function previousWordCaret(value: string, caret: Caret): Caret {
  const lines = value.split("\n");
  const current = lines[caret.line] ?? "";
  if (caret.col === 0) {
    if (caret.line === 0) {
      return caret;
    }
    return { line: caret.line - 1, col: lines[caret.line - 1]?.length ?? 0 };
  }

  let col = caret.col;
  while (col > 0 && /\s/u.test(current[col - 1])) {
    col -= 1;
  }
  if (col === 0) {
    return { line: caret.line, col };
  }
  const word = isWordChar(current[col - 1]);
  while (col > 0 && isWordChar(current[col - 1]) === word && !/\s/u.test(current[col - 1])) {
    col -= 1;
  }
  return { line: caret.line, col };
}

export function nextWordCaret(value: string, caret: Caret): Caret {
  const lines = value.split("\n");
  const current = lines[caret.line] ?? "";
  if (caret.col >= current.length) {
    if (caret.line >= lines.length - 1) {
      return caret;
    }
    return { line: caret.line + 1, col: 0 };
  }

  let col = caret.col;
  while (col < current.length && /\s/u.test(current[col])) {
    col += 1;
  }
  if (col >= current.length) {
    return { line: caret.line, col };
  }
  const word = isWordChar(current[col]);
  while (col < current.length && isWordChar(current[col]) === word && !/\s/u.test(current[col])) {
    col += 1;
  }
  return { line: caret.line, col };
}

export function insertText(value: string, range: TextRange, text: string) {
  const chunks = normalizeMarkdownText(text).split("\n");
  return replaceRange(value, range, chunks.join("\n"));
}

export function normalizeMarkdownText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+-\s+(?=(\*\*|[A-Za-zÀ-ÿ]))/g, "$1\n- ");
}

function isWordChar(char: string) {
  return /[\p{L}\p{N}_]/u.test(char);
}

type LinkSpan = {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  label: string;
};

type WrapperSpan = {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  text: string;
};

function wrapperAtRange(value: string, range: TextRange, mark: string, closingMark: string): WrapperSpan | null {
  if (range.start.line !== range.end.line) {
    return null;
  }
  const line = value.split("\n")[range.start.line] ?? "";
  return wrapperSpans(line, mark, closingMark).find((wrapper) => {
    if (isCollapsedRange(range)) {
      return range.start.col > wrapper.contentStart && range.start.col < wrapper.contentEnd;
    }
    const rangeInsideWrapper = range.start.col >= wrapper.start && range.end.col <= wrapper.end;
    const wrapperInsideRange = range.start.col <= wrapper.start && range.end.col >= wrapper.end;
    const rangeInsideContent = range.start.col >= wrapper.contentStart && range.end.col <= wrapper.contentEnd;
    const rangeOverlapsContent = range.start.col < wrapper.contentEnd && range.end.col > wrapper.contentStart;
    return rangeInsideWrapper || wrapperInsideRange || rangeInsideContent || rangeOverlapsContent;
  }) ?? null;
}

function wrapperSpans(line: string, mark: string, closingMark: string): WrapperSpan[] {
  const spans: WrapperSpan[] = mark === "*" && closingMark === "*" ? tripleItalicWrapperSpans(line) : [];
  let index = 0;
  while (index < line.length) {
    const start = findOpeningFormatMark(line, mark, index);
    if (start < 0) {
      break;
    }
    const contentStart = start + mark.length;
    const contentEnd = findClosingFormatMark(line, closingMark, contentStart);
    if (contentEnd < 0 || contentEnd === contentStart) {
      index = contentStart;
      continue;
    }
    spans.push({
      start,
      end: contentEnd + closingMark.length,
      contentStart,
      contentEnd,
      text: line.slice(contentStart, contentEnd),
    });
    index = contentEnd + closingMark.length;
  }
  return spans.sort((a, b) => a.start - b.start || b.end - a.end);
}

function tripleItalicWrapperSpans(line: string): WrapperSpan[] {
  const spans: WrapperSpan[] = [];
  let index = 0;
  while (index < line.length) {
    const start = line.indexOf("***", index);
    if (start < 0) {
      break;
    }
    const end = line.indexOf("***", start + 3);
    if (end < 0 || end === start + 3) {
      index = start + 3;
      continue;
    }
    spans.push({
      start: start + 2,
      end: end + 1,
      contentStart: start + 3,
      contentEnd: end,
      text: line.slice(start + 3, end),
    });
    index = end + 3;
  }
  return spans;
}

function findOpeningFormatMark(value: string, mark: string, from: number) {
  for (let index = from; index <= value.length - mark.length; index += 1) {
    if (!value.startsWith(mark, index)) {
      continue;
    }
    if (mark === "*" && (value[index - 1] === "*" || value[index + 1] === "*")) {
      continue;
    }
    return index;
  }
  return -1;
}

function findClosingFormatMark(value: string, mark: string, from: number) {
  for (let index = from; index <= value.length - mark.length; index += 1) {
    if (!value.startsWith(mark, index)) {
      continue;
    }
    if (mark === "**" && value[index + mark.length] === "*") {
      continue;
    }
    if (mark === "*" && (value[index - 1] === "*" || value[index + 1] === "*")) {
      continue;
    }
    return index;
  }
  return -1;
}

function normalizeRangeForInlineWrap(value: string, range: TextRange) {
  return normalizeRangeWithSpans(value, range, "content");
}

function normalizeRangeForLinkWrap(value: string, range: TextRange) {
  return normalizeRangeWithSpans(value, range, "whole");
}

function normalizeRangeWithSpans(value: string, range: TextRange, mode: "content" | "whole"): TextRange {
  if (range.start.line !== range.end.line || isCollapsedRange(range)) {
    return range;
  }
  const line = value.split("\n")[range.start.line] ?? "";
  let start = range.start.col;
  let end = range.end.col;
  const spans = [
    ...wrapperSpans(line, "**", "**"),
    ...wrapperSpans(line, "*", "*"),
    ...wrapperSpans(line, "~~", "~~"),
    ...wrapperSpans(line, "`", "`"),
    ...wrapperSpans(line, "<u>", "</u>"),
  ];

  for (const span of spans) {
    if (start >= span.contentStart && start <= span.contentEnd && end > span.contentEnd && end <= span.end) {
      end = mode === "whole" ? span.end : span.contentEnd;
    }
    if (start >= span.start && start < span.contentStart && end >= span.contentStart && end <= span.contentEnd) {
      start = mode === "whole" ? span.start : span.contentStart;
    }
    if (mode === "whole" && start >= span.contentStart && end <= span.contentEnd) {
      start = span.start;
      end = span.end;
    }
  }

  for (const link of linkSpans(line)) {
    if (start >= link.labelStart && start <= link.labelEnd && end > link.labelEnd && end <= link.end) {
      end = link.labelEnd;
    }
    if (start >= link.start && start < link.labelStart && end >= link.labelStart && end <= link.labelEnd) {
      start = link.labelStart;
    }
  }

  return {
    start: { line: range.start.line, col: start },
    end: { line: range.end.line, col: end },
  };
}

function linkAtRange(value: string, range: TextRange): LinkSpan | null {
  if (range.start.line !== range.end.line) {
    return null;
  }
  const line = value.split("\n")[range.start.line] ?? "";
  const links = linkSpans(line);
  return links.find((link) => {
    if (isCollapsedRange(range)) {
      return range.start.col > link.start && range.start.col < link.end;
    }
    const rangeInsideLink = range.start.col >= link.start && range.end.col <= link.end;
    const linkInsideRange = range.start.col <= link.start && range.end.col >= link.end;
    const rangeInsideLabel = range.start.col >= link.labelStart && range.end.col <= link.labelEnd;
    const rangeOverlapsLabel = range.start.col < link.labelEnd && range.end.col > link.labelStart;
    return rangeInsideLink || linkInsideRange || rangeInsideLabel || rangeOverlapsLabel;
  }) ?? null;
}

function linkSpans(line: string): LinkSpan[] {
  const spans: LinkSpan[] = [];
  let index = 0;
  while (index < line.length) {
    const start = line.indexOf("[", index);
    if (start < 0) {
      break;
    }
    const labelEnd = findUnescapedChar(line, "]", start + 1);
    if (labelEnd <= start + 1 || line[labelEnd + 1] !== "(") {
      index = start + 1;
      continue;
    }
    const hrefEnd = findClosingLinkParen(line, labelEnd + 2);
    if (hrefEnd < 0) {
      index = start + 1;
      continue;
    }
    spans.push({
      start,
      end: hrefEnd + 1,
      labelStart: start + 1,
      labelEnd,
      label: line.slice(start + 1, labelEnd),
    });
    index = hrefEnd + 1;
  }
  return spans;
}

function findUnescapedChar(value: string, needle: string, from: number) {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (value[index] === needle) {
      return index;
    }
  }
  return -1;
}

function findClosingLinkParen(value: string, from: number) {
  let depth = 0;
  let quote = "";
  for (let index = from; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}
