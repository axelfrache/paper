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

export function wrapSelection(value: string, range: TextRange, mark: string) {
  const lines = value.split("\n");
  range = normalizeRange(range);
  if (range.start.line !== range.end.line) {
    const selected = selectedText(value, range);
    return replaceRange(value, range, mark + selected + mark);
  }
  const line = lines[range.start.line] ?? "";
  lines[range.start.line] = line.slice(0, range.start.col) + mark + line.slice(range.start.col, range.end.col) + mark + line.slice(range.end.col);
  return {
    value: lines.join("\n"),
    caret: {
      line: range.start.line,
      col: isCollapsedRange(range) ? range.start.col + mark.length : range.end.col + mark.length * 2,
    },
  };
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

export function replaceRange(value: string, range: TextRange, text: string) {
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
      caret: { line: range.start.line, col: before.length + chunks[0].length },
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
