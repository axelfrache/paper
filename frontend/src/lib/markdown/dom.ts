import { graphemeBoundary } from "./grapheme";
import { normalizeRange } from "./edit";
import type { Caret, TextRange } from "./edit";

export function lineNodes(lineEl: Element | null) {
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

export function readSource(el: HTMLDivElement | null) {
  if (!el) {
    return "";
  }
  return Array.from(el.querySelectorAll("[data-line]"))
    .map((line) => sourceText(line))
    .join("\n");
}

function sourceText(node: Node): string {
  if (node instanceof HTMLElement && node.dataset.source) {
    return node.dataset.source;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? "";
  }
  if (node instanceof HTMLElement && node.dataset.deco) {
    return "";
  }
  return Array.from(node.childNodes).map(sourceText).join("");
}

export function getCaret(el: HTMLDivElement | null): Caret | null {
  const selection = window.getSelection();
  if (!el || !selection || !selection.rangeCount || !selection.focusNode) {
    return null;
  }
  return pointToCaret(el, selection.focusNode, selection.focusOffset);
}

export function getSelectionRange(el: HTMLDivElement | null): TextRange | null {
  const selection = window.getSelection();
  if (!el || !selection || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) {
    return null;
  }
  // A range ending at a formatted word must not implicitly include its closing
  // delimiter: deleting just the last letter would otherwise break the markup.
  const anchor = pointToCaret(el, selection.anchorNode, selection.anchorOffset, selection.isCollapsed);
  const focus = pointToCaret(el, selection.focusNode, selection.focusOffset, selection.isCollapsed);
  if (!anchor || !focus) {
    return null;
  }
  const range = normalizeRange({ start: anchor, end: focus });
  return selection.isCollapsed ? range : includeFullySelectedWrappers(el, range);
}

function includeFullySelectedWrappers(el: HTMLDivElement, range: TextRange): TextRange {
  const result = { start: { ...range.start }, end: { ...range.end } };
  for (const wrapper of Array.from(el.querySelectorAll("strong, em, code, s, u, a")).reverse()) {
    const opening = wrapper.previousElementSibling;
    const closing = wrapper.nextElementSibling;
    if (opening?.getAttribute("data-syntax-side") !== "open" || closing?.getAttribute("data-syntax-side") !== "close") continue;
    const content = lineNodes(wrapper).filter((node) => !isSyntaxMarkNode(node) && node.length);
    const first = content[0], last = content[content.length - 1];
    if (!first || !last || !opening.firstChild || !closing.firstChild) continue;
    const start = pointToCaret(el, first, 0, false)!;
    const end = pointToCaret(el, last, last.length, false)!;
    if (start.line < result.start.line || end.line > result.end.line) continue;
    if (start.line === result.start.line && start.col < result.start.col) continue;
    if (end.line === result.end.line && end.col > result.end.col) continue;
    const sourceStart = pointToCaret(el, opening.firstChild, 0, false)!;
    const sourceEnd = pointToCaret(el, closing.firstChild, closing.textContent?.length ?? 0, false)!;
    if (sourceStart.line === result.start.line) result.start.col = Math.min(result.start.col, sourceStart.col);
    if (sourceEnd.line === result.end.line) result.end.col = Math.max(result.end.col, sourceEnd.col);
  }
  return result;
}

export function pointToCaret(el: HTMLDivElement, node: Node, offset: number, nudge = true): Caret | null {
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
  const resourceCaret = host.closest("[data-resource-caret-line]");
  if (resourceCaret) {
    return { line: Number(resourceCaret.getAttribute("data-resource-caret-line")), col: 0 };
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
      col += nudge ? caretOffsetInNode(nodes, textNode, offset) : offset;
      return { line, col };
    }
    col += textNode.nodeValue?.length ?? 0;
  }
  return { line, col };
}

export function lineElements(el: HTMLDivElement) {
  return Array.from(el.querySelectorAll("[data-line]"));
}

export function lineLength(lineEl: Element) {
  return lineNodes(lineEl).reduce((length, node) => length + (node.nodeValue?.length ?? 0), 0);
}

export function sourceTextLength(node: Node): number {
  if (node instanceof HTMLElement && node.dataset.source) {
    return node.dataset.source.length;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue?.length ?? 0;
  }
  if (node instanceof HTMLElement && node.dataset.deco) {
    return 0;
  }
  return Array.from(node.childNodes).reduce((length, child) => length + sourceTextLength(child), 0);
}

export function linkElementFromTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
}

export function caretOffsetInNode(nodes: Text[], node: Text, offset: number) {
  const value = node.nodeValue ?? "";
  const parent = node.parentElement;
  if (!parent || offset !== value.length || !["STRONG", "EM", "CODE", "A", "S", "U"].includes(parent.tagName)) {
    return offset;
  }
  const following = nodes.slice(nodes.indexOf(node) + 1);
  if (following[0]?.parentElement?.dataset.syntaxSide === "close") {
    let end = offset;
    for (const mark of following) {
      if (!isSyntaxMarkNode(mark) || mark.parentElement?.dataset.syntaxSide !== "close") break;
      end += mark.nodeValue?.length ?? 0;
    }
    return end;
  }
  const next = nodes[nodes.indexOf(node) + 1];
  const mark = next?.nodeValue ?? "";
  if (parent.tagName === "A" && /^\]\([^)]+\)$/.test(mark)) {
    return offset + mark.length;
  }
  if (parent.tagName === "STRONG" && mark === "**") {
    return offset + 2;
  }
  if (parent.tagName === "EM" && mark === "*") {
    return offset + 1;
  }
  if (parent.tagName === "CODE" && mark === "`") {
    return offset + 1;
  }
  if (parent.tagName === "S" && mark === "~~") {
    return offset + 2;
  }
  if (parent.tagName === "U" && mark === "</u>") {
    return offset + 4;
  }
  return offset;
}

export function placeCaret(el: HTMLDivElement | null, caret: Caret | null) {
  if (!el || !caret) {
    return;
  }
  const point = domPointForCaret(el, caret, true);
  if (!point) {
    return;
  }
  const selection = window.getSelection();
  if (selection?.isCollapsed && selection.focusNode === point.node && selection.focusOffset === point.offset) return;
  selection?.collapse(point.node, point.offset);
  scrollCaretIntoView(el);
}

export function placeSelection(el: HTMLDivElement | null, range: TextRange) {
  if (!el) {
    return;
  }
  range = normalizeRange(range);
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

export function domPointForCaret(el: HTMLDivElement, caret: Caret | null, preferResourceCaret = false) {
  if (!caret) {
    return null;
  }
  if (preferResourceCaret) {
    const resourceCaret = el.querySelector(`[data-resource-caret-line="${caret.line}"]`);
    if (resourceCaret) {
      return { node: resourceCaret, offset: 0 };
    }
  }
  const lineEl = el.querySelector(`[data-line="${caret.line}"]`);
  if (!lineEl) {
    return null;
  }
  const nodes = lineNodes(lineEl);
  if (nodes.length === 0) {
    return { node: lineEl, offset: 0 };
  }
  // Undo, a shorter target line, or a removed wrapper can leave a stale column.
  let left = Math.max(0, Math.min(caret.col, lineLength(lineEl)));
  let target = nodes[nodes.length - 1];
  let offset = target.nodeValue?.length ?? 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const length = node.nodeValue?.length ?? 0;
    if (left <= length) {
      if (isSyntaxMarkNode(node)) {
        const visible = nearestVisiblePoint(nodes, i);
        if (visible) {
          return visible;
        }
        if (!lineEl.classList.contains("markdown-editor-divider")) {
          const br = lineEl.querySelector("br");
          return br?.parentNode
            ? { node: br.parentNode, offset: Array.from(br.parentNode.childNodes).indexOf(br) }
            : { node: lineEl, offset: lineEl.childNodes.length };
        }
      }
      target = node;
      offset = left;
      break;
    }
    left -= length;
  }
  return { node: target, offset };
}

export function isSyntaxMarkNode(node: Text) {
  return node.parentElement?.getAttribute("data-syntax-mark") === "1";
}

export function stepColumn(lineEl: Element, col: number, direction: 1 | -1): number | null {
  const nodes = lineNodes(lineEl);
  let sourceOffset = 0;
  const visible = nodes.flatMap((node) => {
    const text = node.nodeValue ?? "";
    const start = sourceOffset;
    sourceOffset += text.length;
    return isSyntaxMarkNode(node) || !text.length ? [] : [{ start, end: sourceOffset, text }];
  });

  // A divider deliberately keeps a paintable, zero-width source caret.
  if (!visible.length && lineEl.classList.contains("markdown-editor-divider")) {
    return direction === 1 ? (col < sourceOffset ? sourceOffset : null) : (col > 0 ? 0 : null);
  }

  // Hidden syntax is not an extra keyboard stop. Cross every adjacent marker,
  // then move over exactly one visible grapheme in the requested direction.
  if (direction === 1) {
    const span = visible.find((span) => span.end > col);
    return span ? span.start + graphemeBoundary(span.text, Math.max(0, col - span.start), 1) : null;
  }
  const span = [...visible].reverse().find((span) => span.start < col);
  return span ? span.start + graphemeBoundary(span.text, Math.min(span.text.length, col - span.start), -1) : null;
}

/** Delete displayed text without consuming the invisible delimiters beside it. */
export function visibleDeletionRange(el: HTMLDivElement, caret: Caret, direction: -1 | 1): TextRange | null {
  const line = el.querySelector(`[data-line="${caret.line}"]`);
  if (!line) return null;
  let offset = 0;
  const spans = lineNodes(line).map((node) => {
    const start = offset;
    offset += node.length;
    return { node, start, end: offset, hidden: isSyntaxMarkNode(node) };
  });
  const visible = spans.filter((span) => !span.hidden && span.end > span.start);
  const span = direction < 0
    ? [...visible].reverse().find((span) => span.start < caret.col)
    : visible.find((span) => span.end > caret.col);
  if (!span) return null;
  const text = span.node.data;
  let start = direction < 0 ? span.start + graphemeBoundary(text, Math.min(text.length, caret.col - span.start), -1) : Math.max(span.start, caret.col);
  let end = direction < 0 ? Math.min(span.end, caret.col) : span.start + graphemeBoundary(text, Math.max(0, caret.col - span.start), 1);

  // Removing the last character of a formatted run must also remove its empty
  // wrapper, including nested wrappers; otherwise literal ****/<u></u> leaks out.
  let parent = span.node.parentElement;
  while (parent && parent !== line && ["STRONG", "EM", "S", "U", "CODE", "A"].includes(parent.tagName)) {
    const content = visible.filter((part) => parent!.contains(part.node));
    if (content.some((part) => part.start < start || part.end > end)) break;
    const opening = parent.previousElementSibling;
    const closing = parent.nextElementSibling;
    if (opening?.getAttribute("data-syntax-side") !== "open" || closing?.getAttribute("data-syntax-side") !== "close") break;
    const first = spans.find((part) => opening.contains(part.node));
    const last = [...spans].reverse().find((part) => closing.contains(part.node));
    if (!first || !last) break;
    start = first.start;
    end = last.end;
    parent = parent.parentElement;
  }
  return { start: { line: caret.line, col: start }, end: { line: caret.line, col: end } };
}

function nearestVisiblePoint(nodes: Text[], index: number) {
  for (let i = index + 1; i < nodes.length; i++) {
    if (!isSyntaxMarkNode(nodes[i])) {
      return { node: nodes[i] as Node, offset: 0 };
    }
  }
  for (let i = index - 1; i >= 0; i--) {
    if (!isSyntaxMarkNode(nodes[i])) {
      return { node: nodes[i] as Node, offset: nodes[i].nodeValue?.length ?? 0 };
    }
  }
  return null;
}

const pendingCaretScroll = new WeakSet<HTMLDivElement>();

/** Programmatic selections do not get the browser's native keyboard scrolling. */
export function scrollCaretIntoView(el: HTMLDivElement) {
  if (pendingCaretScroll.has(el)) return;
  pendingCaretScroll.add(el);
  window.requestAnimationFrame(() => {
    pendingCaretScroll.delete(el);
    const selection = window.getSelection();
    if (!el.isConnected || !selection?.focusNode || !el.contains(selection.focusNode)) return;
    const range = document.createRange();
    range.setStart(selection.focusNode, selection.focusOffset);
    range.collapse(true);
    if (!range.getBoundingClientRect) return;
    let rect = range.getBoundingClientRect();
    if (!rect.height) {
      const parent = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode.parentElement;
      rect = parent?.closest("[data-line]")?.getBoundingClientRect() ?? rect;
    }
    if (!rect.height) return;
    let top = rect.top, bottom = rect.bottom, left = rect.left, right = rect.right;
    for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) {
      const viewport = parent === document.scrollingElement;
      const style = getComputedStyle(parent);
      const vertical = viewport || /auto|scroll|overlay/.test(style.overflowY);
      const horizontal = viewport || /auto|scroll|overlay/.test(style.overflowX);
      if (!vertical && !horizontal) continue;
      const bounds = parent.getBoundingClientRect();
      const y = viewport ? 0 : bounds.top + parent.clientTop;
      const x = viewport ? 0 : bounds.left + parent.clientLeft;
      const height = viewport ? window.innerHeight : parent.clientHeight;
      const width = viewport ? window.innerWidth : parent.clientWidth;
      const dy = vertical ? (top < y ? top - y : Math.max(0, bottom - y - height)) : 0;
      const dx = horizontal ? (left < x ? left - x : Math.max(0, right - x - width)) : 0;
      const oldTop = parent.scrollTop, oldLeft = parent.scrollLeft;
      if (dy || dx) parent.scrollTo({ top: oldTop + dy, left: oldLeft + dx, behavior: "instant" });
      top -= parent.scrollTop - oldTop;
      bottom -= parent.scrollTop - oldTop;
      left -= parent.scrollLeft - oldLeft;
      right -= parent.scrollLeft - oldLeft;
    }
  });
}
