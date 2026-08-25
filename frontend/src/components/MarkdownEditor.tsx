import { useLayoutEffect, useRef, useState } from "react";
import type { AIAction } from "../types/note";

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
  onAssist?: (action: AIAction) => void;
  placeholder?: string;
};

const syntaxColor = "#a7acb2";

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  prefix?: string;
  wrap?: string;
  block?: string;
  date?: boolean;
  ai?: AIAction;
};

type SlashState = {
  query: string;
  index: number;
  top: number;
  left: number;
  maxHeight: number;
};

const slashItems: SlashItem[] = [
  { id: "h1", label: "Heading", hint: "Large section title", icon: "H", prefix: "# " },
  { id: "h2", label: "Subheading", hint: "Medium title", icon: "H", prefix: "## " },
  { id: "h3", label: "Small heading", hint: "Minor title", icon: "H", prefix: "### " },
  { id: "task", label: "Task", hint: "Checkbox, feeds the Tasks view", icon: "☐", prefix: "- [ ] " },
  { id: "bullet", label: "Bullet list", hint: "Plain list item", icon: "•", prefix: "- " },
  { id: "quote", label: "Quote", hint: "Indented aside", icon: "❝", prefix: "> " },
  { id: "code", label: "Code", hint: "Inline monospace", icon: "‹›", wrap: "`" },
  { id: "bold", label: "Bold", hint: "Emphasis", icon: "B", wrap: "**" },
  { id: "divider", label: "Divider", hint: "Horizontal rule", icon: "—", block: "---" },
  { id: "date", label: "Today's date", hint: "Insert as text", icon: "◷", date: true },
  { id: "ai-summary", label: "Summarize note", hint: "AI", icon: "≡", ai: "summarize" },
  { id: "ai-tasks", label: "Extract tasks", hint: "AI", icon: "☑", ai: "extract_tasks" },
  { id: "ai-title", label: "Suggest title", hint: "AI", icon: "✎", ai: "suggest_title" },
];

export function MarkdownEditor({ value, onChange, onAssist, placeholder = "Start writing..." }: MarkdownEditorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const slashBodyRef = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef(false);
  const caretRef = useRef<Caret | null>(null);
  const activeLineRef = useRef(-1);
  const [slash, setSlash] = useState<SlashState | null>(null);

  useLayoutEffect(() => {
    renderMarkdown(editorRef.current, value, focusedRef.current ? caretRef.current?.line ?? -1 : -1);
    activeLineRef.current = focusedRef.current ? caretRef.current?.line ?? -1 : -1;
    if (focusedRef.current && caretRef.current) {
      placeCaret(editorRef.current, caretRef.current);
      probeSlash(value, caretRef.current);
    }
  }, [value]);

  useLayoutEffect(() => {
    const body = slashBodyRef.current;
    const active = body?.querySelector<HTMLElement>(".slash-menu-row.active");
    if (!body || !active) {
      return;
    }
    const pad = 5;
    const top = active.offsetTop - body.offsetTop - pad;
    const bottom = active.offsetTop - body.offsetTop + active.offsetHeight + pad;
    const visibleTop = body.scrollTop;
    const visibleBottom = visibleTop + body.clientHeight;

    if (top < visibleTop) {
      body.scrollTop = top;
    } else if (bottom > visibleBottom) {
      body.scrollTop = bottom - body.clientHeight;
    }
  }, [slash?.index, slash?.query]);

  const syncActiveLine = () => {
    const range = getSelectionRange(editorRef.current);
    if (range && !isCollapsedRange(range)) {
      caretRef.current = range.end;
      setSlash(null);
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
    probeSlash(value, caret);
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

    if (slash) {
      const items = filteredSlashItems(slash.query);
      const index = Math.min(slash.index, Math.max(0, items.length - 1));
      if (event.key === "Escape") {
        event.preventDefault();
        setSlash(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlash({ ...slash, index: Math.min(index + 1, items.length - 1) });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlash({ ...slash, index: Math.max(index - 1, 0) });
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && items.length) {
        event.preventDefault();
        runSlash(items[index], caret);
        return;
      }
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
    setSlash(null);
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
    setSlash(null);
    const text = event.clipboardData.getData("text/plain");
    const caret = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    const next = insertText(value, getSelectionRange(editorRef.current) ?? { start: caret, end: caret }, text);
    setSource(next.value, next.caret);
  };

  const filteredItems = filteredSlashItems(slash?.query ?? "");

  return (
    <div ref={wrapRef} className="markdown-editor-wrap">
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
      {slash && filteredItems.length ? (
        <div className="slash-menu" style={{ top: slash.top, left: slash.left }}>
          <div className="slash-menu-header">
            <span>{slash.query ? `/${slash.query}` : "/"}</span>
            <em>↑↓ ↵</em>
          </div>
          <div ref={slashBodyRef} className="slash-menu-body" style={{ maxHeight: slash.maxHeight }}>
            {filteredItems.map((item, index) => (
              <button
                key={item.id}
                className={index === Math.min(slash.index, filteredItems.length - 1) ? "slash-menu-row active" : "slash-menu-row"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  runSlash(item, caretRef.current ?? getCaret(editorRef.current) ?? { line: 0, col: 0 });
                }}
                onMouseEnter={() => setSlash((current) => current ? { ...current, index } : current)}
              >
                <span>{item.icon}</span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  function probeSlash(source: string, caret: Caret) {
    const line = source.split("\n")[caret.line] ?? "";
    const match = /(?:^|\s)\/([\w-]*)$/.exec(line.slice(0, caret.col));
    const selectionRange = getSelectionRange(editorRef.current);
    if (!match || (selectionRange && !isCollapsedRange(selectionRange))) {
      setSlash(null);
      return;
    }
    const wrap = wrapRef.current;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!wrap || !editor || !selection?.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect: DOMRect | null = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      const lineEl = editor.querySelector(`[data-line="${caret.line}"]`);
      rect = lineEl?.getBoundingClientRect() ?? null;
    }
    if (!rect) {
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const scrollHost = scrollParent(wrap);
    const scrollRect = scrollHost?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const query = match[1].toLowerCase();
    const count = filteredSlashItems(query).length;
    const gap = 8;
    const header = 34;
    const pad = 10;
    const row = 33;
    const desiredHeight = Math.min(header + pad + count * row, header + pad + 264);
    const roomBelow = scrollRect.bottom - rect.bottom - gap * 2;
    const roomAbove = rect.top - scrollRect.top - gap * 2;
    const above = desiredHeight > roomBelow && roomAbove > roomBelow;
    const available = Math.max(120, above ? roomAbove : roomBelow);
    const height = Math.min(desiredHeight, available);
    const minTop = scrollRect.top - wrapRect.top + gap;
    const maxTop = scrollRect.bottom - wrapRect.top - height - gap;
    const top = Math.max(minTop, Math.min(above ? rect.top - wrapRect.top - height - gap : rect.bottom - wrapRect.top + gap, maxTop));
    const left = Math.max(0, Math.min(rect.left - wrapRect.left, wrapRect.width - 268));

    setSlash((current) => ({
      query,
      index: current?.query === query ? Math.min(current.index, Math.max(0, count - 1)) : 0,
      top,
      left,
      maxHeight: Math.max(120, height - header - pad),
    }));
  }

  function runSlash(item: SlashItem, caret: Caret) {
    const lines = value.split("\n");
    const line = lines[caret.line] ?? "";
    const before = line.slice(0, caret.col);
    const after = line.slice(caret.col);
    const match = /\/[\w-]*$/.exec(before);
    const start = match ? match.index : caret.col;
    const stem = before.slice(0, start);
    setSlash(null);

    if (item.ai) {
      lines[caret.line] = stem + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length });
      onAssist?.(item.ai);
      return;
    }

    if (item.block) {
      lines.splice(caret.line, 1, stem + after, item.block, "");
      const keepLine = stem.trim() || after.trim();
      if (!keepLine) {
        lines.splice(caret.line, 1);
      }
      setSource(lines.join("\n"), { line: keepLine ? caret.line + 2 : caret.line + 1, col: 0 });
      return;
    }

    if (item.wrap) {
      lines[caret.line] = stem + item.wrap + item.wrap + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length + item.wrap.length });
      return;
    }

    if (item.date) {
      const text = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      lines[caret.line] = stem + text + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length + text.length });
      return;
    }

    const existing = /^(#{1,3}\s+|-\s\[[ xX]\]\s+|[-*]\s+|>\s+)/.exec(stem);
    const body = existing ? stem.slice(existing[0].length) : stem;
    const prefix = item.prefix ?? "";
    lines[caret.line] = prefix + body + after;
    setSource(lines.join("\n"), { line: caret.line, col: prefix.length + body.length });
  }
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

function filteredSlashItems(query: string) {
  const normalized = query.trim().toLowerCase();
  return slashItems.filter((item) => !normalized || item.label.toLowerCase().includes(normalized) || item.id.includes(normalized));
}

function scrollParent(el: HTMLElement | null) {
  let current = el?.parentElement ?? null;
  while (current && current !== document.body) {
    const overflow = window.getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
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
