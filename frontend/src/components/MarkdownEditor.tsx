import { useLayoutEffect, useRef } from "react";

type Caret = {
  line: number;
  col: number;
};

type TextRange = {
  start: Caret;
  end: Caret;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const syntaxColor = "#a7acb2";

export function MarkdownEditor({ value, onChange, placeholder = "Start writing..." }: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef(false);
  const caretRef = useRef<Caret | null>(null);
  const activeLineRef = useRef(-1);

  useLayoutEffect(() => {
    renderMarkdown(editorRef.current, value, focusedRef.current ? caretRef.current?.line ?? -1 : -1);
    activeLineRef.current = focusedRef.current ? caretRef.current?.line ?? -1 : -1;
    if (focusedRef.current && caretRef.current) {
      placeCaret(editorRef.current, caretRef.current);
    }
  }, [value]);

  const syncActiveLine = () => {
    const range = getSelectionRange(editorRef.current);
    if (range && !isCollapsedRange(range)) {
      caretRef.current = range.end;
      return;
    }

    const caret = range?.end ?? getCaret(editorRef.current);
    if (!caret) {
      return;
    }
    caretRef.current = caret;
    if (caret.line !== activeLineRef.current) {
      renderMarkdown(editorRef.current, value, caret.line);
      activeLineRef.current = caret.line;
      placeCaret(editorRef.current, caret);
    }
  };

  const setSource = (nextValue: string, caret: Caret | null) => {
    caretRef.current = caret;
    onChange(nextValue);
  };

  const handleInput = () => {
    const caret = getCaret(editorRef.current);
    setSource(readSource(editorRef.current), caret);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    const selectionRange = getSelectionRange(editorRef.current);
    const caret = selectionRange?.end ?? getCaret(editorRef.current);
    if (!caret) {
      return;
    }

    if (meta && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const range = fullTextRange(value);
      caretRef.current = range.end;
      placeSelection(editorRef.current, range);
      return;
    }

    if (meta && ["b", "i"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const mark = event.key.toLowerCase() === "b" ? "**" : "*";
      const next = wrapSelection(value, selectionRange ?? { start: caret, end: caret }, mark);
      setSource(next.value, next.caret);
      return;
    }

    if (!meta && !event.altKey && !event.nativeEvent.isComposing && event.key.length === 1) {
      event.preventDefault();
      const next = insertText(value, selectionRange ?? { start: caret, end: caret }, event.key);
      setSource(next.value, next.caret);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? insertText(value, selectionRange, "\n")
        : insertLineBreak(value, caret);
      setSource(next.value, next.caret);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? deleteRange(value, selectionRange)
        : event.ctrlKey || event.altKey
          ? deleteBackwardWord(value, caret)
          : deleteBackward(value, caret);
      setSource(next.value, next.caret);
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? deleteRange(value, selectionRange)
        : event.ctrlKey || event.altKey
          ? deleteForwardWord(value, caret)
          : deleteForward(value, caret);
      setSource(next.value, next.caret);
    }
  };

  const handleFocus = () => {
    focusedRef.current = true;
    caretRef.current = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    renderMarkdown(editorRef.current, value, caretRef.current.line);
    activeLineRef.current = caretRef.current.line;
    placeCaret(editorRef.current, caretRef.current);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    caretRef.current = null;
    renderMarkdown(editorRef.current, value, -1);
    activeLineRef.current = -1;
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("[data-check]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    const line = Number(target.getAttribute("data-check"));
    if (Number.isNaN(line)) {
      return;
    }
    const lines = value.split("\n");
    lines[line] = (lines[line] ?? "").replace(/^(-\s\[)([ xX])(\])/, (_, prefix, current, suffix) => {
      return `${prefix}${current.toLowerCase() === "x" ? " " : "x"}${suffix}`;
    });
    setSource(lines.join("\n"), { line, col: 0 });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const caret = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    const next = insertText(value, getSelectionRange(editorRef.current) ?? { start: caret, end: caret }, text);
    setSource(next.value, next.caret);
  };

  return (
    <div className="markdown-editor-wrap">
      <div
        ref={editorRef}
        className="markdown-editor"
        contentEditable
        spellCheck={false}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={syncActiveLine}
        onMouseUp={syncActiveLine}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onPaste={handlePaste}
      />
      {!value ? <div className="markdown-editor-placeholder">{placeholder}</div> : null}
    </div>
  );
}

function renderMarkdown(el: HTMLDivElement | null, value: string, activeLine: number) {
  if (!el) {
    return;
  }
  el.innerHTML = value.split("\n").map((line, index) => renderLine(line, index === activeLine, index)).join("");
}

function renderLine(raw: string, active: boolean, index: number) {
  const base = "min-height:1.75em;";
  const syn = (text: string) =>
    `<span style="color:${syntaxColor};${active ? "" : "display:none;"}">${escapeHtml(text)}</span>`;
  const deco = (html: string) => `<span data-deco="1" style="color:#b0b5bb;">${html}</span>`;
  let match: RegExpExecArray | null;

  match = /^(#{1,3})(\s+)(.*)$/.exec(raw);
  if (match) {
    const sizes = ["22px", "18px", "15.5px"];
    const level = match[1].length;
    const margin = level === 1 ? "18px 0 4px" : "14px 0 2px";
    return `<div data-line="${index}" style="${base}font-size:${sizes[level - 1]};font-weight:640;letter-spacing:0;line-height:1.45;margin:${margin};">${syn(match[1] + match[2])}${inlineMarkdown(match[3], active)}</div>`;
  }

  match = /^(-\s\[([ xX])\])(\s+)(.*)$/.exec(raw);
  if (match) {
    const done = match[2].toLowerCase() === "x";
    const check = active
      ? syn(match[1] + match[3])
      : `${deco(`<span data-check="${index}" style="cursor:pointer;font-size:13px;margin-right:8px;color:${done ? "#3f7d58" : "#aeb4ba"};">${done ? "☑" : "☐"}</span>`)}${syn(match[1] + match[3])}`;
    return `<div data-line="${index}" style="${base}display:flex;align-items:baseline;">${check}<span style="${done ? "color:#a2a8ae;text-decoration:line-through;" : ""}">${inlineMarkdown(match[4], active)}</span></div>`;
  }

  match = /^(-|\*)(\s+)(.*)$/.exec(raw);
  if (match) {
    const bullet = active ? syn(match[1] + match[2]) : `${deco('<span style="margin-right:8px;">•</span>')}${syn(match[1] + match[2])}`;
    return `<div data-line="${index}" style="${base}display:flex;align-items:baseline;padding-left:2px;">${bullet}<span>${inlineMarkdown(match[3], active)}</span></div>`;
  }

  match = /^(>)(\s+)(.*)$/.exec(raw);
  if (match) {
    return `<div data-line="${index}" style="${base}border-left:2px solid #dfe2e6;padding-left:12px;color:#6f757c;">${syn(match[1] + match[2])}${inlineMarkdown(match[3], active)}</div>`;
  }

  if (!raw.length) {
    return `<div data-line="${index}" style="${base}"><br /></div>`;
  }
  return `<div data-line="${index}" style="${base}">${inlineMarkdown(raw, active)}</div>`;
}

function inlineMarkdown(raw: string, active: boolean) {
  return raw
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith("`") && chunk.endsWith("`")) {
        return inlineToken("`", "code", chunk.slice(1, -1), active);
      }
      if (chunk.startsWith("**") && chunk.endsWith("**")) {
        return inlineToken("**", "strong", chunk.slice(2, -2), active);
      }
      if (chunk.startsWith("*") && chunk.endsWith("*")) {
        return inlineToken("*", "em", chunk.slice(1, -1), active);
      }
      return escapeHtml(chunk);
    })
    .join("");
}

function inlineToken(mark: string, tag: "code" | "strong" | "em", text: string, active: boolean) {
  const content = `<${tag}>${escapeHtml(text)}</${tag}>`;
  if (!active) {
    return content;
  }
  return `${syntaxMark(mark)}${content}${syntaxMark(mark)}`;
}

function syntaxMark(mark: string) {
  return `<span style="color:${syntaxColor};">${escapeHtml(mark)}</span>`;
}

function lineNodes(lineEl: Element | null) {
  const nodes: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node as Text);
      return;
    }
    if (node instanceof HTMLElement && node.dataset.deco) {
      return;
    }
    node.childNodes.forEach(walk);
  };
  if (lineEl) {
    walk(lineEl);
  }
  return nodes;
}

function readSource(el: HTMLDivElement | null) {
  if (!el) {
    return "";
  }
  return Array.from(el.querySelectorAll("[data-line]"))
    .map((line) => lineNodes(line).map((node) => node.nodeValue ?? "").join(""))
    .join("\n");
}

function getCaret(el: HTMLDivElement | null): Caret | null {
  const selection = window.getSelection();
  if (!el || !selection || !selection.rangeCount || !selection.focusNode) {
    return null;
  }
  return pointToCaret(el, selection.focusNode, selection.focusOffset);
}

function getSelectionRange(el: HTMLDivElement | null): TextRange | null {
  const selection = window.getSelection();
  if (!el || !selection || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) {
    return null;
  }
  const anchor = pointToCaret(el, selection.anchorNode, selection.anchorOffset);
  const focus = pointToCaret(el, selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) {
    return null;
  }
  return normalizeRange({ start: anchor, end: focus });
}

function pointToCaret(el: HTMLDivElement, node: Node, offset: number): Caret | null {
  if (node === el) {
    const lines = lineElements(el);
    if (lines.length === 0) {
      return { line: 0, col: 0 };
    }
    if (offset <= 0) {
      return { line: Number(lines[0].getAttribute("data-line")), col: 0 };
    }
    if (offset >= lines.length) {
      const last = lines[lines.length - 1];
      return { line: Number(last.getAttribute("data-line")), col: lineLength(last) };
    }
    return { line: Number(lines[offset].getAttribute("data-line")), col: 0 };
  }

  const host = node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof Element ? node : null;
  if (!host || !el.contains(host)) {
    return null;
  }
  const lineEl = host.closest("[data-line]");
  if (!lineEl) {
    return null;
  }
  const line = Number(lineEl.getAttribute("data-line"));

  if (node.nodeType !== Node.TEXT_NODE) {
    let col = 0;
    const children = Array.from(node.childNodes);
    for (const child of children.slice(0, offset)) {
      col += sourceTextLength(child);
    }
    let current: Node = node;
    while (current !== lineEl) {
      let previous = current.previousSibling;
      while (previous) {
        col += sourceTextLength(previous);
        previous = previous.previousSibling;
      }
      current = current.parentNode ?? lineEl;
    }
    return { line, col };
  }

  let col = 0;
  const nodes = lineNodes(lineEl);
  for (const textNode of nodes) {
    if (textNode === node) {
      col += caretOffsetInNode(nodes, textNode, offset);
      return { line, col };
    }
    col += textNode.nodeValue?.length ?? 0;
  }
  return { line, col };
}

function lineElements(el: HTMLDivElement) {
  return Array.from(el.querySelectorAll("[data-line]"));
}

function lineLength(lineEl: Element) {
  return lineNodes(lineEl).reduce((length, node) => length + (node.nodeValue?.length ?? 0), 0);
}

function fullTextRange(value: string): TextRange {
  const lines = value.split("\n");
  const lastLine = Math.max(0, lines.length - 1);
  return {
    start: { line: 0, col: 0 },
    end: { line: lastLine, col: lines[lastLine]?.length ?? 0 },
  };
}

function sourceTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue?.length ?? 0;
  }
  if (node instanceof HTMLElement && node.dataset.deco) {
    return 0;
  }
  return Array.from(node.childNodes).reduce((length, child) => length + sourceTextLength(child), 0);
}

function caretOffsetInNode(nodes: Text[], node: Text, offset: number) {
  const value = node.nodeValue ?? "";
  const parent = node.parentElement;
  if (!parent || offset !== value.length || !["STRONG", "EM", "CODE"].includes(parent.tagName)) {
    return offset;
  }
  const next = nodes[nodes.indexOf(node) + 1];
  const mark = next?.nodeValue ?? "";
  if (parent.tagName === "STRONG" && mark === "**") {
    return offset + 2;
  }
  if (parent.tagName === "EM" && mark === "*") {
    return offset + 1;
  }
  if (parent.tagName === "CODE" && mark === "`") {
    return offset + 1;
  }
  return offset;
}

function placeCaret(el: HTMLDivElement | null, caret: Caret) {
  if (!el) {
    return;
  }
  const point = domPointForCaret(el, caret);
  if (!point) {
    return;
  }
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeSelection(el: HTMLDivElement | null, range: TextRange) {
  if (!el) {
    return;
  }
  const start = domPointForCaret(el, range.start);
  const end = domPointForCaret(el, range.end);
  if (!start || !end) {
    return;
  }
  const domRange = document.createRange();
  domRange.setStart(start.node, start.offset);
  domRange.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(domRange);
}

function domPointForCaret(el: HTMLDivElement, caret: Caret) {
  const lineEl = el.querySelector(`[data-line="${caret.line}"]`);
  if (!lineEl) {
    return null;
  }
  const nodes = lineNodes(lineEl);
  if (nodes.length === 0) {
    return { node: lineEl, offset: 0 };
  }
  let left = caret.col;
  let target = nodes[nodes.length - 1];
  let offset = target.nodeValue?.length ?? 0;
  for (const node of nodes) {
    const length = node.nodeValue?.length ?? 0;
    if (left <= length) {
      target = node;
      offset = left;
      break;
    }
    left -= length;
  }
  return { node: target, offset };
}

function wrapSelection(value: string, range: TextRange, mark: string) {
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

function normalizeRange(range: TextRange): TextRange {
  return compareCarets(range.start, range.end) <= 0 ? range : { start: range.end, end: range.start };
}

function compareCarets(a: Caret, b: Caret) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.col - b.col;
}

function isCollapsedRange(range: TextRange) {
  return range.start.line === range.end.line && range.start.col === range.end.col;
}

function selectedText(value: string, range: TextRange) {
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

function replaceRange(value: string, range: TextRange, text: string) {
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

function insertLineBreak(value: string, caret: Caret) {
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

function joinWithPreviousLine(value: string, caret: Caret) {
  const lines = value.split("\n");
  const previousLength = lines[caret.line - 1]?.length ?? 0;
  lines[caret.line - 1] = (lines[caret.line - 1] ?? "") + (lines[caret.line] ?? "");
  lines.splice(caret.line, 1);
  return { value: lines.join("\n"), caret: { line: caret.line - 1, col: previousLength } };
}

function deleteBackward(value: string, caret: Caret) {
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

function deleteForward(value: string, caret: Caret) {
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

function deleteRange(value: string, range: TextRange) {
  return replaceRange(value, range, "");
}

function deleteBackwardWord(value: string, caret: Caret) {
  const start = previousWordCaret(value, caret);
  if (compareCarets(start, caret) === 0) {
    return deleteBackward(value, caret);
  }
  return deleteRange(value, { start, end: caret });
}

function deleteForwardWord(value: string, caret: Caret) {
  const end = nextWordCaret(value, caret);
  if (compareCarets(caret, end) === 0) {
    return deleteForward(value, caret);
  }
  return deleteRange(value, { start: caret, end });
}

function previousWordCaret(value: string, caret: Caret): Caret {
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

function nextWordCaret(value: string, caret: Caret): Caret {
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

function isWordChar(char: string) {
  return /[\p{L}\p{N}_]/u.test(char);
}

function insertText(value: string, range: TextRange, text: string) {
  const chunks = normalizeMarkdownText(text).split("\n");
  return replaceRange(value, range, chunks.join("\n"));
}

function normalizeMarkdownText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+-\s+(?=(\*\*|[A-Za-zÀ-ÿ]))/g, "$1\n- ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
