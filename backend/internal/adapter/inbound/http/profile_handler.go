package http

import (
	"errors"
	"io"
	stdhttp "net/http"
	"strconv"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

const maxAvatarRequestBytes = 4 << 20

type ProfileHandler struct {
	profiles port.ProfileService
}

func NewProfileHandler(profiles port.ProfileService) *ProfileHandler {
	return &ProfileHandler{profiles: profiles}
}

func (h *ProfileHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var dto struct {
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(w, r, &dto); err != nil {
		writeError(w, err)
		return
	}
	profile, err := h.profiles.SetDisplayName(r.Context(), dto.DisplayName)
	if err != nil {
		writeError(w, err)
		return
	}
	h.writeUser(w, r, profile)
}

func (h *ProfileHandler) UploadAvatar(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	r.Body = stdhttp.MaxBytesReader(w, r.Body, maxAvatarRequestBytes)
	if err := r.ParseMultipartForm(maxAvatarRequestBytes); err != nil {
		var maxErr *stdhttp.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, &domain.AppError{Kind: domain.KindTooLarge, Message: "The avatar must be 2 MB or smaller."})
			return
		}
		writeError(w, domain.NewInvalidError("The avatar upload is invalid."))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, domain.NewInvalidError("An image file is required."))
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxAvatarRequestBytes+1))
	if err != nil {
		writeError(w, err)
		return
	}
	profile, err := h.profiles.SetAvatar(r.Context(), domain.ImageUpload{
		Name:        header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	h.writeUser(w, r, profile)
}

func (h *ProfileHandler) RemoveAvatar(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	profile, err := h.profiles.RemoveAvatar(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	h.writeUser(w, r, profile)
}

func (h *ProfileHandler) Avatar(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	avatar, err := h.profiles.OpenAvatar(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	defer avatar.Body.Close()

	if avatar.ContentType != "" {
		w.Header().Set("Content-Type", avatar.ContentType)
	}
	if avatar.Size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(avatar.Size, 10))
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = io.Copy(w, avatar.Body)
}

func (h *ProfileHandler) writeUser(w stdhttp.ResponseWriter, r *stdhttp.Request, profile domain.UserProfile) {
	user, _ := domain.UserFromContext(r.Context())
	writeJSON(w, stdhttp.StatusOK, userResponse(user, profile))
}
