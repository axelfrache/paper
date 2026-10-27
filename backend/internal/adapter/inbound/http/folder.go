package http

import (
	"github.com/axelfrache/paper/backend/internal/core/domain"
	stdhttp "net/http"
)

func (h *Handler) ListFolders(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	folders, err := h.service.ListFolders(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, folders)
}
func (h *Handler) SaveFolder(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var draft domain.FolderDraft
	if err := decodeJSON(w, r, &draft); err != nil {
		writeError(w, err)
		return
	}
	folder, err := h.service.SaveFolder(r.Context(), r.PathValue("id"), draft)
	if err != nil {
		writeError(w, err)
		return
	}
	status := 200
	if r.Method == "POST" {
		status = 201
	}
	writeJSON(w, status, folder)
}
func (h *Handler) DeleteFolder(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if err := h.service.DeleteFolder(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) MoveNotes(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto struct {
		Moves []domain.NoteMove `json:"moves"`
	}
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}
	if err := h.service.MoveNotes(r.Context(), dto.Moves); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(204)
}
