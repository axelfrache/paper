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

func TestClaimLegacyNotesRequiresAdministrator(t *testing.T) {
	repository := memory.NewNoteRepository()
	if _, err := repository.Create(context.Background(), "legacy", domain.NoteDraft{Title: "Legacy"}); err != nil {
		t.Fatal(err)
	}
	service := NewNote(repository, nil)
	regular := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	if _, err := service.ClaimLegacyNotes(regular); err == nil {
		t.Fatal("expected regular user to be rejected")
	}
	admin := domain.ContextWithUser(context.Background(), domain.User{ID: "admin-1", Roles: []string{"paper-admin"}})
	claimed, err := service.ClaimLegacyNotes(admin)
	if err != nil {
		t.Fatal(err)
	}
	if claimed != 1 {
		t.Fatalf("expected one claimed note, got %d", claimed)
	}
	notes, err := service.ListNotes(admin)
	if err != nil || len(notes) != 1 {
		t.Fatalf("claimed notes are unavailable: %#v %v", notes, err)
	}
}
