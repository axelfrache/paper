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
    .map((line) => lineNodes(line).map((node) => node.nodeValue ?? "").join(""))
    .join("\n");
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
  const anchor = pointToCaret(el, selection.anchorNode, selection.anchorOffset);
  const focus = pointToCaret(el, selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) {
    return null;
  }
  return normalizeRange({ start: anchor, end: focus });
}

export function pointToCaret(el: HTMLDivElement, node: Node, offset: number): Caret | null {
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

export function lineElements(el: HTMLDivElement) {
  return Array.from(el.querySelectorAll("[data-line]"));
}

export function lineLength(lineEl: Element) {
  return lineNodes(lineEl).reduce((length, node) => length + (node.nodeValue?.length ?? 0), 0);
}

export function sourceTextLength(node: Node): number {
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
  if (!parent || offset !== value.length || !["STRONG", "EM", "CODE", "A"].includes(parent.tagName)) {
    return offset;
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
  return offset;
}

export function placeCaret(el: HTMLDivElement | null, caret: Caret) {
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

export function domPointForCaret(el: HTMLDivElement, caret: Caret) {
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
