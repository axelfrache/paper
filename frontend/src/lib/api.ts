import { apiFetch, trackMutation } from "./pwa";
import type { Folder, FolderDraft, NoteMove } from "../types/note";
import type { AIAction, AICompletion, AISuggestion, AskAnswer, Note, NoteDraft, NoteImage } from "../types/note";
import type { AuthConfig, AuthUser } from "../types/auth";

export class APIError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return trackMutation(init?.method, async () => {
    const response = await apiFetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new APIError(payload?.error ?? "Request failed", response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  });
}

export function getAuthConfig() {
  return request<AuthConfig>("/api/auth/config");
}

export function getCurrentUser() {
  return request<AuthUser>("/api/auth/me");
}

export function loginWithPassword(email: string, password: string) {
  return request<{ redirectTo: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function registerWithPassword(email: string, name: string, password: string) {
  return request<{ redirectTo: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password }),
  });
}

export function logout() {
  return request<{ redirectTo: string }>("/api/auth/logout", { method: "POST" });
}

export function updateDisplayName(displayName: string) {
  return request<AuthUser>("/api/profile", { method: "PATCH", body: JSON.stringify({ displayName }) });
}

export async function uploadAvatar(file: File) {
  return trackMutation("POST", async () => {
    const body = new FormData();
    body.append("file", file);
    const response = await apiFetch("/api/profile/avatar", { method: "POST", body, credentials: "same-origin" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new APIError(payload?.error ?? "Avatar upload failed", response.status);
    }
    return response.json() as Promise<AuthUser>;
  });
}

export function removeAvatar() {
  return request<AuthUser>("/api/profile/avatar", { method: "DELETE" });
}

export function listNotes() {
  return request<Note[]>("/api/notes");
}

export function createNote(draft: NoteDraft & { folderId?: string | null }) {
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

export async function uploadNoteImage(noteId: string, file: File) {
  return trackMutation("POST", async () => {
    const body = new FormData();
    body.append("file", file);
    const response = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/images`, {
      method: "POST",
      body,
      credentials: "same-origin",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Image upload failed");
    }
    return response.json() as Promise<NoteImage>;
  });
}

export function listFolders() {
  return request<Folder[]>("/api/folders");
}
export function saveFolder(draft: FolderDraft, id?: string) {
  return request<Folder>(
    id ? `/api/folders/${encodeURIComponent(id)}` : "/api/folders",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(draft) },
  );
}
export function deleteFolder(id: string) {
  return request<void>(`/api/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
export function moveNotes(moves: NoteMove[]) {
  return request<void>("/api/notes/move", {
    method: "POST",
    body: JSON.stringify({ moves }),
  });
}
