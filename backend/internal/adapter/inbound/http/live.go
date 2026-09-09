package http

import (
	"encoding/json"
	stdhttp "net/http"
	"sync"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type LiveHub struct {
	mu   sync.Mutex
	subs map[string]map[chan domain.Note]struct{}
}

func NewLiveHub() *LiveHub {
	return &LiveHub{subs: make(map[string]map[chan domain.Note]struct{})}
}

func (h *LiveHub) Publish(note domain.Note) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[note.ID] {
		select {
		case ch <- note:
		default:
		}
	}
}

func (h *LiveHub) subscribe(noteID string) chan domain.Note {
	ch := make(chan domain.Note, 1)
	h.mu.Lock()
	if h.subs[noteID] == nil {
		h.subs[noteID] = make(map[chan domain.Note]struct{})
	}
	h.subs[noteID][ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *LiveHub) unsubscribe(noteID string, ch chan domain.Note) {
	h.mu.Lock()
	delete(h.subs[noteID], ch)
	if len(h.subs[noteID]) == 0 {
		delete(h.subs, noteID)
	}
	h.mu.Unlock()
}

func (h *LiveHub) stream(w stdhttp.ResponseWriter, r *stdhttp.Request, noteID string) {
	flusher, ok := w.(stdhttp.Flusher)
	if !ok {
		writeError(w, domain.NewInvalidError("Streaming is not supported."))
		return
	}

	// SSE connections stay open far longer than the server's normal write deadline.
	_ = stdhttp.NewResponseController(w).SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(stdhttp.StatusOK)
	flusher.Flush()

	updates := h.subscribe(noteID)
	defer h.unsubscribe(noteID, updates)

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case note := <-updates:
			payload, err := json.Marshal(newNoteDTO(note))
			if err != nil {
				continue
			}
			if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
