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

func TestSearchNotesMatchesHashPrefixedTag(t *testing.T) {
	repository := memory.NewNoteRepository()
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	if _, err := repository.Create(ctx, "user-1", domain.NoteDraft{Title: "Deploy", Tags: []string{"work"}}); err != nil {
		t.Fatal(err)
	}
	service := NewNote(repository, nil)

	matched, err := service.SearchNotes(ctx, domain.SearchQuery{Query: "#work"})
	if err != nil {
		t.Fatal(err)
	}
	if len(matched) != 1 {
		t.Fatalf("expected the #work query to match the tagged note, got %d", len(matched))
	}

	missing, err := service.SearchNotes(ctx, domain.SearchQuery{Query: "#missing"})
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) != 0 {
		t.Fatalf("expected no match for #missing, got %d", len(missing))
	}
}
