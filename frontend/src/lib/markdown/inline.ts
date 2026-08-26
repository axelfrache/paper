export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "link"; text: MarkdownInline[]; href: string; source: string; title?: string; safe: boolean }
  | { type: "code"; text: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] }
  | { type: "strike"; children: MarkdownInline[] }
  | { type: "underline"; children: MarkdownInline[] };

type ParsedLink = {
  node: MarkdownInline;
  end: number;
};

type LinkParts = {
  href: string;
  title?: string;
};

export function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let buffer = "";
  let index = 0;

  const pushBuffer = () => {
    if (buffer) {
      nodes.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (index < text.length) {
    const link = parseLink(text, index);
    if (link) {
      pushBuffer();
      nodes.push(link.node);
      index = link.end;
      continue;
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        pushBuffer();
        nodes.push({ type: "code", text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith("~~", index)) {
      const end = text.indexOf("~~", index + 2);
      if (end > index + 2) {
        pushBuffer();
        nodes.push({ type: "strike", children: parseInline(text.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("<u>", index)) {
      const end = text.indexOf("</u>", index + 3);
      if (end > index + 3) {
        pushBuffer();
        nodes.push({ type: "underline", children: parseInline(text.slice(index + 3, end)) });
        index = end + 4;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        pushBuffer();
        nodes.push({ type: "strong", children: parseInline(text.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "*" && text[index - 1] !== "*" && text[index + 1] !== "*") {
      const end = findClosingSingleStar(text, index + 1);
      if (end > index + 1) {
        pushBuffer();
        nodes.push({ type: "em", children: parseInline(text.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }

  pushBuffer();
  return nodes;
}

export function safeHref(value: string) {
  const href = value.trim();
  if (!href || /[\s\x00-\x1f\x7f]/.test(href)) {
    return "";
  }
  const protocol = href.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if (protocol) {
    return ["http", "https", "mailto", "tel"].includes(protocol) ? href : "";
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }
  return "";
}

function parseLink(text: string, start: number): ParsedLink | null {
  if (text[start] !== "[") {
    return null;
  }
  const labelEnd = findUnescaped(text, "]", start + 1);
  if (labelEnd <= start + 1 || text[labelEnd + 1] !== "(") {
    return null;
  }
  const label = text.slice(start + 1, labelEnd);
  if (!label.trim()) {
    return null;
  }
  const hrefEnd = findClosingLinkParen(text, labelEnd + 2);
  if (hrefEnd < 0) {
    return null;
  }
  const source = text.slice(labelEnd + 2, hrefEnd).trim();
  const parts = parseLinkParts(source);
  if (!parts) {
    return null;
  }
  const safe = safeHref(parts.href);
  return {
    end: hrefEnd + 1,
    node: {
      type: "link",
      text: parseInline(label),
      href: safe || parts.href,
      source,
      title: parts.title,
      safe: Boolean(safe),
    },
  };
}

function parseLinkParts(source: string): LinkParts | null {
  if (!source) {
    return null;
  }
  if (source.startsWith("<")) {
    const close = findUnescaped(source, ">", 1);
    if (close <= 1) {
      return null;
    }
    const href = source.slice(1, close).trim();
    const title = readOptionalTitle(source.slice(close + 1).trim());
    if (title === null) {
      return null;
    }
    return validHref(href) ? { href, ...(title ? { title } : {}) } : null;
  }

  const title = readTrailingTitle(source);
  const href = title ? source.slice(0, title.start).trim() : source.trim();
  if (!validHref(href)) {
    return null;
  }
  return { href, ...(title?.value ? { title: title.value } : {}) };
}

function validHref(href: string) {
  return Boolean(href) && !/[\s\x00-\x1f\x7f]/.test(href);
}

function readOptionalTitle(value: string) {
  if (!value) {
    return "";
  }
  const title = readTitle(value, 0);
  return title && title.end === value.length ? title.value : null;
}

function readTrailingTitle(value: string) {
  const trimmedEnd = value.length;
  if (value.endsWith('"') || value.endsWith("'")) {
    const quote = value[value.length - 1];
    const start = findOpeningQuote(value, quote);
    if (start > 0 && /\s/.test(value[start - 1])) {
      return { start, value: value.slice(start + 1, trimmedEnd - 1) };
    }
  }
  if (value.endsWith(")")) {
    const start = value.lastIndexOf("(");
    if (start > 0 && /\s/.test(value[start - 1])) {
      return { start, value: value.slice(start + 1, trimmedEnd - 1) };
    }
  }
  return null;
}

function readTitle(value: string, start: number) {
  const opener = value[start];
  const closer = opener === "(" ? ")" : opener;
  if (!['"', "'", "("].includes(opener)) {
    return null;
  }
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (value[index] === closer) {
      return { end: index + 1, value: value.slice(start + 1, index) };
    }
  }
  return null;
}

function findOpeningQuote(value: string, quote: string) {
  for (let index = value.length - 2; index >= 0; index -= 1) {
    if (value[index] === quote && value[index - 1] !== "\\") {
      return index;
    }
  }
  return -1;
}

function findUnescaped(value: string, needle: string, from: number) {
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

function findClosingSingleStar(value: string, from: number) {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] === "*" && value[index - 1] !== "*" && value[index + 1] !== "*") {
      return index;
    }
  }
  return -1;
}
