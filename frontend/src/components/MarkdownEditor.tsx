import { createPortal } from "react-dom";
import { codeLines } from "../lib/markdown/fences";
import { remapCaret } from "../lib/markdown/anchor";
import { useLayoutEffect, useRef, useState } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BrainCircuit, Boxes, CalendarDays, Code2, FileText, GitBranch, Heading1, Heading2, Heading3, Image, Italic, Link, List, ListChecks, ListTodo, Minus, Quote, Sparkles, Strikethrough, TextCursorInput, Underline, Wand2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  cloneDiagramWithFreshIds,
  createDefaultDiagram,
  parseDiagramMarker,
  previewForDiagram,
  replaceDiagramMarkerAtLine,
  serializeDiagramMarker,
  updateDiagramPreview,
} from "../lib/diagram";
import { generateAI } from "../lib/api";
import { downloadDiagram } from "../lib/diagramExport";
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
import {
  alignOfRange,
  alignRange,
  deleteBackwardAligned,
  deleteForwardAligned,
  insertLineBreakAligned,
  textAligns,
} from "../lib/markdown/align";
import type { TextAlign } from "../lib/markdown/align";
import { hiddenPrefixLength, renderEditableLine, renderEditableMarkdown } from "../lib/markdown/editorRender";
import {
  insertLineBeforeResource,
  isDiagramLine,
  isResourceLine,
  removeResourceAt,
  replaceResourceAt,
  resourceClipboardHtml,
  resourceLineAt,
  resourceLineFromHtml,
  resourceLineFromPlainText,
  standaloneImage,
} from "../lib/markdown/resource";
import { prepareImageForUpload } from "../lib/imageUpload";
import { safeHref } from "../lib/markdown/render";
import {
  domPointForCaret,
  getCaret,
  getSelectionRange,
  linkElementFromTarget,
  placeCaret,
  placeSelection,
  pointToCaret,
  readSource,
  scrollCaretIntoView,
  stepColumn,
  visibleDeletionRange,
} from "../lib/markdown/dom";
import type { AIAction, NoteImage } from "../types/note";
import type { Diagram, DiagramMode, DiagramPreview } from "../lib/diagram";
import type { Caret, TextRange } from "../lib/markdown/edit";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onUploadImage?: (file: File) => Promise<NoteImage>;
  onAssist?: (action: AIAction) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  aiEnabled?: boolean;
  onCaretLineChange?: (line: number) => void;
  focusRequest?: { key: string; placement: "start" | "end" | "last" } | null;
  onFocusPrevious?: () => void;
  onFocusNoteList?: () => void;
  onOpenDiagram?: (line: number, diagram: Diagram) => void;
  exportTitle?: string;
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
  // Selection box relative to the editor wrap; the toolbar is fitted around it once measured.
  anchorTop: number;
  anchorBottom: number;
  anchorCenter: number;
};

type SelectionToolbarPlacement = {
  top: number;
  left: number;
  below: boolean;
};

type SelectionToolbarAction = "bold" | "italic" | "code" | "strike" | "underline" | "link";

type DiagramDescribeTarget = {
  line: number;
};

const alignIcons: Record<TextAlign, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
};

const alignLabels: Record<TextAlign, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
  justify: "Justify",
};

const selectionToolbarGap = 8;

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

async function writeResourceToClipboard(line: string) {
  if (!navigator.clipboard) {
    return false;
  }
  try {
    const html = resourceClipboardHtml(line);
    const parts: Record<string, Blob> = { "text/plain": new Blob([line], { type: "text/plain" }) };
    if (html) {
      parts["text/html"] = new Blob([html], { type: "text/html" });
    }
    await navigator.clipboard.write([new ClipboardItem(parts)]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(line);
      return true;
    } catch {
      return false;
    }
  }
}

export function MarkdownEditor({
  value,
  onChange,
  onUploadImage,
  onAssist,
  onUndo,
  onRedo,
  aiEnabled = true,
  onCaretLineChange,
  focusRequest = null,
  onFocusPrevious,
  onFocusNoteList,
  onOpenDiagram,
  exportTitle,
  diagramDescribeRequest = null,
  placeholder = "Start writing...",
}: MarkdownEditorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const slashBodyRef = useRef<HTMLDivElement | null>(null);
  const diagramDescribeDialogRef = useRef<HTMLDialogElement | null>(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const caretRef = useRef<Caret | null>(null);
  const pendingImageCaretRef = useRef<Caret | null>(null);
  const skipResourceCaretSyncRef = useRef(false);
  const dismissedSlashRef = useRef<{ line: number; col: number } | null>(null);
  const dropIndicatorRef = useRef<HTMLDivElement | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef(-1);
  const preferredColumnRef = useRef<number | null>(null);
  const handledFocusRequestRef = useRef("");
  const handledDiagramDescribeRequestRef = useRef("");
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const pendingUploadsRef = useRef(new Set<Caret>());
  const disposedRef = useRef(false);
  const [previewTitle, setPreviewTitle] = useState<{ line: number; source: string; title: string; slot: Element } | null>(null);
  useLayoutEffect(() => {
    if (previewTitle && value.split("\n")[previewTitle.line] !== previewTitle.source) setPreviewTitle(null);
  }, [value, previewTitle]);
  const [uploadCount, setUploadCount] = useState(0);
  const [editorMessage, setEditorMessage] = useState("");
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const [selectionToolbarPlacement, setSelectionToolbarPlacement] = useState<SelectionToolbarPlacement | null>(null);
  const [selectedResourceLine, setSelectedResourceLine] = useState<number | null>(null);
  const [diagramDescribeOpen, setDiagramDescribeOpen] = useState(false);
  const [diagramDescribeTarget, setDiagramDescribeTarget] = useState<DiagramDescribeTarget | null>(null);
  const [diagramDescribePrompt, setDiagramDescribePrompt] = useState("");
  const [diagramDescribeMode, setDiagramDescribeMode] = useState<DiagramMode>("flat");
  const [diagramDescribeLoading, setDiagramDescribeLoading] = useState(false);
  const [diagramDescribeError, setDiagramDescribeError] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ href: string; top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    disposedRef.current = false;
    return () => { disposedRef.current = true; };
  }, []);

  const updateSourceRef = (next: string) => {
    if (next !== valueRef.current) {
      for (const caret of pendingUploadsRef.current) Object.assign(caret, remapCaret(valueRef.current, next, caret));
      if (pendingImageCaretRef.current) pendingImageCaretRef.current = remapCaret(valueRef.current, next, pendingImageCaretRef.current);
    }
    valueRef.current = next;
  };

  useLayoutEffect(() => {
    updateSourceRef(value);
    if (composingRef.current) return;
    // Snapshot the caret: placing it can blur the editor, which clears caretRef.
    const caret = focusedRef.current ? caretRef.current : null;
    renderMarkdown(editorRef.current, value, caret?.line ?? -1, selectedResourceLine ?? -1);
    activeLineRef.current = caret?.line ?? -1;
    if (caret && selectedResourceLine === null) {
      if (resourceLineAt(value, caret.line)) {
        selectResource(caret.line);
      } else {
        placeCaret(editorRef.current, caret);
      }
      probeSlash(value, caret);
      onCaretLineChange?.(caret.line);
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
      if (resourceLineAt(target.value, caret.line)) {
        selectResource(caret.line);
      } else {
        placeCaret(editor, caret);
      }
      editor.scrollIntoView({ block: "nearest" });
      onCaretLineChange?.(caret.line);
      probeSlash(target.value, caret);
    });
  }, [focusRequest, value]);

  useLayoutEffect(() => {
    const toolbar = selectionToolbarRef.current;
    const wrap = wrapRef.current;
    if (!selectionToolbar || !toolbar || !wrap) {
      setSelectionToolbarPlacement(null);
      return;
    }

    const gap = selectionToolbarGap;
    const height = toolbar.offsetHeight;
    const halfWidth = toolbar.offsetWidth / 2;
    const wrapRect = wrap.getBoundingClientRect();
    const scrollRect = scrollParent(wrap)?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const below = wrapRect.top + selectionToolbar.anchorTop - scrollRect.top < height + gap;
    // The toolbar is translated up by its own height, so `top` is always its bottom edge.
    const top = below ? selectionToolbar.anchorBottom + gap + height : selectionToolbar.anchorTop - gap;
    const left = Math.min(
      Math.max(selectionToolbar.anchorCenter, halfWidth + gap),
      Math.max(halfWidth + gap, wrapRect.width - halfWidth - gap),
    );

    setSelectionToolbarPlacement((current) =>
      current && current.top === top && current.left === left && current.below === below
        ? current
        : { top, left, below },
    );
  }, [selectionToolbar]);

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
    const selection = window.getSelection();
    const rawCaret =
      selection?.focusNode && editorRef.current
        ? pointToCaret(editorRef.current, selection.focusNode, selection.focusOffset, false)
        : null;
    const caret = rawCaret ?? range?.end ?? getCaret(editorRef.current);
    if (!caret) {
      return;
    }
    if (resourceLineAt(value, caret.line)) {
      selectResource(caret.line);
      return;
    }
    caretRef.current = caret;
    onCaretLineChange?.(caret.line);
    if (caret.line !== activeLineRef.current) {
      renderMarkdown(editorRef.current, value, caret.line);
      activeLineRef.current = caret.line;
    }
    placeCaret(editorRef.current, caret);
    probeSlash(value, caret);
  };

  /**
   * A resource line is one atomic character: reaching it selects the whole block,
   * and every editing key acts on the line as a unit. Returns false for keys that
   * are none of its business (meta shortcuts, Tab, Home...) so they keep working.
   */
  const handleResourceKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    line: number,
    lineText: (index: number) => string,
  ) => {
    const meta = event.metaKey || event.ctrlKey;
    const navigates = !meta && !event.altKey && !event.shiftKey;

    if (event.key === "Escape") {
      event.preventDefault();
      focusLine(line + 1, 0);
      return true;
    }
    if (event.altKey && !meta && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const up = event.key === "ArrowUp";
      const next = moveLine(value, line, up ? line - 1 : line + 1, !up);
      if (next.value !== value) {
        setSlash(null);
        setSource(next.value, null);
        selectResource(next.line);
      }
      return true;
    }
    if (navigates && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
      event.preventDefault();
      setSlash(null);
      if (line > 0) {
        focusLine(line - 1, lineText(line - 1).length);
      } else if (event.key === "ArrowUp") {
        setSelectedResourceLine(null);
        onFocusPrevious?.();
      } else {
        setSelectedResourceLine(null);
        onFocusNoteList?.();
      }
      return true;
    }
    if (navigates && (event.key === "ArrowDown" || event.key === "ArrowRight")) {
      event.preventDefault();
      setSlash(null);
      focusLine(line + 1, 0);
      return true;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removeResource(line);
      return true;
    }
    if (event.key === "Enter") {
      // Push the block down, keeping it selected so it can be moved again.
      event.preventDefault();
      const next = insertLineBeforeResource(value, line);
      if (next) {
        setSlash(null);
        setSource(next.value, null);
        selectResource(line + 1);
      }
      return true;
    }
    if (!meta && !event.altKey && !event.nativeEvent.isComposing && event.key.length === 1) {
      event.preventDefault();
      const next = replaceResourceAt(value, line, event.key);
      if (next) {
        setSelectedResourceLine(null);
        setSlash(null);
        setSource(next.value, next.caret);
        window.requestAnimationFrame(() => editorRef.current?.focus());
      }
      return true;
    }
    return false;
  };

  /** Puts the caret on a line, or selects it when it holds a resource. */
  const focusLine = (line: number, col: number) => {
    if (resourceLineAt(value, line)) {
      selectResource(line);
      return;
    }
    setSelectedResourceLine(null);
    moveCaretTo(line, col);
  };

  /** Moves the caret to a source position and re-renders that line as active. */
  const moveCaretTo = (line: number, col: number) => {
    const caret = { line, col };
    focusedRef.current = true;
    caretRef.current = caret;
    activeLineRef.current = line;
    setSelectionToolbar(null);
    renderMarkdown(editorRef.current, value, line, -1, true);
    placeCaret(editorRef.current, caret);
    onCaretLineChange?.(line);
    skipResourceCaretSyncRef.current = true;
  };

  const setSource = (nextValue: string, caret: Caret | null) => {
    updateSourceRef(nextValue);
    if (caret && resourceLineAt(nextValue, caret.line)) {
      changeRef.current(nextValue);
      selectResource(caret.line);
      return;
    }
    caretRef.current = caret;
    if (caret) {
      onCaretLineChange?.(caret.line);
    }
    changeRef.current(nextValue);
  };

  const deleteAtVisibleCaret = (direction: -1 | 1) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const raw = editor && selection?.focusNode ? pointToCaret(editor, selection.focusNode, selection.focusOffset, false) : null;
    const lineEl = raw && editor?.querySelector(`[data-line="${raw.line}"]`);
    if (!editor || !raw || !lineEl?.querySelector("[data-syntax-side]")) return null;
    const range = visibleDeletionRange(editor, raw, direction);
    if (range) return deleteRange(value, range);
    // No visible text precedes an inline opening marker: join at the line start,
    // rather than deleting one character of the delimiter. Block prefixes retain
    // their existing Backspace behavior (remove heading/list formatting).
    if (direction < 0 && hiddenPrefixLength(value.split("\n")[raw.line] ?? "") === 0) {
      return deleteBackwardAligned(value, { line: raw.line, col: 0 });
    }
    return null;
  };

  const handleInput = () => {
    if (composingRef.current) return;
    preferredColumnRef.current = null;
    const caret = getCaret(editorRef.current);
    setSelectionToolbar(null);
    setSource(readSource(editorRef.current), caret);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const meta = event.metaKey || event.ctrlKey;
    const lines = value.split("\n");
    const lineText = (index: number) => lines[index] ?? "";
    const isResource = (index: number) => Boolean(resourceLineAt(value, index));
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      preferredColumnRef.current = null;
    }
    if (selectedResourceLine !== null) {
      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const range = fullTextRange(value);
        focusedRef.current = true;
        caretRef.current = range.end;
        setSelectedResourceLine(null);
        window.requestAnimationFrame(() => {
          placeSelection(editorRef.current, range);
          updateSelectionToolbar(range);
        });
        return;
      }
      if (meta && !event.shiftKey && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x")) {
        event.preventDefault();
        void copyOrCutResource(selectedResourceLine, event.key.toLowerCase() === "x");
        return;
      }
      handleResourceKey(event, selectedResourceLine, lineText);
      return;
    }

    const selectionRange = getSelectionRange(editorRef.current);
    const caret = selectionRange?.end ?? getCaret(editorRef.current);
    if (!caret) {
      return;
    }

    const collapsed = !selectionRange || isCollapsedRange(selectionRange);
    const plain = !meta && !event.altKey && !event.shiftKey;

    // The caret landed on a resource line: run the same model, so the block is never
    // edited character by character and always shows itself as selected.
    if (collapsed && isResource(caret.line) && handleResourceKey(event, caret.line, lineText)) {
      return;
    }

    if (slash) {
      const items = filteredSlashItems(slash.query, aiEnabled);
      const index = Math.min(slash.index, Math.max(0, items.length - 1));
      if (event.key === "Escape") {
        event.preventDefault();
        setSlash(null);
        const line = value.split("\n")[caret.line] ?? "";
        const match = /(?:^|\s)\/([\w-]*)$/.exec(line.slice(0, caret.col));
        if (match) {
          dismissedSlashRef.current = { line: caret.line, col: caret.col - match[0].length + match[0].indexOf("/") };
        }
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

    // Wrapped paragraphs need the browser's visual-line navigation (including its
    // preferred horizontal position). Source columns cannot represent visual rows.
    if (plain && collapsed && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const editor = editorRef.current;
      const lineEl = editor?.querySelector<HTMLElement>(`[data-line="${caret.line}"]`);
      const rect = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null;
      const lineRect = lineEl?.getBoundingClientRect();
      const insideVisualLine = rect && rect.height > 0 && lineRect &&
        (direction < 0 ? rect.top > lineRect.top + rect.height / 2 : rect.bottom < lineRect.bottom - rect.height / 2);
      const targetLine = caret.line + direction;
      const targetEl = editor?.querySelector<HTMLElement>(`[data-line="${targetLine}"]`);
      const wraps = (el: HTMLElement | null | undefined) => el &&
        el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 1.5;
      if (insideVisualLine || (targetLine >= 0 && targetLine < lines.length && !isResource(targetLine) && (wraps(lineEl) || wraps(targetEl)))) {
        preferredColumnRef.current = null;
        setSlash(null);
        return;
      }
    }

    // Stepping onto an adjacent resource: it is one character away, in any direction.
    if (plain && collapsed) {
      const stepsOntoPrevious =
        (event.key === "ArrowUp" || (event.key === "ArrowLeft" && caret.col === hiddenPrefixLength(lineText(caret.line)))) &&
        isResource(caret.line - 1);
      const stepsOntoNext =
        (event.key === "ArrowDown" || (event.key === "ArrowRight" && caret.col === lineText(caret.line).length)) &&
        isResource(caret.line + 1);
      if (stepsOntoPrevious || stepsOntoNext) {
        event.preventDefault();
        setSlash(null);
        selectResource(stepsOntoPrevious ? caret.line - 1 : caret.line + 1);
        return;
      }
    }

    if (plain && collapsed && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const lineEl = editorRef.current?.querySelector(`[data-line="${caret.line}"]`);
      if (lineEl) {
        const selection = window.getSelection();
        const rawCaret = selection?.focusNode ? pointToCaret(editorRef.current!, selection.focusNode, selection.focusOffset, false) : null;
        const fromCol = rawCaret && rawCaret.line === caret.line ? rawCaret.col : caret.col;
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const stepped = stepColumn(lineEl, fromCol, direction);
        if (stepped !== null) {
          event.preventDefault();
          setSlash(null);
          const next = { line: caret.line, col: stepped };
          caretRef.current = next;
          placeCaret(editorRef.current, next);
          onCaretLineChange?.(caret.line);
          skipResourceCaretSyncRef.current = true;
          return;
        }
        if (direction === -1 && caret.line > 0) {
          event.preventDefault();
          setSlash(null);
          focusLine(caret.line - 1, lineText(caret.line - 1).length);
          return;
        }
        if (direction === 1 && caret.line < lines.length - 1) {
          event.preventDefault();
          setSlash(null);
          focusLine(caret.line + 1, 0);
          return;
        }
        event.preventDefault();
        return;
      }
    }

    if (plain && collapsed && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const targetLine = event.key === "ArrowUp" ? caret.line - 1 : caret.line + 1;
      if (targetLine >= 0 && targetLine < lines.length && !isResource(targetLine)) {
        event.preventDefault();
        setSlash(null);
        const preferredCol = preferredColumnRef.current ?? caret.col;
        preferredColumnRef.current = preferredCol;
        focusLine(targetLine, Math.min(preferredCol, lineText(targetLine).length));
        return;
      }
    }

    if (plain && !collapsed && selectionRange && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSlash(null);
      const target = event.key === "ArrowDown" ? selectionRange.end : selectionRange.start;
      window.getSelection()?.removeAllRanges();
      focusLine(target.line, target.col);
      return;
    }

    if (event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowDown")) {
      const endCaret = selectionRange?.end ?? caret;
      if (endCaret.col === lineText(endCaret.line).length && isResource(endCaret.line + 1)) {
        event.preventDefault();
        const startCaret = selectionRange?.start ?? caret;
        placeSelection(editorRef.current, { start: startCaret, end: { line: endCaret.line + 1, col: 0 } });
        return;
      }
    }

    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowUp")) {
      const startCaret = selectionRange?.start ?? caret;
      if (startCaret.col === 0 && isResource(startCaret.line - 1)) {
        event.preventDefault();
        const endCaret = selectionRange?.end ?? caret;
        placeSelection(editorRef.current, { start: { line: startCaret.line - 1, col: lineText(startCaret.line - 1).length }, end: endCaret });
        return;
      }
    }

    if (!meta && !event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && editorRef.current) {
      const selection = window.getSelection();
      const focusNode = selection?.focusNode;
      const focusPoint = focusNode ? pointToCaret(editorRef.current, focusNode, selection!.focusOffset, false) : null;
      if (selection && focusPoint && !isResource(focusPoint.line)) {
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const lineEl = editorRef.current.querySelector(`[data-line="${focusPoint.line}"]`);
        if (lineEl) {
          const stepped = stepColumn(lineEl, focusPoint.col, direction);
          const target =
            stepped !== null
              ? { line: focusPoint.line, col: stepped }
              : direction === -1 && focusPoint.line > 0 && !isResource(focusPoint.line - 1)
                ? { line: focusPoint.line - 1, col: lineText(focusPoint.line - 1).length }
                : direction === 1 && focusPoint.line < lines.length - 1 && !isResource(focusPoint.line + 1)
                  ? { line: focusPoint.line + 1, col: 0 }
                  : null;
          if (target) {
            const point = domPointForCaret(editorRef.current, target);
            if (point) {
              event.preventDefault();
              setSlash(null);
              selection.extend(point.node, point.offset);
              scrollCaretIntoView(editorRef.current);
              return;
            }
          }
        }
      }
    }

    if (
      event.key === "ArrowLeft" &&
      plain &&
      collapsed &&
      caret.line === 0 &&
      caret.col === hiddenPrefixLength(lineText(0))
    ) {
      event.preventDefault();
      setSlash(null);
      onFocusNoteList?.();
      return;
    }

    if (event.key === "ArrowUp" && plain && collapsed && caret.line === 0) {
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
      const next = applyPerLine(value, range, (source, lineRange) => toggleLink(source, lineRange));
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (meta && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      const range = selectionRange ?? { start: caret, end: caret };
      const next = applyPerLine(value, range, (source, lineRange) => toggleSelection(source, lineRange, "<u>", "</u>"));
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (meta && ["b", "i"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const mark = event.key.toLowerCase() === "b" ? "**" : "*";
      const range = selectionRange ?? { start: caret, end: caret };
      const next = applyPerLine(value, range, (source, lineRange) => toggleSelection(source, lineRange, mark));
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
        : insertLineBreakAligned(value, caret);
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (collapsed && !meta && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
      const next = deleteAtVisibleCaret(event.key === "Backspace" ? -1 : 1);
      if (next) {
        event.preventDefault();
        setSelectionToolbar(null);
        setSource(next.value, next.caret);
        return;
      }
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (collapsed && caret.col === 0 && isResource(caret.line - 1)) {
        if (lineText(caret.line).length > 0) {
          removeResource(caret.line - 1);
          return;
        }
      }
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? deleteRange(value, selectionRange)
        : event.ctrlKey || event.altKey
          ? deleteBackwardWord(value, caret)
          : deleteBackwardAligned(value, caret);
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (collapsed && caret.col === lineText(caret.line).length && isResource(caret.line + 1)) {
        if (lineText(caret.line).length > 0) {
          removeResource(caret.line + 1, caret);
          return;
        }
      }
      const next = selectionRange && !isCollapsedRange(selectionRange)
        ? deleteRange(value, selectionRange)
        : event.ctrlKey || event.altKey
          ? deleteForwardWord(value, caret)
          : deleteForwardAligned(value, caret);
      setSelectionToolbar(null);
      setSource(next.value, next.caret);
    }
  };

  const pointerDownRef = useRef(false);

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) {
      focusedRef.current = false;
      caretRef.current = null;
      return;
    }
    focusedRef.current = true;
    if (pointerDownRef.current || selectedResourceLine !== null) {
      return;
    }
    const caret = getCaret(editorRef.current) ?? { line: 0, col: 0 };
    if (resourceLineAt(value, caret.line)) {
      selectResource(caret.line);
      return;
    }
    caretRef.current = caret;
    onCaretLineChange?.(caret.line);
    renderMarkdown(editorRef.current, value, caret.line);
    activeLineRef.current = caret.line;
    placeCaret(editorRef.current, caret);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // Replacing a focused block button fires blur synchronously during reconciliation.
    // Do not re-enter the renderer from a descendant's blur.
    if (event.target !== event.currentTarget) return;
    if (event.relatedTarget instanceof Node && (selectionToolbarRef.current?.contains(event.relatedTarget) || editorRef.current?.contains(event.relatedTarget))) return;
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
    preferredColumnRef.current = null;
    setHoveredLink(null);
    
    pointerDownRef.current = event.type === "pointerdown";
    const clearPointerDown = () => {
      pointerDownRef.current = false;
      window.removeEventListener("pointerup", clearPointerDown);
      window.removeEventListener("pointercancel", clearPointerDown);
    };
    window.addEventListener("pointerup", clearPointerDown);
    window.addEventListener("pointercancel", clearPointerDown);

    const target = event.target instanceof Element ? event.target : null;

    if (event.metaKey || event.ctrlKey) {
      const linkTarget = linkElementFromTarget(target);
      if (linkTarget) {
        event.preventDefault();
        event.stopPropagation();
        setHoveredLink(null);
        return;
      }
    }
    const titleTarget = target?.closest("[data-diagram-title-line]");
    if (titleTarget) {
      event.preventDefault();
      // Switching directly between diagram titles also commits the previous draft.
      const activeInput = editorRef.current?.querySelector<HTMLInputElement>(".markdown-diagram-title-input");
      activeInput?.blur();
      const line = Number(titleTarget.getAttribute("data-diagram-title-line"));
      const source = valueRef.current.split("\n")[line] ?? "";
      const diagram = parseDiagramMarker(source);
      if (diagram && titleTarget.parentElement) {
        focusedRef.current = false;
        caretRef.current = null;
        setSlash(null);
        setSelectionToolbar(null);
        setPreviewTitle({ line, source, title: diagram.title ?? "", slot: titleTarget.parentElement });
      }
      return;
    }

    const copyTarget = target?.closest("[data-resource-copy-line]");
    if (copyTarget) {
      event.preventDefault();
      const line = Number(copyTarget.getAttribute("data-resource-copy-line"));
      if (!Number.isNaN(line)) {
        void copyOrCutResource(line, false);
      }
      return;
    }

    const deleteTarget = target?.closest("[data-resource-delete-line]");
    if (deleteTarget) {
      event.preventDefault();
      const line = Number(deleteTarget.getAttribute("data-resource-delete-line"));
      if (!Number.isNaN(line)) {
        removeResource(line);
      }
      return;
    }

    const exportTarget = target?.closest("[data-diagram-export-line]");
    if (exportTarget) {
      event.preventDefault();
      const line = Number(exportTarget.getAttribute("data-diagram-export-line"));
      const diagram = parseDiagramMarker(value.split("\n")[line] ?? "");
      if (!Number.isNaN(line) && diagram) {
        void downloadDiagram(diagram, "png", diagram.title || exportTitle || "diagram");
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

    const widthResizeTarget = target?.closest("[data-diagram-width-resize-line]");
    if (widthResizeTarget) {
      event.preventDefault();
      const line = Number(widthResizeTarget.getAttribute("data-diagram-width-resize-line"));
      if (!Number.isNaN(line)) {
        startDiagramPreviewWidthResize(event.nativeEvent, line, widthResizeTarget.closest("[data-diagram-line]"));
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
        // Pressing selects; moving past the threshold turns the same press into a drag.
        selectResource(line);
        startResourceBlockDrag(event.nativeEvent, line, resourceTarget);
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
    const keyboardFocus = document.activeElement === checkTarget;
    toggleTaskLine(line);
    if (keyboardFocus) window.requestAnimationFrame(() => editorRef.current?.querySelector<HTMLButtonElement>(`[data-check="${line}"]`)?.focus());
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.detail === 0 && event.target instanceof Element && event.target.closest("button")) {
      handlePointerDown(event as unknown as React.PointerEvent<HTMLDivElement>);
      return;
    }
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
    window.requestAnimationFrame(() => {
      editorRef.current?.querySelector(`[data-resource-line="${line}"]`)?.scrollIntoView({ block: "nearest" });
    });
  };

  const removeResource = (line: number, caret?: Caret) => {
    const next = removeResourceAt(valueRef.current, line, caret);
    if (!next) {
      return;
    }
    setSelectedResourceLine(null);
    setSource(next.value, next.caret);
    // Back-to-back resources: land on the next one selected rather than caret-less.
    if (resourceLineAt(next.value, next.caret.line)) {
      selectResource(next.caret.line);
    }
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  const copyOrCutResource = async (line: number, cut: boolean) => {
    const text = valueRef.current.split("\n")[line] ?? "";
    if (!isResourceLine(text)) {
      return;
    }
    const source = valueRef.current;
    const copied = await writeResourceToClipboard(text);
    if (disposedRef.current) return;
    if (!copied) {
      setEditorMessage("Could not copy. The block has been kept in your note.");
      return;
    }
    // Never delete a different block if the document changed while permission was pending.
    const changed = source !== valueRef.current;
    if (cut && !changed) removeResource(line);
    setEditorMessage(cut && changed ? "Copied. The note changed, so the block was kept." : "Copied to clipboard.");
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const resourceSelected = selectedResourceLine !== null;
    const caret = resourceSelected
      ? { line: selectedResourceLine + 1, col: 0 }
      : getCaret(editorRef.current) ?? { line: 0, col: 0 };

    const image = Array.from(event.clipboardData.files ?? []).find((file) => file.type.startsWith("image/"));
    if (image) {
      event.preventDefault();
      setSlash(null);
      setSelectionToolbar(null);
      setSelectedResourceLine(null);
      insertImageFile(image, caret);
      return;
    }

    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain");
    const resourceLine = resourceLineFromHtml(html) ?? resourceLineFromPlainText(plain);
    if (resourceLine) {
      event.preventDefault();
      setSlash(null);
      setSelectionToolbar(null);
      setSelectedResourceLine(null);
      void insertPastedResource(resourceLine, caret);
      return;
    }

    event.preventDefault();
    setSlash(null);
    setSelectionToolbar(null);
    setSelectedResourceLine(null);
    const range = resourceSelected ? { start: caret, end: caret } : getSelectionRange(editorRef.current) ?? { start: caret, end: caret };
    const trimmed = plain.trim();
    const next = !isCollapsedRange(range) && safeHref(trimmed)
      ? wrapLinkWithHref(value, range, trimmed)
      : insertText(value, range, plain);
    setSource(next.value, next.caret);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!image) {
      return;
    }
    event.preventDefault();
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = position ? null : doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = position?.offsetNode ?? range?.startContainer;
    const offset = position?.offset ?? range?.startOffset ?? 0;
    const caret = node && editorRef.current ? pointToCaret(editorRef.current, node, offset) : null;
    insertImageFile(image, caret ?? getCaret(editorRef.current) ?? { line: 0, col: 0 });
  };

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const beforeInput = (event: InputEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.isComposing || composingRef.current || !event.cancelable) return;
      const historyAction = event.inputType === "historyUndo" ? onUndo : event.inputType === "historyRedo" ? onRedo : null;
      if (historyAction) {
        event.preventDefault();
        historyAction();
        return;
      }
      if (selectedResourceLine !== null) {
        let next = null;
        if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
          next = insertLineBeforeResource(value, selectedResourceLine);
        } else if (event.inputType.startsWith("delete")) {
          next = removeResourceAt(value, selectedResourceLine);
        } else if (event.inputType === "insertText" && event.data) {
          next = replaceResourceAt(value, selectedResourceLine, event.data);
        }
        if (next) {
          event.preventDefault();
          setSelectedResourceLine(null);
          setSource(next.value, next.caret);
        }
        return;
      }
      const range = getSelectionRange(editor);
      if (!range) return;
      const collapsed = isCollapsedRange(range);
      let next: { value: string; caret: Caret } | null = null;
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        next = collapsed ? insertLineBreakAligned(value, range.end) : insertText(value, range, "\n");
      } else if (event.inputType === "deleteContentBackward") {
        next = collapsed ? deleteAtVisibleCaret(-1) ?? deleteBackwardAligned(value, range.end) : deleteRange(value, range);
      } else if (event.inputType === "deleteContentForward") {
        next = collapsed ? deleteAtVisibleCaret(1) ?? deleteForwardAligned(value, range.end) : deleteRange(value, range);
      }
      if (next) {
        event.preventDefault();
        setSource(next.value, next.caret);
      }
    };
    editor.addEventListener("beforeinput", beforeInput);
    return () => editor.removeEventListener("beforeinput", beforeInput);
  });

  const filteredItems = filteredSlashItems(slash?.query ?? "", aiEnabled);
  // Null when the selection spans lines that disagree, so no button claims to be active.
  const selectionAlign = selectionToolbar ? alignOfRange(value, selectionToolbar.range) : null;

  return (
    <div ref={wrapRef} className="markdown-editor-wrap">
      {previewTitle && createPortal(
        <DiagramPreviewTitleInput
          initialTitle={previewTitle.title}
          onFinish={(title, returnFocus) => {
            setPreviewTitle(null);
            const current = valueRef.current;
            if (current.split("\n")[previewTitle.line] !== previewTitle.source) return;
            if (title !== null && title !== previewTitle.title) {
              const diagram = parseDiagramMarker(previewTitle.source)!;
              setSource(replaceDiagramMarkerAtLine(current, previewTitle.line, { ...diagram, title: title || undefined }), null);
            }
            if (returnFocus) window.requestAnimationFrame(() => {
              editorRef.current?.querySelector<HTMLButtonElement>(`[data-diagram-title-line="${previewTitle.line}"]`)?.focus();
            });
          }}
        />,
        previewTitle.slot,
      )}
      <div
        ref={editorRef}
        className="markdown-editor"
        contentEditable
        role="textbox"
        aria-label="Note content"
        aria-multiline="true"
        spellCheck
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => {
          composingRef.current = false;
          handleInput();
        }}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) return;
          if (composingRef.current) return;
          if (selectedResourceLine === null) {
            if (skipResourceCaretSyncRef.current) {
              skipResourceCaretSyncRef.current = false;
            } else {
              syncActiveLine();
            }
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
        onPointerOver={(event) => {
          const link = linkElementFromTarget(event.target);
          if (link) {
            const rect = link.getBoundingClientRect();
            const wrapRect = wrapRef.current?.getBoundingClientRect();
            if (wrapRect) {
              setHoveredLink({
                href: link.href,
                top: rect.top - wrapRect.top,
                left: rect.left - wrapRect.left,
              });
            }
          }
        }}
        onPointerOut={(event) => {
          if (linkElementFromTarget(event.target)) {
            setHoveredLink(null);
          }
        }}
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
      {uploadCount > 0 ? <div className="editor-message" role="status">Uploading image…</div> : null}
      {editorMessage ? <div className="editor-message" role="status">{editorMessage}</div> : null}
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
        <div
          ref={selectionToolbarRef}
          className={selectionToolbarPlacement?.below ? "selection-toolbar is-below" : "selection-toolbar"}
          style={{
            top: selectionToolbarPlacement?.top ?? selectionToolbar.anchorTop - selectionToolbarGap,
            left: selectionToolbarPlacement?.left ?? selectionToolbar.anchorCenter,
          }}
        >
          <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "bold")}>
            <Bold size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "italic")}>
            <Italic size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Code" title="Code" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "code")}>
            <Code2 size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "strike")}>
            <Strikethrough size={15} strokeWidth={2.1} />
          </button>
          <button type="button" aria-label="Underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "underline")}>
            <Underline size={15} strokeWidth={2.1} />
          </button>
          <span />
          <button type="button" aria-label="Link" title="Link" onMouseDown={(event) => event.preventDefault()} onClick={(event) => runSelectionToolbarAction(event, "link")}>
            <Link size={15} strokeWidth={2.1} />
          </button>
          <span />
          {textAligns.map((align) => {
            const Icon = alignIcons[align];
            return (
              <button
                key={align}
                type="button"
                className={selectionAlign === align ? "active" : ""}
                aria-label={alignLabels[align]}
                title={alignLabels[align]}
                onMouseDown={(event) => event.preventDefault()} onClick={(event) => runAlign(event, align)}
              >
                <Icon size={15} strokeWidth={2.1} />
              </button>
            );
          })}
        </div>
      ) : null}
      {hoveredLink ? (
        <div
          className="link-preview-tooltip"
          style={{ top: hoveredLink.top, left: hoveredLink.left }}
        >
          <a href={hoveredLink.href} target="_blank" rel="noopener noreferrer">
            {hoveredLink.href}
          </a>
          <kbd>{typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl"}+Click</kbd>
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

  function runAlign(event: React.MouseEvent<HTMLButtonElement>, align: TextAlign) {
    event.preventDefault();
    const range = selectionToolbar?.range ?? getSelectionRange(editorRef.current);
    if (!range) {
      return;
    }
    focusedRef.current = true;
    const next = alignRange(value, range, align);
    setSource(next.value, next.caret);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  function runSelectionToolbarAction(event: React.MouseEvent<HTMLButtonElement>, action: SelectionToolbarAction) {
    event.preventDefault();
    const range = selectionToolbar?.range ?? getSelectionRange(editorRef.current);
    if (!range || isCollapsedRange(range)) {
      setSelectionToolbar(null);
      return;
    }
    const next = action === "link"
      ? applyPerLine(value, range, (source, lineRange) => toggleLink(source, lineRange))
      : action === "underline"
        ? applyPerLine(value, range, (source, lineRange) => toggleSelection(source, lineRange, "<u>", "</u>"))
        : applyPerLine(value, range, (source, lineRange) => toggleSelection(source, lineRange, action === "bold" ? "**" : action === "italic" ? "*" : action === "strike" ? "~~" : "`"));
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
    setSelectionToolbar({
      range,
      anchorTop: rect.top - wrapRect.top,
      anchorBottom: rect.bottom - wrapRect.top,
      anchorCenter: rect.left + rect.width / 2 - wrapRect.left,
    });
  }

  function probeSlash(source: string, caret: Caret | null) {
    if (!caret || codeLines(source.split("\n"))[caret.line]) {
      setSlash(null);
      return;
    }
    const line = source.split("\n")[caret.line] ?? "";
    const match = /(?:^|\s)\/([\w-]*)$/.exec(line.slice(0, caret.col));
    const selectionRange = getSelectionRange(editorRef.current);
    if (!match || (selectionRange && !isCollapsedRange(selectionRange))) {
      setSlash(null);
      if (dismissedSlashRef.current) {
        dismissedSlashRef.current = null;
      }
      return;
    }
    const slashStart = caret.col - match[0].length + match[0].indexOf("/");
    if (dismissedSlashRef.current && dismissedSlashRef.current.line === caret.line && dismissedSlashRef.current.col === slashStart) {
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
    const count = filteredSlashItems(query, aiEnabled).length;
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
      setSource(lines.join("\n"), imageCaret);
      pendingImageCaretRef.current = imageCaret;
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
      const keepLine = Boolean(stem.trim() || after.trim());
      lines.splice(caret.line, 1, ...(keepLine ? [stem + after, item.block] : [item.block]));
      // No blank line is written: between paragraphs the next one already exists, and a
      // block ending the note keeps the caret on itself rather than opening an empty line.
      const blockLine = caret.line + (keepLine ? 1 : 0);
      const landing = blockLine + 1 < lines.length
        ? { line: blockLine + 1, col: 0 }
        : { line: blockLine, col: item.block.length };
      setSource(lines.join("\n"), landing);
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
    const target = { ...caret };
    pendingUploadsRef.current.add(target);
    setUploadCount((count) => count + 1);
    try {
      const image = await onUploadImage(await prepareImageForUpload(file));
      if (disposedRef.current) return;
      pendingUploadsRef.current.delete(target);
      const alt = image.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "");
      insertResourceLine(`![${alt || "image"}](${image.url})`, target);
    } catch {
      if (!disposedRef.current) setEditorMessage("Could not upload image. Please try again.");
    } finally {
      pendingUploadsRef.current.delete(target);
      if (!disposedRef.current) setUploadCount((count) => count - 1);
    }
  }

  function insertResourceLine(marker: string, caret: Caret) {
    const lines = valueRef.current.split("\n");
    const line = lines[caret.line] ?? "";
    const before = line.slice(0, caret.col);
    const after = line.slice(caret.col);
    if (!before && !after) {
      lines.splice(caret.line, 1, marker, "");
    } else {
      lines.splice(caret.line, 1, before, marker, after);
    }
    setSource(lines.join("\n"), { line: caret.line + 1, col: 0 });
  }

  async function insertPastedResource(line: string, caret: Caret) {
    const diagram = parseDiagramMarker(line);
    if (diagram) {
      insertResourceLine(serializeDiagramMarker(cloneDiagramWithFreshIds(diagram)), caret);
      return;
    }

    const image = standaloneImage(line);
    if (!image?.safe) {
      return;
    }
    if (!onUploadImage) {
      insertResourceLine(line, caret);
      return;
    }
    const target = { ...caret };
    pendingUploadsRef.current.add(target);
    setUploadCount((count) => count + 1);
    try {
      const response = await fetch(image.href);
      if (!response.ok) {
        throw new Error("fetch failed");
      }
      const blob = await response.blob();
      const file = new File([blob], image.alt || "image", { type: blob.type });
      const uploaded = await onUploadImage(await prepareImageForUpload(file));
      if (disposedRef.current) return;
      pendingUploadsRef.current.delete(target);
      const alt = uploaded.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "");
      insertResourceLine(`![${alt || "image"}](${uploaded.url})`, target);
    } catch {
      pendingUploadsRef.current.delete(target);
      if (!disposedRef.current) {
        insertResourceLine(line, target);
        setEditorMessage("Image could not be imported. Its original link was kept.");
      }
    } finally {
      pendingUploadsRef.current.delete(target);
      if (!disposedRef.current) setUploadCount((count) => count - 1);
    }
  }

  /**
   * Draws the insertion bar over the editor (not inside it, so the contenteditable
   * content and its source reading stay untouched).
   */
  function showDropIndicator(drop: { line: number; after: boolean } | null, from: number) {
    const wrap = wrapRef.current;
    const editor = editorRef.current;
    if (!wrap || !editor || !drop || drop.line === from) {
      hideDropIndicator();
      return;
    }

    const target = editor.querySelector(`[data-line="${drop.line}"]`);
    if (!target) {
      hideDropIndicator();
      return;
    }

    let indicator = dropIndicatorRef.current;
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "markdown-editor-drop-indicator";
      wrap.appendChild(indicator);
      dropIndicatorRef.current = indicator;
    }

    const rect = target.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    indicator.style.left = `${editorRect.left - wrapRect.left}px`;
    indicator.style.width = `${editorRect.width}px`;
    indicator.style.top = `${(drop.after ? rect.bottom : rect.top) - wrapRect.top - 1}px`;
  }

  function hideDropIndicator() {
    dropIndicatorRef.current?.remove();
    dropIndicatorRef.current = null;
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
      if (moved) {
        showDropIndicator(resourceDropLineAt(moveEvent.clientX, moveEvent.clientY), line);
      }
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      currentCard()?.classList.remove("is-dragging");
      hideDropIndicator();
      if (!moved) {
        return;
      }

      const drop = resourceDropLineAt(upEvent.clientX, upEvent.clientY);
      if (!drop || drop.line === line) {
        return;
      }

      const next = moveLine(value, line, drop.line, drop.after);
      if (next.value !== value) {
        setSource(next.value, null);
        selectResource(next.line);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startDiagramPreviewResize(event: PointerEvent, line: number, card: Element | null) {
    const diagram = parseDiagramMarker(value.split("\n")[line] ?? "");
    if (!diagram || !card) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const preview = previewForDiagram(diagram);
    const start: DiagramPreview = {
      ...preview,
      width: diagram.preview?.width ?? rect.width,
      height: diagram.preview?.height ?? preview.height,
    };
    let source = value;

    const move = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(240, Math.min(1600, start.width + moveEvent.clientX - event.clientX));
      const nextHeight = Math.max(140, Math.min(640, start.height + moveEvent.clientY - event.clientY));
      const nextPreview: DiagramPreview = {
        ...start,
        width: nextWidth,
        height: nextHeight,
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

  function startDiagramPreviewWidthResize(event: PointerEvent, line: number, card: Element | null) {
    const diagram = parseDiagramMarker(value.split("\n")[line] ?? "");
    if (!diagram || !card) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const preview = previewForDiagram(diagram);
    const start: DiagramPreview = {
      ...preview,
      width: diagram.preview?.width ?? rect.width,
      height: diagram.preview?.height ?? preview.height,
    };
    let source = value;

    const move = (moveEvent: PointerEvent) => {
      const nextPreview = {
        ...start,
        width: Math.max(240, Math.min(1600, start.width + moveEvent.clientX - event.clientX)),
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
    const image = standaloneImage(value.split("\n")[line] ?? "");
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
      if (disposedRef.current) return;
      const next = insertDiagramMarkerAt(valueRef.current, diagramDescribeTarget.line, diagram);
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

const renderedEditors = new WeakMap<HTMLDivElement, {
  value: string; lines: string[]; contexts: ReturnType<typeof codeLines>;
  activeLine: number; selectedResourceLine: number;
}>();

function renderMarkdown(el: HTMLDivElement | null, value: string, activeLine: number, selectedResourceLine = -1, navigationOnly = false) {
  if (!el) {
    return;
  }
  const previous = renderedEditors.get(el);
  // Keyboard navigation changes only the old/new active and selected lines.
  // Input and composition still reconcile the full DOM, including native edits.
  if (navigationOnly && previous?.value === value) {
    for (const index of new Set([previous.activeLine, activeLine, previous.selectedResourceLine, selectedResourceLine])) {
      if (index < 0 || previous.contexts[index]) continue;
      const current = el.children[index];
      if (!current) continue;
      const html = renderEditableLine(previous.lines[index] ?? "", index === activeLine, index, index === selectedResourceLine);
      const template = document.createElement("div");
      template.innerHTML = html;
      const next = template.firstElementChild!;
      if (!current.isEqualNode(next)) current.replaceWith(next);
    }
    previous.activeLine = activeLine;
    previous.selectedResourceLine = selectedResourceLine;
    return;
  }
  const lines = value.split("\n");
  renderedEditors.set(el, { value, lines, contexts: codeLines(lines), activeLine, selectedResourceLine });
  const html = renderEditableMarkdown(value, activeLine, selectedResourceLine);
  if (el.innerHTML === html) return;
  const template = document.createElement("div");
  template.innerHTML = html;
  const desired = Array.from(template.children);
  desired.forEach((line, index) => {
    const current = el.children[index];
    // A title input is managed by its React portal, not the Markdown renderer.
    // Preserve it when another line changes (e.g. committing the previous title).
    if (current?.querySelector(".markdown-diagram-title-input") && current.getAttribute("data-source") === line.getAttribute("data-source")) {
      current.className = line.className;
      return;
    }
    if (!current) el.appendChild(line);
    else if (!current.isEqualNode(line)) current.replaceWith(line);
  });
  while (el.children.length > desired.length) el.lastElementChild?.remove();
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

/**
 * Applies an inline formatting operation one line at a time.
 *
 * Inline marks are parsed per line, so a mark can never span a line break: wrapping
 * a multi-line span as one would emit `**a\nb**`, which renders as literal text and
 * can land a closing mark on the next line — enough to break a divider or a marker.
 * A selection that merely spills onto the next line (`end` at column 0, which is what
 * a double or triple click produces) contributes an empty sub-range and is skipped.
 */
function applyPerLine(
  value: string,
  range: TextRange,
  operation: (value: string, range: TextRange) => { value: string; caret: Caret },
) {
  const normalized = normalizeRange(range);
  const lines = value.split("\n");

  // A bare caret is a single insertion point, not a span to iterate over.
  if (isCollapsedRange(normalized)) {
    return resourceLineAt(value, normalized.start.line)
      ? { value, caret: normalized.start }
      : operation(value, normalized);
  }

  let nextValue = value;
  let nextCaret: Caret | null = null;

  for (let line = normalized.end.line; line >= normalized.start.line; line -= 1) {
    if (resourceLineAt(value, line)) {
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

function resourceDropLineAt(clientX: number, clientY: number): { line: number; after: boolean } | null {
  const element = document.elementFromPoint?.(clientX, clientY) ?? null;
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
    return { value, line: from };
  }

  const [line] = lines.splice(from, 1);
  let insertAt = to + (after ? 1 : 0);
  if (from < insertAt) {
    insertAt -= 1;
  }
  insertAt = Math.max(0, Math.min(insertAt, lines.length));
  if (insertAt === from) {
    return { value, line: from };
  }
  lines.splice(insertAt, 0, line);
  return { value: lines.join("\n"), line: insertAt };
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

function filteredSlashItems(query: string, aiEnabled = true) {
  const normalized = query.trim().toLowerCase();
  return slashItems.filter((item) => (aiEnabled || (!item.ai && !item.diagramDescribe)) && (!normalized || item.label.toLowerCase().includes(normalized) || item.id.includes(normalized)));
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


function DiagramPreviewTitleInput({ initialTitle, onFinish }: {
  initialTitle: string;
  onFinish: (title: string | null, returnFocus: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);
  const finish = (cancel: boolean, returnFocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(cancel ? null : (inputRef.current?.value ?? "").replace(/\s+/g, " ").trim(), returnFocus);
  };
  return <input
    ref={inputRef}
    className="markdown-diagram-title-input"
    aria-label="Diagram title"
    placeholder="Add a title…"
    defaultValue={initialTitle}
    maxLength={160}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        finish(event.key === "Escape", true);
      }
    }}
    onKeyUp={(event) => event.stopPropagation()}
    onBlur={() => finish(false, false)}
  />;
}
