import { diagramSummary, diagramToSvgMarkup, parseDiagramMarker } from "../diagram";
import { parseInline } from "./inline";
import type { MarkdownInline } from "./inline";

const syntaxColor = "#a7acb2";

export function renderEditableMarkdown(value: string, activeLine: number) {
  return value.split("\n").map((line, index) => renderEditableLine(line, index === activeLine, index)).join("");
}

export function renderEditableLine(raw: string, active: boolean, index: number) {
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
    const check = `${deco(`<span data-check="${index}" style="cursor:pointer;font-size:13px;margin-right:8px;color:${done ? "#3f7d58" : "#aeb4ba"};">${done ? "☑" : "☐"}</span>`)}${syn(match[1] + match[3])}`;
    return `<div data-line="${index}" style="${base}display:flex;align-items:baseline;">${check}<span style="${done ? "color:#a2a8ae;text-decoration:line-through;" : ""}">${inlineMarkdown(match[4], active)}</span></div>`;
  }

  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(raw)) {
    return `<div data-line="${index}" class="markdown-editor-divider" style="${base}display:flex;align-items:center;gap:10px;margin:10px 0;">${syn(raw)}${deco('<span class="markdown-editor-divider-rule"></span>')}</div>`;
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

  const diagram = parseDiagramMarker(raw);
  if (diagram && !active) {
    const preview = [
      `<span data-diagram-drag-line="${index}" class="markdown-editor-diagram-drag">${diagramToSvgMarkup(diagram, 320)}</span>`,
      `<span class="markdown-editor-diagram-meta"><span>${escapeHtml(diagramSummary(diagram))}</span><em data-diagram-edit-line="${index}">Edit diagram</em><small>drag to move</small></span>`,
      `<span data-diagram-resize-line="${index}" class="markdown-editor-diagram-resize" aria-hidden="true"></span>`,
    ].join("");
    return `<div data-line="${index}" style="${base}margin:16px 0;">${syn(raw)}${deco(`<span data-diagram-line="${index}" contenteditable="false" class="markdown-editor-diagram-card">${preview}</span>`)}</div>`;
  }

  if (!raw.length) {
    return `<div data-line="${index}" style="${base}"><br /></div>`;
  }
  return `<div data-line="${index}" style="${base}">${inlineMarkdown(raw, active)}</div>`;
}

function inlineMarkdown(raw: string, active: boolean) {
  return parseInline(raw).map((node) => inlineNode(node, active)).join("");
}

function inlineNode(node: MarkdownInline, active: boolean): string {
  if (node.type === "text") {
    return escapeHtml(node.text);
  }
  if (node.type === "code") {
    const content = `<code>${escapeHtml(node.text)}</code>`;
    return active ? `${syntaxMark("`")}${content}${syntaxMark("`")}` : content;
  }
  if (node.type === "strong") {
    const content = `<strong>${node.children.map((child) => inlineNode(child, active)).join("")}</strong>`;
    return active ? `${syntaxMark("**")}${content}${syntaxMark("**")}` : content;
  }
  if (node.type === "em") {
    const content = `<em>${node.children.map((child) => inlineNode(child, active)).join("")}</em>`;
    return active ? `${syntaxMark("*")}${content}${syntaxMark("*")}` : content;
  }
  if (node.type === "strike") {
    const content = `<s>${node.children.map((child) => inlineNode(child, active)).join("")}</s>`;
    return active ? `${syntaxMark("~~")}${content}${syntaxMark("~~")}` : content;
  }
  if (node.type === "underline") {
    const content = `<u>${node.children.map((child) => inlineNode(child, active)).join("")}</u>`;
    return active ? `${syntaxMark("<u>")}${content}${syntaxMark("</u>")}` : content;
  }
  const children = node.text.map((child) => inlineNode(child, active)).join("");
  const content = node.safe
    ? `<a href="${escapeAttribute(node.href)}" target="_blank" rel="noreferrer"${node.title ? ` title="${escapeAttribute(node.title)}"` : ""}>${children}</a>`
    : `<span class="markdown-link-invalid">${children}</span>`;
  if (!active) {
    return content;
  }
  return `${syntaxMark("[")}${content}${syntaxMark(`](${node.source})`)}`;
}

function syntaxMark(mark: string) {
  return `<span style="color:${syntaxColor};">${escapeHtml(mark)}</span>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
