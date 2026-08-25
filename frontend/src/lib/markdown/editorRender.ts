import { diagramSummary, diagramToSvgMarkup, parseDiagramMarker } from "../diagram";
import { safeHref } from "./render";

const syntaxColor = "#a7acb2";

type InlineToken =
  | { start: number; end: number; type: "format"; mark: string; tag: "code" | "strong" | "em"; text: string }
  | { start: number; end: number; type: "link"; text: string; href: string };

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
  let html = "";
  let index = 0;

  while (index < raw.length) {
    const token = nextInlineToken(raw, index);
    if (!token) {
      html += escapeHtml(raw.slice(index));
      break;
    }
    html += escapeHtml(raw.slice(index, token.start));
    html += token.type === "link" ? linkToken(token.text, token.href, active) : inlineToken(token.mark, token.tag, token.text, active);
    index = token.end;
  }

  return html;
}

function nextInlineToken(raw: string, from: number): InlineToken | null {
  for (let index = from; index < raw.length; index += 1) {
    const char = raw[index];

    if (char === "[") {
      const labelEnd = raw.indexOf("]", index + 1);
      if (labelEnd > index + 1 && raw[labelEnd + 1] === "(") {
        const hrefEnd = raw.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2) {
          return {
            start: index,
            end: hrefEnd + 1,
            type: "link",
            text: raw.slice(index + 1, labelEnd),
            href: raw.slice(labelEnd + 2, hrefEnd),
          };
        }
      }
    }

    if (char === "`") {
      const end = raw.indexOf("`", index + 1);
      if (end > index + 1) {
        return { start: index, end: end + 1, type: "format", mark: "`", tag: "code", text: raw.slice(index + 1, end) };
      }
    }

    if (raw.startsWith("**", index)) {
      const end = raw.indexOf("**", index + 2);
      if (end > index + 2) {
        return { start: index, end: end + 2, type: "format", mark: "**", tag: "strong", text: raw.slice(index + 2, end) };
      }
      index += 1;
      continue;
    }

    if (char === "*" && raw[index - 1] !== "*" && raw[index + 1] !== "*") {
      const end = findClosingSingleStar(raw, index + 1);
      if (end > index + 1) {
        return { start: index, end: end + 1, type: "format", mark: "*", tag: "em", text: raw.slice(index + 1, end) };
      }
    }
  }

  return null;
}

function findClosingSingleStar(raw: string, from: number) {
  for (let index = from; index < raw.length; index += 1) {
    if (raw[index] === "*" && raw[index - 1] !== "*" && raw[index + 1] !== "*") {
      return index;
    }
  }
  return -1;
}

function inlineToken(mark: string, tag: "code" | "strong" | "em", text: string, active: boolean) {
  const content = `<${tag}>${escapeHtml(text)}</${tag}>`;
  if (!active) {
    return content;
  }
  return `${syntaxMark(mark)}${content}${syntaxMark(mark)}`;
}

function linkToken(text: string, href: string, active: boolean) {
  const safe = safeHref(href);
  const content = safe
    ? `<a href="${escapeAttribute(safe)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`
    : `<span class="markdown-link-invalid">${escapeHtml(text)}</span>`;
  if (!active) {
    return content;
  }
  return `${syntaxMark("[")}${content}${syntaxMark(`](${href})`)}`;
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
