import type { AIAction, AICompletion, AISuggestion, AskAnswer, Note, NoteDraft } from "../types/note";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listNotes() {
  return request<Note[]>("/api/notes");
}

export function createNote(draft: NoteDraft) {
  return request<Note>("/api/notes", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function updateNote(id: string, draft: NoteDraft) {
  return request<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(draft),
  });
}

export function deleteNote(id: string) {
  return request<void>(`/api/notes/${id}`, {
    method: "DELETE",
  });
}

export function searchNotes(query: string, tags: string[] = []) {
  return request<Note[]>("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, tags }),
  });
}

export function assistNote(id: string, action: AIAction) {
  return request<AISuggestion>(`/api/notes/${id}/assist`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function askNotes(question: string) {
  return request<AskAnswer>("/api/notes/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function generateAI(prompt: string) {
  return request<AICompletion>("/api/ai/generate", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}
