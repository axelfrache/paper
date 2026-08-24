package http

import (
	"encoding/json"
	"errors"
	stdhttp "net/http"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type errorResponse struct {
	Error string `json:"error"`
}

func writeJSON(w stdhttp.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w stdhttp.ResponseWriter, err error) {
	status := stdhttp.StatusInternalServerError
	message := "Something went wrong."

	var appErr *domain.AppError
	if errors.As(err, &appErr) {
		message = appErr.Message
		switch appErr.Kind {
		case domain.KindInvalid:
			status = stdhttp.StatusBadRequest
		case domain.KindNotFound:
			status = stdhttp.StatusNotFound
		case domain.KindTooLarge:
			status = stdhttp.StatusRequestEntityTooLarge
		case domain.KindUnsupportedMedia:
			status = stdhttp.StatusUnsupportedMediaType
		case domain.KindAIUnavailable:
			status = stdhttp.StatusBadGateway
			if appErr.Status >= 400 && appErr.Status < 500 {
				status = stdhttp.StatusBadRequest
			}
		}
	}

	writeJSON(w, status, errorResponse{Error: message})
}
