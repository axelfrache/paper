package service

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func TestNoteServiceIsolatesNotesByUser(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil)
	first := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	second := domain.ContextWithUser(context.Background(), domain.User{ID: "user-2"})

	note, err := service.CreateNote(first, domain.NoteDraft{Title: "Private"})
	if err != nil {
		t.Fatal(err)
	}
	if notes, err := service.ListNotes(second); err != nil || len(notes) != 0 {
		t.Fatalf("second user can see first user's notes: %#v %v", notes, err)
	}
	if _, err := service.GetNote(second, note.ID); err == nil {
		t.Fatal("second user can open first user's note")
	}
}
