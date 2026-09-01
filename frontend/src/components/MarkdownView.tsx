import type { ReactNode } from "react";
import { diagramSummary, diagramToSvgMarkup } from "../lib/diagram";
import { parseBlocks, parseInline } from "../lib/markdown/render";
import type { MarkdownBlock, MarkdownInline } from "../lib/markdown/render";

type MarkdownViewProps = {
  text: string;
  className?: string;
};

export function MarkdownView({ text, className }: MarkdownViewProps) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={className ? `markdown-view ${className}` : "markdown-view"}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    const Heading = `h${Math.min(block.level + 2, 5)}` as "h3" | "h4" | "h5";
    return <Heading key={index}>{renderInline(block.text)}</Heading>;
  }
  if (block.type === "paragraph") {
    return <p key={index}>{renderInline(block.text)}</p>;
  }
  if (block.type === "quote") {
    return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
  }
  if (block.type === "code") {
    return (
      <pre key={index}>
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "divider") {
    return <hr key={index} />;
  }
  if (block.type === "diagram") {
    return (
      <figure key={index} className="markdown-diagram-card">
        <div dangerouslySetInnerHTML={{ __html: diagramToSvgMarkup(block.diagram, 320) }} />
        <figcaption>{diagramSummary(block.diagram)}</figcaption>
      </figure>
    );
  }
  if (block.type === "ol") {
    return (
      <ol key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "tasks") {
    return (
      <ul key={index} className="markdown-tasks">
        {block.items.map((item, itemIndex) => (
          <li key={`${item.text}-${itemIndex}`} className={item.done ? "done" : ""}>
            <span>{item.done ? "☑" : "☐"}</span>
            <p>{renderInline(item.text)}</p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul key={index}>
      {block.items.map((item, itemIndex) => (
        <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
      ))}
    </ul>
  );
}

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map(renderInlineNode);
}

function renderInlineNode(node: MarkdownInline, index: number): ReactNode {
  if (node.type === "text") {
    return node.text;
  }
  if (node.type === "image") {
    return node.safe ? <img key={index} src={node.href} alt={node.alt} /> : <span key={index} className="markdown-link-invalid">{`![${node.alt}](${node.source})`}</span>;
  }
  if (node.type === "code") {
    return <code key={index}>{node.text}</code>;
  }
  if (node.type === "strong") {
    return <strong key={index}>{node.children.map(renderInlineNode)}</strong>;
  }
  if (node.type === "em") {
    return <em key={index}>{node.children.map(renderInlineNode)}</em>;
  }
  if (node.type === "strike") {
    return <s key={index}>{node.children.map(renderInlineNode)}</s>;
  }
  if (node.type === "underline") {
    return <u key={index}>{node.children.map(renderInlineNode)}</u>;
  }
  if (!node.safe) {
    return <span key={index} className="markdown-link-invalid">{node.text.map(renderInlineNode)}</span>;
  }
  return (
    <a key={index} href={node.href} target="_blank" rel="noreferrer" title={node.title}>
      {node.text.map(renderInlineNode)}
    </a>
  );
}
