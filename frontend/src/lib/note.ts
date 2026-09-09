import type { Note, NoteDraft } from "../types/note";

export function toDraft(note: Note): NoteDraft {
  return {
    title: note.title,
    content: note.content,
    tags: note.tags,
    favorite: note.favorite,
  };
}
