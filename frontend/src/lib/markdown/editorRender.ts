import { diagramSummary, diagramToSvgMarkup, parseDiagramMarker } from "../diagram";
import { parseInline } from "./inline";
import type { MarkdownInline } from "./inline";
import { defaultTextAlign, readAlign } from "./align";
import { isDivider } from "./render";
import { isResourceLine, standaloneImage } from "./resource";

const syntaxColor = "#a7acb2";

export function renderEditableMarkdown(value: string, activeLine: number, selectedResourceLine = -1) {
  const lines = value.split("\n");
  const html = lines
    .map((line, index) => renderEditableLine(line, index === activeLine, index, index === selectedResourceLine))
    .join("");
  // Only a resource needs an extra line: the caret cannot sit inside an image or a
  // diagram, whereas a divider line holds it fine. The extra line is not part of the source.
  const lastLine = lines[lines.length - 1] ?? "";
  return isResourceLine(lastLine) ? `${html}${renderEditableLine("", false, lines.length)}` : html;
}

export function renderEditableLine(rawLine: string, active: boolean, index: number, selectedResource = false) {
  // The alignment marker is stripped from what is drawn and handed back to the DOM as a
  // decoration, so `readSource` still reconstructs the line exactly as it is stored.
  const { text: raw, align } = readAlign(rawLine);
  const alignStyle = align === defaultTextAlign ? "" : `text-align:${align};`;
  const alignMark =
    align === defaultTextAlign ? "" : `<span data-deco="1" data-source="{align=${align}}"></span>`;
  const base = `min-height:1.75em;${alignStyle}`;
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

  if (isDivider(raw)) {
    // Styled like any other line (`base`, no margin or padding) so the divider always
    // occupies exactly one line and does not grow when the caret lands on it and
    // reveals the `---`. The rule must be a direct flex child for `flex: 1` to stretch it.
    return `<div data-line="${index}" class="markdown-editor-divider" style="${base}display:flex;align-items:center;gap:10px;">${syn(raw)}<span data-deco="1" class="markdown-editor-divider-rule"></span></div>`;
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
  if (diagram) {
    const preview = [
      `<span class="markdown-editor-diagram-preview">${diagramToSvgMarkup(diagram, 320)}</span>`,
      `<span class="markdown-editor-diagram-meta"><span>${escapeHtml(diagramSummary(diagram))}</span><em data-diagram-edit-line="${index}">Edit diagram</em></span>`,
      `<span data-diagram-resize-line="${index}" class="markdown-editor-diagram-resize" aria-hidden="true"></span>`,
      `<span data-diagram-width-resize-line="${index}" class="markdown-editor-diagram-width-resize" aria-hidden="true"></span>`,
    ].join("");
    return resourceBlock(raw, index, "diagram", preview, selectedResource, diagram.preview?.width);
  }

  const image = standaloneImage(raw);
  if (image?.safe) {
    const resized = image.width ? " is-resized" : "";
    const preview = [
      `<span class="markdown-editor-image${resized}"><img src="${escapeAttribute(image.href)}" alt="${escapeAttribute(image.alt)}" draggable="false" /></span>`,
      `<span data-image-resize-line="${index}" class="markdown-editor-image-resize" aria-hidden="true"></span>`,
    ].join("");
    return resourceBlock(raw, index, "image", preview, selectedResource, image.width);
  }

  if (!raw.length) {
    return `<div data-line="${index}" style="${base}"><br /></div>`;
  }
  return `<div data-line="${index}" style="${base}">${inlineMarkdown(raw, active)}${alignMark}</div>`;
}

function resourceBlock(
  raw: string,
  index: number,
  kind: "diagram" | "image",
  preview: string,
  selected: boolean,
  width?: number,
) {
  const selection = selected ? " is-selected" : "";
  const surfaceClass = kind === "diagram" ? " markdown-editor-diagram-card" : " markdown-editor-image-card";
  const surfaceStyle = width ? ` style="width:min(100%, ${width}px);"` : "";
  return [
    `<div data-line="${index}" data-resource-line="${index}" data-resource-kind="${kind}" data-source="${escapeAttribute(raw)}" contenteditable="false" class="markdown-editor-resource-line${selection}">`,
    `<span data-deco="1" data-resource-surface="${index}"${kind === "diagram" ? ` data-diagram-line="${index}"` : ""} class="markdown-editor-resource-surface${surfaceClass}"${surfaceStyle}>${preview}<button type="button" data-resource-delete-line="${index}" class="markdown-editor-resource-delete" aria-label="Delete ${kind}" title="Delete">×</button></span>`,
    `<span data-resource-caret-line="${index}" contenteditable="true" class="markdown-editor-resource-caret"><br /></span>`,
    `</div>`,
  ].join("");
}

function inlineMarkdown(raw: string, active: boolean) {
  return parseInline(raw).map((node) => inlineNode(node, active)).join("");
}

function inlineNode(node: MarkdownInline, active: boolean): string {
  if (node.type === "text") {
    return escapeHtml(node.text);
  }
  if (node.type === "image") {
    const marker = imageMarker(node);
    if (active || !node.safe) {
      return escapeHtml(marker);
    }
    const resized = node.width ? " is-resized" : "";
    const style = node.width ? ` style="width:min(100%, ${node.width}px);"` : "";
    return `<span data-source="${escapeAttribute(marker)}" class="markdown-editor-image${resized}"${style}><img src="${escapeAttribute(node.href)}" alt="${escapeAttribute(node.alt)}" draggable="false" /></span>`;
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

function imageMarker(node: Extract<MarkdownInline, { type: "image" }>) {
  return `![${node.alt}](${node.source})${node.width ? `{width=${node.width}}` : ""}`;
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
