package http

import (
	stdhttp "net/http"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/port"
)

func NewRouter(notes port.NoteService, allowedOrigins []string) stdhttp.Handler {
	handler := NewHandler(notes)

	mux := stdhttp.NewServeMux()
	mux.HandleFunc("GET /api/health", handler.Health)
	mux.HandleFunc("GET /api/notes", handler.ListNotes)
	mux.HandleFunc("POST /api/notes", handler.CreateNote)
	mux.HandleFunc("GET /api/notes/{id}", handler.GetNote)
	mux.HandleFunc("PATCH /api/notes/{id}", handler.UpdateNote)
	mux.HandleFunc("DELETE /api/notes/{id}", handler.DeleteNote)
	mux.HandleFunc("POST /api/notes/{id}/assist", handler.AssistNote)
	mux.HandleFunc("POST /api/notes/ask", handler.AskNotes)
	mux.HandleFunc("POST /api/search", handler.SearchNotes)

	return cors(allowedOrigins)(mux)
}

func NewServer(addr string, handler stdhttp.Handler) *stdhttp.Server {
	return &stdhttp.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

func cors(allowed []string) func(stdhttp.Handler) stdhttp.Handler {
	allowAll := false
	set := make(map[string]bool, len(allowed))
	for _, origin := range allowed {
		origin = strings.TrimSpace(origin)
		if origin == "*" {
			allowAll = true
		}
		if origin != "" {
			set[origin] = true
		}
	}

	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAll || set[origin]) {
				if allowAll {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}

			if r.Method == stdhttp.MethodOptions {
				w.WriteHeader(stdhttp.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
