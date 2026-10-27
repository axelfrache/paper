export type Note = {
  folderId?: string | null;
  id: string;
  title: string;
  content: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteDraft = {
  title: string;
  content: string;
  tags: string[];
  favorite: boolean;
};

export type AIAction =
  | "summarize"
  | "extract_tasks"
  | "suggest_title"
  | "suggest_tags"
  | "clean_up"
  | "improve_clarity";

export type AISuggestion = {
  action: AIAction;
  text: string;
};

export type AskAnswer = {
  answer: string;
  sourceIds: string[];
};

export type AICompletion = {
  text: string;
};

export type NoteImage = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
};

export type Folder = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};
export type FolderDraft = Pick<Folder, "name" | "color">;
export type NoteMove = { noteId: string; folderId: string | null };
