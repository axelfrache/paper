import { useLayoutEffect, useRef, useState } from "react";
import { Bold, BrainCircuit, Boxes, CalendarDays, Code2, FileText, GitBranch, Heading1, Heading2, Heading3, Image, Italic, Link, List, ListChecks, ListTodo, Minus, Quote, Sparkles, Strikethrough, TextCursorInput, Underline, Wand2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createDefaultDiagram,
  parseDiagramMarker,
  previewForDiagram,
  replaceDiagramMarkerAtLine,
  serializeDiagramMarker,
  updateDiagramPreview,
} from "../lib/diagram";
import { generateAI } from "../lib/api";
import { buildDiagramGenerationPrompt, parseGeneratedDiagram } from "../lib/diagramAi";
import {
  deleteBackward,
  deleteBackwardWord,
  deleteForward,
  deleteForwardWord,
  deleteRange,
  focusCaret,
  fullTextRange,
  insertLineBreak,
  insertText,
  isCollapsedRange,
  normalizeRange,
  toggleLink,
  toggleSelection,
  wrapLinkWithHref,
  wrapSelection,
} from "../lib/markdown/edit";
import { renderEditableMarkdown } from "../lib/markdown/editorRender";
import { parseInline, safeHref } from "../lib/markdown/render";
import {
  getCaret,
  getSelectionRange,
  linkElementFromTarget,
  placeCaret,
  placeSelection,
  readSource,
} from "../lib/markdown/dom";
import type { AIAction, NoteImage } from "../types/note";
import type { Diagram, DiagramMode, DiagramPreview } from "../lib/diagram";
import type { Caret, TextRange } from "../lib/markdown/edit";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onUploadImage?: (file: File) => Promise<NoteImage>;
  onAssist?: (action: AIAction) => void;
  onCaretLineChange?: (line: number) => void;
  focusRequest?: { key: string; placement: "start" | "end" | "last" } | null;
  onFocusPrevious?: () => void;
  onFocusNoteList?: () => void;
  onOpenDiagram?: (line: number, diagram: Diagram) => void;
  diagramDescribeRequest?: { key: string; prompt: string } | null;
  placeholder?: string;
};

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  prefix?: string;
  wrap?: string;
  closeWrap?: string;
  link?: boolean;
  block?: string;
  date?: boolean;
  diagram?: DiagramMode;
  diagramDescribe?: boolean;
  image?: boolean;
  ai?: AIAction;
};

type SlashState = {
  query: string;
  index: number;
  top: number;
  left: number;
  maxHeight: number;
};

type SelectionToolbarState = {
  range: TextRange;
  top: number;
  left: number;
};

type SelectionToolbarAction = "bold" | "italic" | "code" | "strike" | "underline" | "link";

type DiagramDescribeTarget = {
  line: number;
};

const slashItems: SlashItem[] = [
  { id: "h1", label: "Heading", hint: "Large section title", icon: Heading1, prefix: "# " },
  { id: "h2", label: "Subheading", hint: "Medium title", icon: Heading2, prefix: "## " },
  { id: "h3", label: "Small heading", hint: "Minor title", icon: Heading3, prefix: "### " },
  { id: "task", label: "Task", hint: "Checkbox, feeds the Tasks view", icon: ListTodo, prefix: "- [ ] " },
  { id: "bullet", label: "Bullet list", hint: "Plain list item", icon: List, prefix: "- " },
  { id: "quote", label: "Quote", hint: "Indented aside", icon: Quote, prefix: "> " },
  { id: "code", label: "Code", hint: "Inline monospace", icon: Code2, wrap: "`" },
  { id: "bold", label: "Bold", hint: "Emphasis", icon: Bold, wrap: "**" },
  { id: "italic", label: "Italic", hint: "Emphasis", icon: Italic, wrap: "*" },
  { id: "strike", label: "Strikethrough", hint: "Crossed text", icon: Strikethrough, wrap: "~~" },
  { id: "underline", label: "Underline", hint: "Underlined text", icon: Underline, wrap: "<u>", closeWrap: "</u>" },
  { id: "link", label: "Link", hint: "Hyperlink", icon: Link, link: true },
  { id: "image", label: "Image", hint: "Upload from your device", icon: Image, image: true },
  { id: "diagram", label: "Flat diagram", hint: "2D schematic", icon: GitBranch, diagram: "flat" },
  { id: "diagram-iso", label: "Isometric diagram", hint: "Projected schematic", icon: Boxes, diagram: "iso" },
  { id: "divider", label: "Divider", hint: "Horizontal rule", icon: Minus, block: "---" },
  { id: "date", label: "Today's date", hint: "Insert as text", icon: CalendarDays, date: true },
  { id: "diagram-describe", label: "Describe diagram", hint: "AI", icon: BrainCircuit, diagramDescribe: true },
  { id: "ai-summary", label: "Summarize note", hint: "AI", icon: FileText, ai: "summarize" },
  { id: "ai-tasks", label: "Extract tasks", hint: "AI", icon: ListChecks, ai: "extract_tasks" },
  { id: "ai-title", label: "Suggest title", hint: "AI", icon: TextCursorInput, ai: "suggest_title" },
];

export function MarkdownEditor({
  value,
  onChange,
  onUploadImage,
  onAssist,
  onCaretLineChange,
  focusRequest = null,
  onFocusPrevious,
  onFocusNoteList,
  onOpenDiagram,
  diagramDescribeRequest = null,
  placeholder = "Start writing...",
}: MarkdownEditorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const slashBodyRef = useRef<HTMLDivElement | null>(null);
  const diagramDescribeDialogRef = useRef<HTMLDialogElement | null>(null);
  const focusedRef = useRef(false);
  const caretRef = useRef<Caret | null>(null);
  const pendingImageCaretRef = useRef<Caret | null>(null);
  const activeLineRef = useRef(-1);
  const handledFocusRequestRef = useRef("");
  const handledDiagramDescribeRequestRef = useRef("");
  const valueRef = useRef(value);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const [selectedResourceLine, setSelectedResourceLine] = useState<number | null>(null);
  const [diagramDescribeOpen, setDiagramDescribeOpen] = useState(false);
  const [diagramDescribeTarget, setDiagramDescribeTarget] = useState<DiagramDescribeTarget | null>(null);
  const [diagramDescribePrompt, setDiagramDescribePrompt] = useState("");
  const [diagramDescribeMode, setDiagramDescribeMode] = useState<DiagramMode>("flat");
  const [diagramDescribeLoading, setDiagramDescribeLoading] = useState(false);
  const [diagramDescribeError, setDiagramDescribeError] = useState<string | null>(null);

  useLayoutEffect(() => {
    valueRef.current = value;
    renderMarkdown(
      editorRef.current,
      value,
      focusedRef.current ? caretRef.current?.line ?? -1 : -1,
      selectedResourceLine ?? -1,
    );
    activeLineRef.current = focusedRef.current ? caretRef.current?.line ?? -1 : -1;
    if (focusedRef.current && caretRef.current && selectedResourceLine === null) {
      placeCaret(editorRef.current, caretRef.current);
      probeSlash(value, caretRef.current);
      onCaretLineChange?.(caretRef.current.line);
    }
  }, [selectedResourceLine, value]);

  useLayoutEffect(() => {
    if (!focusRequest || handledFocusRequestRef.current === focusRequest.key) {
      return;
    }

    handledFocusRequestRef.current = focusRequest.key;
    setSelectedResourceLine(null);
    const target = focusTarget(value, caretRef.current, focusRequest.placement);
    const { caret } = target;
    if (target.value !== value) {
      onChange(target.value);
    }
    focusedRef.current = true;
    caretRef.current = caret;
    activeLineRef.current = caret.line;
    renderMarkdown(editorRef.current, target.value, caret.line);

    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      placeCaret(editor, caret);
      editor.scrollIntoView({ block: "nearest" });
      onCaretLineChange?.(caret.line);
      probeSlash(target.value, caret);
    });
  }, [focusRequest, value]);

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

  useLayoutEffect(() => {
    const dialog = diagramDescribeDialogRef.current;
    if (!dialog) {
      return;
    }
    if (diagramDescribeOpen && !dialog.open) {
      dialog.showModal();
    } else if (!diagramDescribeOpen && dialog.open) {
      dialog.close();
    }
  }, [diagramDescribeOpen]);

  useLayoutEffect(() => {
    if (!diagramDescribeRequest || handledDiagramDescribeRequestRef.current === diagramDescribeRequest.key) {
      return;
    }

    handledDiagramDescribeRequestRef.current = diagramDescribeRequest.key;
    const line = valueRef.current ? valueRef.current.split("\n").length : 0;
    setDiagramDescribeTarget({ line });
    setDiagramDescribePrompt(diagramDescribeRequest.prompt);
    setDiagramDescribeError(null);
    setDiagramDescribeOpen(true);
  }, [diagramDescribeRequest]);

  const syncActiveLine = () => {
    const range = getSelectionRange(editorRef.current);
    if (range && !isCollapsedRange(range)) {
      caretRef.current = range.end;
      onCaretLineChange?.(range.end.line);
      setSlash(null);
      updateSelectionToolbar(range);
      return;
    }

    setSelectionToolbar(null);
    const caret = range?.end ?? getCaret(editorRef.current);
    if (!caret) {
      return;
    }
    caretRef.current = caret;
    onCaretLineChange?.(caret.line);
    if (caret.line !== activeLineRef.current) {
      renderMarkdown(editorRef.current, value, caret.line);
      activeLineRef.current = caret.line;
      placeCaret(editorRef.current, caret);
    }
    probeSlash(value, caret);
  };

  const setSource = (nextValue: string, caret: Caret | null) => {
    valueRef.current = nextValue;
    caretRef.current = caret;
    if (caret) {
      onCaretLineChange?.(caret.line);
    }
    onChange(nextValue);
  };

  const handleInput = () => {
    const caret = getCaret(editorRef.current);
    setSelectionToolbar(null);
    setSource(readSource(editorRef.current), caret);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    if (selectedResourceLine !== null) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeResource(selectedResourceLine);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedResourceLine(null);
      }
      return;
    }
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

    if (
      event.key === "ArrowLeft" &&
      !meta &&
      !event.altKey &&
      !event.shiftKey &&
      (!selectionRange || isCollapsedRange(selectionRange)) &&
      caret.line === 0 &&
      caret.col === 0
    ) {
      event.preventDefault();
      setSlash(null);
      onFocusNoteList?.();
      return;
    }

    if (
      event.key === "ArrowUp" &&
      !meta &&
      !event.altKey &&
      !event.shiftKey &&
      (!selectionRange || isCollapsedRange(selectionRange)) &&
      caret.line === 0
    ) {
      event.preventDefault();
      setSlash(null);
      onFocusPrevious?.();
      return;
    }

    if (meta && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const range = fullTextRange(value);
      caretRef.current = range.end;
      placeSelection(editorRef.current, range);
      updateSelectionToolbar(range);
      return;
    }

    if (meta && !event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const range = selectionRange ?? { start: caret, end: caret };
      const next = applyAcrossResources(value, range, (source, lineRange) => toggleLink(source, lineRange));
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (meta && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      const range = selectionRange ?? { start: caret, end: caret };
      const next = applyAcrossResources(value, range, (source, lineRange) => toggleSelection(source, lineRange, "<u>", "</u>"));
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (meta && ["b", "i"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const mark = event.key.toLowerCase() === "b" ? "**" : "*";
      const range = selectionRange ?? { start: caret, end: caret };
      const next = applyAcrossResources(value, range, (source, lineRange) => toggleSelection(source, lineRange, mark));
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (!meta && !event.altKey && !event.nativeEvent.isComposing && event.key.length === 1) {
      event.preventDefault();
      const next = insertText(value, selectionRange ?? { start: caret, end: caret }, event.key);
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? insertText(value, selectionRange, "\n")
        : insertLineBreak(value, caret);
      setSelectionToolbar(null);
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
      setSelectionToolbar(null);
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
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
    }
  };

  const handleFocus = () => {
    focusedRef.current = true;
    if (selectedResourceLine !== null) {
      return;
    }
    caretRef.current = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    onCaretLineChange?.(caretRef.current.line);
    renderMarkdown(editorRef.current, value, caretRef.current.line);
    activeLineRef.current = caretRef.current.line;
    placeCaret(editorRef.current, caretRef.current);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    caretRef.current = null;
    setSlash(null);
    setSelectionToolbar(null);
    setSelectedResourceLine(null);
    renderMarkdown(editorRef.current, value, -1);
    activeLineRef.current = -1;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const deleteTarget = target?.closest("[data-resource-delete-line]");
    if (deleteTarget) {
      event.preventDefault();
      const line = Number(deleteTarget.getAttribute("data-resource-delete-line"));
      if (!Number.isNaN(line)) {
        removeResource(line);
      }
      return;
    }

    const dragTarget = target?.closest("[data-resource-drag-line]");
    if (dragTarget) {
      event.preventDefault();
      const line = Number(dragTarget.getAttribute("data-resource-drag-line"));
      if (!Number.isNaN(line)) {
        selectResource(line);
        startResourceBlockDrag(event.nativeEvent, line, dragTarget.closest("[data-resource-line]"));
      }
      return;
    }

    const editTarget = target?.closest("[data-diagram-edit-line]");
    if (editTarget) {
      event.preventDefault();
      const line = Number(editTarget.getAttribute("data-diagram-edit-line"));
      const diagram = parseDiagramMarker(value.split("\n")[line] ?? "");
      if (!Number.isNaN(line) && diagram) {
        onOpenDiagram?.(line, diagram);
      }
      return;
    }

    const resizeTarget = target?.closest("[data-diagram-resize-line]");
    if (resizeTarget) {
      event.preventDefault();
      const line = Number(resizeTarget.getAttribute("data-diagram-resize-line"));
      if (!Number.isNaN(line)) {
        startDiagramPreviewResize(event.nativeEvent, line, resizeTarget.closest("[data-diagram-line]"));
      }
      return;
    }

    const imageResizeTarget = target?.closest("[data-image-resize-line]");
    if (imageResizeTarget) {
      event.preventDefault();
      const line = Number(imageResizeTarget.getAttribute("data-image-resize-line"));
      if (!Number.isNaN(line)) {
        startImagePreviewResize(event.nativeEvent, line, imageResizeTarget.closest("[data-resource-surface]"));
      }
      return;
    }

    const resourceTarget = target?.closest("[data-resource-line]");
    if (resourceTarget) {
      event.preventDefault();
      const line = Number(resourceTarget.getAttribute("data-resource-line"));
      if (!Number.isNaN(line)) {
        selectResource(line);
      }
      return;
    }

    const checkTarget = target?.closest("[data-check]");
    if (!checkTarget) {
      return;
    }

    event.preventDefault();
    const line = Number(checkTarget.getAttribute("data-check"));
    if (Number.isNaN(line)) {
      return;
    }
    toggleTaskLine(line);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const linkTarget = linkElementFromTarget(event.target);
    if (!linkTarget) {
      return;
    }
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      event.stopPropagation();
      window.open(linkTarget.href, "_blank", "noopener,noreferrer");
    }
  };

  const toggleTaskLine = (line: number) => {
    const lines = value.split("\n");
    lines[line] = (lines[line] ?? "").replace(/^(-\s\[)([ xX])(\])/, (_, prefix, current, suffix) => {
      return `${prefix}${current.toLowerCase() === "x" ? " " : "x"}${suffix}`;
    });
    setSource(lines.join("\n"), focusedRef.current ? caretRef.current : null);
  };

  const selectResource = (line: number) => {
    editorRef.current?.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    caretRef.current = null;
    activeLineRef.current = -1;
    setSlash(null);
    setSelectionToolbar(null);
    setSelectedResourceLine(line);
    onCaretLineChange?.(line);
  };

  const removeResource = (line: number) => {
    const lines = valueRef.current.split("\n");
    if (!isResourceLine(lines[line] ?? "")) {
      return;
    }
    lines.splice(line, 1);
    if (lines.length === 0) {
      lines.push("");
    }
    const caretLine = Math.min(line, lines.length - 1);
    setSelectedResourceLine(null);
    setSource(lines.join("\n"), { line: caretLine, col: 0 });
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const image = Array.from(event.clipboardData.files ?? []).find((file) => file.type.startsWith("image/"));
    if (image) {
      event.preventDefault();
      setSlash(null);
      setSelectionToolbar(null);
      insertImageFile(image, getCaret(editorRef.current) ?? { line: 0, col: 0 });
      return;
    }
    event.preventDefault();
    setSlash(null);
    setSelectionToolbar(null);
    const text = event.clipboardData.getData("text/plain");
    const caret = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    const range = getSelectionRange(editorRef.current) ?? { start: caret, end: caret };
    const trimmed = text.trim();
    const next = !isCollapsedRange(range) && safeHref(trimmed)
      ? wrapLinkWithHref(value, range, trimmed)
      : insertText(value, range, text);
    setSource(next.value, next.caret);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!image) {
      return;
    }
    event.preventDefault();
    insertImageFile(image, getCaret(editorRef.current) ?? { line: 0, col: 0 });
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
        onKeyUp={() => {
          if (selectedResourceLine === null) {
            syncActiveLine();
          }
        }}
        onMouseUp={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-resource-line]")) {
            return;
          }
          setSelectedResourceLine(null);
          syncActiveLine();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
            event.preventDefault();
          }
        }}
        onDrop={handleDrop}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const caret = pendingImageCaretRef.current ?? caretRef.current ?? { line: 0, col: 0 };
          pendingImageCaretRef.current = null;
          if (file) {
            insertImageFile(file, caret);
          }
        }}
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
                <span><item.icon size={16} strokeWidth={1.8} /></span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {selectionToolbar ? (
        <div className="selection-toolbar" style={{ top: selectionToolbar.top, left: selectionToolbar.left }}>
          <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => runSelectionToolbarAction(event, "bold")}>
            <Bold size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => runSelectionToolbarAction(event, "italic")}>
            <Italic size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Code" title="Code" onMouseDown={(event) => runSelectionToolbarAction(event, "code")}>
            <Code2 size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough" onMouseDown={(event) => runSelectionToolbarAction(event, "strike")}>
            <Strikethrough size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Underline" title="Underline" onMouseDown={(event) => runSelectionToolbarAction(event, "underline")}>
            <Underline size={15} strokeWidth={2.1} />
          </button>
          <span />
          <button type="button" aria-label="Link" title="Link" onMouseDown={(event) => runSelectionToolbarAction(event, "link")}>
            <Link size={15} strokeWidth={2.1} />
          </button>
        </div>
      ) : null}
      <dialog
        ref={diagramDescribeDialogRef}
        className="diagram-ai-dialog"
        aria-label="Describe diagram"
        onCancel={(event) => {
          if (diagramDescribeLoading) {
            event.preventDefault();
            return;
          }
          closeDiagramDescribeDialog();
        }}
        onClose={() => setDiagramDescribeOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void generateDiagramFromDescription();
          }}
        >
          <header>
            <div>
              <strong>Describe diagram</strong>
              <span>{diagramDescribeMode === "iso" ? "Isometric" : "Flat"}</span>
            </div>
            <button type="button" className="topbar-icon-button" onClick={closeDiagramDescribeDialog} aria-label="Close" title="Close" disabled={diagramDescribeLoading}>
              <X size={17} strokeWidth={2} />
            </button>
          </header>
          <textarea
            value={diagramDescribePrompt}
            onChange={(event) => setDiagramDescribePrompt(event.target.value)}
            placeholder="PostgreSQL connecté à un cluster Kubernetes avec une flèche"
            autoFocus
          />
          <div className="diagram-ai-dialog-options" role="group" aria-label="Diagram style">
            <button type="button" className={diagramDescribeMode === "flat" ? "active" : ""} onClick={() => setDiagramDescribeMode("flat")} disabled={diagramDescribeLoading}>
              Flat
            </button>
            <button type="button" className={diagramDescribeMode === "iso" ? "active" : ""} onClick={() => setDiagramDescribeMode("iso")} disabled={diagramDescribeLoading}>
              Isometric
            </button>
          </div>
          {diagramDescribeError ? <p className="diagram-ai-dialog-error">{diagramDescribeError}</p> : null}
          <footer>
            <button type="button" onClick={closeDiagramDescribeDialog} disabled={diagramDescribeLoading}>
              Cancel
            </button>
            <button type="submit" className="strong" disabled={diagramDescribeLoading || !diagramDescribePrompt.trim()}>
              {diagramDescribeLoading ? <Sparkles size={14} strokeWidth={1.9} /> : <Wand2 size={14} strokeWidth={1.9} />}
              {diagramDescribeLoading ? "Generating" : "Generate diagram"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );

  function runSelectionToolbarAction(event: React.MouseEvent<HTMLButtonElement>, action: SelectionToolbarAction) {
    event.preventDefault();
    const range = selectionToolbar?.range ?? getSelectionRange(editorRef.current);
    if (!range || isCollapsedRange(range)) {
      setSelectionToolbar(null);
      return;
    }
    const next = action === "link"
      ? applyAcrossResources(value, range, (source, lineRange) => toggleLink(source, lineRange))
      : action === "underline"
        ? applyAcrossResources(value, range, (source, lineRange) => toggleSelection(source, lineRange, "<u>", "</u>"))
        : applyAcrossResources(value, range, (source, lineRange) => toggleSelection(source, lineRange, action === "bold" ? "**" : action === "italic" ? "*" : action === "strike" ? "~~" : "`"));
    focusedRef.current = true;
    setSlash(null);
    setSelectionToolbar(null);
    setSource(next.value, next.caret);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  function updateSelectionToolbar(range: TextRange) {
    const wrap = wrapRef.current;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!wrap || !editor || !selection?.rangeCount) {
      setSelectionToolbar(null);
      return;
    }

    const domRange = selection.getRangeAt(0);
    let rect = domRange.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      rect = editor.querySelector(`[data-line="${range.end.line}"]`)?.getBoundingClientRect() ?? rect;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const left = Math.max(54, Math.min(rect.left + rect.width / 2 - wrapRect.left, wrapRect.width - 54));
    const top = Math.max(8, rect.top - wrapRect.top - 8);
    setSelectionToolbar({ range, top, left });
  }

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

    if (item.image) {
      lines[caret.line] = stem + after;
      const imageCaret = { line: caret.line, col: stem.length };
      pendingImageCaretRef.current = imageCaret;
      setSource(lines.join("\n"), imageCaret);
      window.requestAnimationFrame(() => imageInputRef.current?.click());
      return;
    }

    if (item.ai) {
      lines[caret.line] = stem + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length });
      onAssist?.(item.ai);
      return;
    }

    if (item.diagramDescribe) {
      const keepLine = stem.trim() || after.trim();
      if (keepLine) {
        lines[caret.line] = stem + after;
      } else {
        lines.splice(caret.line, 1);
      }
      setDiagramDescribeTarget({ line: keepLine ? caret.line + 1 : caret.line });
      setDiagramDescribePrompt("");
      setDiagramDescribeError(null);
      setDiagramDescribeOpen(true);
      setSource(lines.join("\n"), keepLine ? { line: caret.line, col: stem.length } : { line: Math.max(0, Math.min(caret.line, lines.length - 1)), col: 0 });
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

    if (item.diagram) {
      const diagram = createDefaultDiagram(item.diagram);
      const marker = serializeDiagramMarker(diagram);
      const keepLine = stem.trim() || after.trim();
      lines.splice(caret.line, 1, stem + after, marker, "");
      if (!keepLine) {
        lines.splice(caret.line, 1);
      }
      const markerLine = keepLine ? caret.line + 1 : caret.line;
      setSource(lines.join("\n"), { line: markerLine, col: 0 });
      window.requestAnimationFrame(() => onOpenDiagram?.(markerLine, diagram));
      return;
    }

    if (item.wrap) {
      const closeWrap = item.closeWrap ?? item.wrap;
      lines[caret.line] = stem + item.wrap + closeWrap + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length + item.wrap.length });
      return;
    }

    if (item.link) {
      const text = "link";
      const href = "https://";
      lines[caret.line] = stem + `[${text}](${href})` + after;
      setSource(lines.join("\n"), { line: caret.line, col: stem.length + text.length + href.length + 3 });
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

  async function insertImageFile(file: File, caret: Caret) {
    if (!file.type.startsWith("image/") || !onUploadImage) {
      return;
    }
    try {
      const image = await onUploadImage(file);
      const lines = valueRef.current.split("\n");
      const line = lines[caret.line] ?? "";
      const alt = image.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "");
      const marker = `![${alt || "image"}](${image.url})`;
      const before = line.slice(0, caret.col);
      const after = line.slice(caret.col);
      if (!before && !after) {
        lines.splice(caret.line, 1, marker, "");
      } else {
        lines.splice(caret.line, 1, before, marker, after);
      }
      setSource(lines.join("\n"), { line: caret.line + 1, col: 0 });
    } catch {
      window.requestAnimationFrame(() => editorRef.current?.focus());
    }
  }

  function startResourceBlockDrag(event: PointerEvent, line: number, card: Element | null) {
    const marker = value.split("\n")[line] ?? "";
    if (!isResourceLine(marker)) {
      return;
    }

    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const currentCard = () => editorRef.current?.querySelector(`[data-resource-line="${line}"]`) ?? card;

    const move = (moveEvent: PointerEvent) => {
      const dx = Math.abs(moveEvent.clientX - start.x);
      const dy = Math.abs(moveEvent.clientY - start.y);
      if (dx + dy > 4) {
        moved = true;
        currentCard()?.classList.add("is-dragging");
      }
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      currentCard()?.classList.remove("is-dragging");
      if (!moved) {
        return;
      }

      const drop = resourceDropLineAt(upEvent.clientX, upEvent.clientY);
      if (!drop || drop.line === line) {
        return;
      }

      const next = moveLine(value, line, drop.line, drop.after);
      if (next !== value) {
        setSelectedResourceLine(null);
        setSource(next, null);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startDiagramPreviewResize(event: PointerEvent, line: number, card: Element | null) {
    const diagram = parseDiagramMarker(value.split("\n")[line] ?? "");
    const svg = card?.querySelector<SVGSVGElement>("svg");
    if (!diagram || !svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const start = previewForDiagram(diagram);
    const scale = start.width / Math.max(1, rect.width);
    let source = value;

    const move = (moveEvent: PointerEvent) => {
      const nextHeight = Math.max(140, Math.min(640, start.height + moveEvent.clientY - event.clientY));
      const nextPreview: DiagramPreview = {
        ...start,
        height: nextHeight,
        width: Math.max(160, rect.width * scale),
      };
      const nextDiagram = updateDiagramPreview(diagram, nextPreview);
      source = replaceDiagramMarkerAtLine(source, line, nextDiagram);
      setSource(source, null);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startImagePreviewResize(event: PointerEvent, line: number, card: Element | null) {
    const image = imageResource(value.split("\n")[line] ?? "");
    if (!image || !card) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const startWidth = image.width ?? rect.width;
    const editorWidth = editorRef.current?.getBoundingClientRect().width ?? 1600;
    const maxWidth = Math.max(120, Math.min(1600, editorWidth - 36));

    const move = (moveEvent: PointerEvent) => {
      const width = Math.round(Math.max(80, Math.min(maxWidth, startWidth + moveEvent.clientX - event.clientX)));
      const lines = value.split("\n");
      lines[line] = `![${image.alt}](${image.source}){width=${width}}`;
      setSource(lines.join("\n"), null);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function closeDiagramDescribeDialog() {
    if (diagramDescribeLoading) {
      return;
    }
    setDiagramDescribeOpen(false);
    setDiagramDescribeError(null);
  }

  async function generateDiagramFromDescription() {
    const prompt = diagramDescribePrompt.trim();
    if (!prompt || diagramDescribeLoading || !diagramDescribeTarget) {
      return;
    }

    setDiagramDescribeLoading(true);
    setDiagramDescribeError(null);
    try {
      const response = await generateAI(buildDiagramGenerationPrompt(prompt, diagramDescribeMode));
      const diagram = parseGeneratedDiagram(response.text, diagramDescribeMode);
      const next = insertDiagramMarkerAt(value, diagramDescribeTarget.line, diagram);
      focusedRef.current = false;
      activeLineRef.current = -1;
      caretRef.current = null;
      window.getSelection()?.removeAllRanges();
      editorRef.current?.blur();
      setSource(next.value, next.caret);
      setDiagramDescribeOpen(false);
      setDiagramDescribeTarget(null);
      setDiagramDescribePrompt("");
    } catch (error) {
      setDiagramDescribeError(error instanceof Error ? error.message : "Unable to generate diagram.");
    } finally {
      setDiagramDescribeLoading(false);
    }
  }
}

function renderMarkdown(el: HTMLDivElement | null, value: string, activeLine: number, selectedResourceLine = -1) {
  if (!el) {
    return;
  }
  el.innerHTML = renderEditableMarkdown(value, activeLine, selectedResourceLine);
}

function focusTarget(value: string, current: Caret | null, placement: "start" | "end" | "last") {
  const caret = focusCaret(value, current, placement);
  if ((placement !== "end" && placement !== "last") || !isDiagramLine(value.split("\n")[caret.line] ?? "")) {
    return { value, caret };
  }

  const lines = value.split("\n");
  if (lines[caret.line + 1] === undefined) {
    return { value: `${value}\n`, caret: { line: caret.line + 1, col: 0 } };
  }
  return { value, caret: { line: caret.line + 1, col: 0 } };
}

function isDiagramLine(line: string) {
  return Boolean(parseDiagramMarker(line));
}

function isResourceLine(line: string) {
  if (isDiagramLine(line)) {
    return true;
  }
  return Boolean(imageResource(line)?.safe);
}

function rangeIncludesResource(value: string, range: TextRange) {
  const normalized = normalizeRange(range);
  const lines = value.split("\n");
  for (let line = normalized.start.line; line <= normalized.end.line; line += 1) {
    if (isResourceLine(lines[line] ?? "")) {
      return true;
    }
  }
  return false;
}

function applyAcrossResources(
  value: string,
  range: TextRange,
  operation: (value: string, range: TextRange) => { value: string; caret: Caret },
) {
  if (!rangeIncludesResource(value, range)) {
    return operation(value, range);
  }

  const normalized = normalizeRange(range);
  const lines = value.split("\n");
  let nextValue = value;
  let nextCaret: Caret | null = null;

  for (let line = normalized.end.line; line >= normalized.start.line; line -= 1) {
    if (isResourceLine(lines[line] ?? "")) {
      continue;
    }
    const start = line === normalized.start.line ? normalized.start.col : 0;
    const end = line === normalized.end.line ? normalized.end.col : (lines[line] ?? "").length;
    if (start >= end) {
      continue;
    }
    const result = operation(nextValue, { start: { line, col: start }, end: { line, col: end } });
    nextValue = result.value;
    nextCaret = result.caret;
  }

  return { value: nextValue, caret: nextCaret ?? normalized.start };
}

function imageResource(line: string) {
  const nodes = parseInline(line);
  return nodes.length === 1 && nodes[0].type === "image" ? nodes[0] : null;
}

function resourceDropLineAt(clientX: number, clientY: number): { line: number; after: boolean } | null {
  const element = document.elementFromPoint(clientX, clientY);
  let lineElement = element?.closest("[data-line]");
  if (!lineElement) {
    const editor = element?.closest(".markdown-editor") ?? document.querySelector(".markdown-editor");
    const lines = Array.from(editor?.querySelectorAll("[data-line]") ?? []);
    lineElement = nearestLineElement(lines, clientY);
  }
  if (!lineElement) {
    return null;
  }

  const line = Number(lineElement.getAttribute("data-line"));
  if (Number.isNaN(line)) {
    return null;
  }

  const rect = lineElement.getBoundingClientRect();
  return { line, after: clientY > rect.top + rect.height / 2 };
}

function nearestLineElement(lines: Element[], clientY: number) {
  let nearest: Element | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (distance < nearestDistance) {
      nearest = line;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function moveLine(value: string, from: number, to: number, after: boolean) {
  const lines = value.split("\n");
  if (from < 0 || from >= lines.length || to < 0 || to >= lines.length) {
    return value;
  }

  const [line] = lines.splice(from, 1);
  let insertAt = to + (after ? 1 : 0);
  if (from < insertAt) {
    insertAt -= 1;
  }
  insertAt = Math.max(0, Math.min(insertAt, lines.length));
  if (insertAt === from) {
    return value;
  }
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

function insertDiagramMarkerAt(value: string, line: number, diagram: Diagram) {
  const lines = value ? value.split("\n") : [];
  const markerLine = Math.max(0, Math.min(line, lines.length));
  lines.splice(markerLine, 0, serializeDiagramMarker(diagram), "");
  return {
    value: lines.join("\n"),
    caret: { line: markerLine + 1, col: 0 },
  };
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
