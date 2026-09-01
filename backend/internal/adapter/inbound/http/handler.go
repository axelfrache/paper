package http

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	stdhttp "net/http"
	"strconv"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

const maxRequestBytes = 120_000
const maxImageRequestBytes = 8<<20 + 64<<10

type Handler struct {
	service port.NoteService
	images  port.NoteImageService
}

func NewHandler(service port.NoteService, images port.NoteImageService) *Handler {
	return &Handler{service: service, images: images}
}

func (h *Handler) CreateNote(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto noteDraftDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	note, err := h.service.CreateNote(r.Context(), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusCreated, newNoteDTO(note))
}

func (h *Handler) UpdateNote(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto noteDraftDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	note, err := h.service.UpdateNote(r.Context(), r.PathValue("id"), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newNoteDTO(note))
}

func (h *Handler) GetNote(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	note, err := h.service.GetNote(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newNoteDTO(note))
}

func (h *Handler) ListNotes(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	notes, err := h.service.ListNotes(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newNoteListDTO(notes))
}

func (h *Handler) SearchNotes(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto searchRequestDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	notes, err := h.service.SearchNotes(r.Context(), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newNoteListDTO(notes))
}

func (h *Handler) DeleteNote(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if err := h.service.DeleteNote(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}

func (h *Handler) AssistNote(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto assistRequestDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	suggestion, err := h.service.AssistNote(r.Context(), r.PathValue("id"), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newAISuggestionDTO(suggestion))
}

func (h *Handler) AskNotes(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto askRequestDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	answer, err := h.service.AskNotes(r.Context(), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newAskAnswerDTO(answer))
}

func (h *Handler) GenerateAI(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto aiGenerateRequestDTO
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}

	completion, err := h.service.GenerateAI(r.Context(), dto.toDomain())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, newAIGenerateResponseDTO(completion))
}

func (h *Handler) UploadNoteImage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	r.Body = stdhttp.MaxBytesReader(w, r.Body, maxImageRequestBytes)
	if err := r.ParseMultipartForm(maxImageRequestBytes); err != nil {
		var maxErr *stdhttp.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, &domain.AppError{Kind: domain.KindTooLarge, Message: "The image must be 8 MB or smaller."})
			return
		}
		writeError(w, domain.NewInvalidError("The image upload is invalid."))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, domain.NewInvalidError("An image file is required."))
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxImageRequestBytes+1))
	if err != nil {
		writeError(w, err)
		return
	}
	image, err := h.images.Upload(r.Context(), r.PathValue("id"), domain.ImageUpload{
		Name:        header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusCreated, newNoteImageDTO(image))
}

func (h *Handler) GetNoteImage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	image, err := h.images.Open(r.Context(), r.PathValue("imageID"))
	if err != nil {
		writeError(w, err)
		return
	}
	defer image.Body.Close()

	if image.ContentType != "" {
		w.Header().Set("Content-Type", image.ContentType)
	}
	if image.Size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(image.Size, 10))
	}
	if image.ETag != "" {
		w.Header().Set("ETag", `"`+image.ETag+`"`)
	}
	if image.Name != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": image.Name}))
	}
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = io.Copy(w, image.Body)
}

func (h *Handler) DeleteNoteImage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if err := h.images.Delete(r.Context(), r.PathValue("imageID")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}

func (h *Handler) Health(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
	writeJSON(w, stdhttp.StatusOK, map[string]string{"status": "ok"})
}

func decodeJSON(w stdhttp.ResponseWriter, r *stdhttp.Request, dst any) error {
	if ct := r.Header.Get("Content-Type"); ct != "" && !hasJSONContentType(ct) {
		return &domain.AppError{
			Kind:    domain.KindUnsupportedMedia,
			Message: "The request must be sent as JSON.",
		}
	}

	r.Body = stdhttp.MaxBytesReader(w, r.Body, maxRequestBytes)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		var maxErr *stdhttp.MaxBytesError
		if errors.As(err, &maxErr) {
			return &domain.AppError{
				Kind:    domain.KindTooLarge,
				Message: "The request is too large.",
			}
		}
		if errors.Is(err, io.EOF) {
			return &domain.AppError{Kind: domain.KindInvalid, Message: "The request body is empty."}
		}
		return &domain.AppError{Kind: domain.KindInvalid, Message: "The submitted JSON is invalid."}
	}
	return nil
}

func hasJSONContentType(ct string) bool {
	for i := 0; i < len(ct); i++ {
		if ct[i] == ';' {
			ct = ct[:i]
			break
		}
	}
	return ct == "application/json"
}
