import type { AIAction, Note } from "../types/note";
import { isDiagramMarker } from "./diagram";
import { replaceRange, selectedText, type TextRange } from "./markdown/edit";

export type ChatScope = "note" | "selection" | "all";
export type ChatSelection = { range: TextRange; text: string; content: string };
export type ChatContext = {
  scope: ChatScope;
  noteId?: string;
  /** Extra notes the user referenced with @, used as additional context. */
  noteIds?: string[];
  selection?: ChatSelection;
};
export const MAX_CHAT_NOTES = 5;
export function contextKey(context: ChatContext) {
  return context.scope === "all"
    ? "all"
    : `${context.scope}:${context.noteId}${context.selection ? `:${JSON.stringify(context.selection.range)}:${context.selection.text}` : ""}`;
}
export type ChatSnapshot = Pick<Note, "id" | "title" | "content" | "tags">;
export type ChatRequest = {
  scope: ChatScope;
  noteId?: string;
  noteIds?: string[];
  draft?: Omit<ChatSnapshot, "id">;
  selection?: string;
  action?: AIAction;
  messages: { role: "user" | "assistant"; content: string }[];
};
export type ChatTurn = {
  id: string;
  question: string;
  text: string;
  status: "loading" | "ready" | "error" | "cancelled";
  error?: string;
  sourceIds: string[];
  action?: AIAction;
  snapshot?: ChatSnapshot;
  selection?: ChatSelection;
  applied?: boolean;
};
export const chatActions: {
  action: AIAction;
  slug: string;
  label: string;
  prompt: string;
}[] = [
  {
    action: "summarize",
    slug: "summarize",
    label: "Summarize",
    prompt: "Summarize this text.",
  },
  {
    action: "extract_tasks",
    slug: "tasks",
    label: "Extract tasks",
    prompt: "Extract actionable tasks from this text.",
  },
  {
    action: "clean_up",
    slug: "rewrite",
    label: "Rewrite",
    prompt: "Make this text clearer and better structured.",
  },
  {
    action: "suggest_title",
    slug: "title",
    label: "Suggest title",
    prompt: "Suggest a short title for this note.",
  },
  {
    action: "suggest_tags",
    slug: "tags",
    label: "Suggest tags",
    prompt: "Suggest relevant tags for this note.",
  },
];
export function chatHistory(turns: ChatTurn[]) {
  const history: ChatRequest["messages"] = [];
  let size = 0;
  for (const turn of turns
    .filter((item) => item.status === "ready")
    .slice(-6)
    .reverse()) {
    size += new TextEncoder().encode(turn.question + turn.text).length;
    if (size > 24000) break;
    history.unshift(
      { role: "user", content: turn.question },
      { role: "assistant", content: turn.text },
    );
  }
  return history;
}
export function chatTags(text: string) {
  return [
    ...new Set(
      text
        .split(/[,\n]+/)
        .map((tag) =>
          tag
            .trim()
            .replace(/^[-*#\s]+/, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}_-]/gu, ""),
        )
        .filter(Boolean),
    ),
  ].slice(0, 8);
}
export function applicationLabel(turn: ChatTurn) {
  if (turn.action === "suggest_title") return "Use title";
  if (turn.action === "suggest_tags") return "Add tags";
  if (turn.selection) return "Replace selection";
  if (turn.action === "clean_up" || turn.action === "improve_clarity")
    return "Replace note text";
  if (turn.action === "extract_tasks") return "Insert tasks";
  return "Insert into note";
}
export function applicationProblem(turn: ChatTurn, note: Note | null) {
  if (!turn.snapshot || !note || note.id !== turn.snapshot.id)
    return "Open the original note to apply this suggestion.";
  if (turn.applied) return "Already applied.";
  if (turn.selection) {
    if (
      selectedText(note.content, turn.selection.range) !== turn.selection.text
    )
      return "The selected passage changed. Ask again using its latest text before applying.";
    return "";
  }
  if (turn.action === "suggest_title")
    return note.title !== turn.snapshot.title
      ? "The title changed. Ask again using its latest text before applying."
      : "";
  if (turn.action === "suggest_tags")
    return note.tags.join("\u0000") !== turn.snapshot.tags.join("\u0000")
      ? "The tags changed. Ask again using its latest text before applying."
      : "";
  return note.content !== turn.snapshot.content
    ? "The note changed. Ask again using its latest text before applying."
    : "";
}
export function chatPatch(turn: ChatTurn, note: Note): Partial<Note> | null {
  if (turn.status !== "ready" || applicationProblem(turn, note)) return null;
  let text = turn.text.trim();
  if (!text) return null;
  if (turn.action === "suggest_title")
    return { title: text.split("\n")[0].replace(/^#+\s*|^[-*]\s*/, "") };
  if (turn.action === "suggest_tags")
    return { tags: [...new Set([...note.tags, ...chatTags(text)])] };
  if (turn.action === "extract_tasks")
    text = text
      .split("\n")
      .map((line) =>
        line.trim().replace(/^(?:[-*•]\s*(?:\[[ xX]\]\s*)?|☐\s*)/, ""),
      )
      .filter(Boolean)
      .map((line) => `- [ ] ${line}`)
      .join("\n");
  if (
    turn.selection ||
    turn.action === "clean_up" ||
    turn.action === "improve_clarity"
  ) {
    const original = turn.selection?.text ?? note.content;
    const missing = original
      .split("\n")
      .filter((line) => isDiagramMarker(line) && !text.includes(line));
    if (missing.length) text += "\n\n" + missing.join("\n");
    if (turn.selection) {
      if (
        selectedText(note.content, turn.selection.range) !== turn.selection.text
      )
        return null;
      return {
        content: replaceRange(note.content, turn.selection.range, text).value,
      };
    }
    return { content: text };
  }
  return {
    content: [note.content.trimEnd(), text].filter(Boolean).join("\n\n"),
  };
}

/** Matches a trailing "@query" token the user is typing in the composer. */
export function mentionQuery(draft: string) {
  return /(?:^|\s)@([^\s@]*)$/.exec(draft)?.[1];
}
export function stripMention(draft: string) {
  return draft.replace(/(^|\s)@[^\s@]*$/, "$1");
}
export function mentionMatches(
  notes: Note[],
  query: string,
  excluded: string[],
  limit = 6,
) {
  const q = query.toLowerCase();
  return notes
    .filter(
      (item) =>
        !excluded.includes(item.id) &&
        (item.title || "Untitled").toLowerCase().includes(q),
    )
    .slice(0, limit);
}
