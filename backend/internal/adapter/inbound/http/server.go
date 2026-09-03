package http

import (
	stdhttp "net/http"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/port"
)

func NewRouter(notes port.NoteService, images port.NoteImageService, auth port.AuthService, authConfig AuthHTTPConfig, allowedOrigins []string) stdhttp.Handler {
	handler := NewHandler(notes, images)
	authHandler := NewAuthHandler(auth, authConfig)

	mux := stdhttp.NewServeMux()
	mux.HandleFunc("GET /api/health", handler.Health)
	mux.HandleFunc("GET /api/auth/config", authHandler.Config)
	mux.HandleFunc("GET /api/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/auth/callback", authHandler.Callback)
	mux.HandleFunc("POST /api/auth/logout", authHandler.Logout)
	mux.Handle("GET /api/auth/me", requireAuth(auth, stdhttp.HandlerFunc(authHandler.Me)))
	mux.Handle("GET /api/notes", requireAuth(auth, stdhttp.HandlerFunc(handler.ListNotes)))
	mux.Handle("POST /api/notes", requireAuth(auth, stdhttp.HandlerFunc(handler.CreateNote)))
	mux.Handle("GET /api/notes/{id}", requireAuth(auth, stdhttp.HandlerFunc(handler.GetNote)))
	mux.Handle("PATCH /api/notes/{id}", requireAuth(auth, stdhttp.HandlerFunc(handler.UpdateNote)))
	mux.Handle("DELETE /api/notes/{id}", requireAuth(auth, stdhttp.HandlerFunc(handler.DeleteNote)))
	mux.Handle("POST /api/notes/{id}/assist", requireAuth(auth, stdhttp.HandlerFunc(handler.AssistNote)))
	mux.Handle("POST /api/notes/{id}/images", requireAuth(auth, stdhttp.HandlerFunc(handler.UploadNoteImage)))
	mux.Handle("GET /api/images/{imageID}", requireAuth(auth, stdhttp.HandlerFunc(handler.GetNoteImage)))
	mux.Handle("DELETE /api/images/{imageID}", requireAuth(auth, stdhttp.HandlerFunc(handler.DeleteNoteImage)))
	mux.Handle("POST /api/notes/ask", requireAuth(auth, stdhttp.HandlerFunc(handler.AskNotes)))
	mux.Handle("POST /api/ai/generate", requireAuth(auth, stdhttp.HandlerFunc(handler.GenerateAI)))
	mux.Handle("POST /api/search", requireAuth(auth, stdhttp.HandlerFunc(handler.SearchNotes)))
	mux.Handle("POST /api/admin/notes/claim-legacy", requireAuth(auth, stdhttp.HandlerFunc(handler.ClaimLegacyNotes)))

	return cors(allowedOrigins)(mux)
}

// NewServer builds the API server. writeTimeout must stay above the AI client's own
// timeout, otherwise the server cuts the response before the provider ever answers.
func NewServer(addr string, handler stdhttp.Handler, writeTimeout time.Duration) *stdhttp.Server {
	if writeTimeout <= 0 {
		writeTimeout = 90 * time.Second
	}
	return &stdhttp.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      writeTimeout,
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
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
				w.Header().Set("Access-Control-Max-Age", "86400")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			if r.Method == stdhttp.MethodOptions {
				w.WriteHeader(stdhttp.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
