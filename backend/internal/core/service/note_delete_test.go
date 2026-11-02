package service

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func TestDeleteNoteHidesItFromListsAndSearch(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})

	note, err := service.CreateNote(ctx, domain.NoteDraft{Title: "Keep me", Tags: []string{"work"}})
	if err != nil {
		t.Fatal(err)
	}

	if err := service.DeleteNote(ctx, note.ID); err != nil {
		t.Fatal(err)
	}

	if notes, err := service.ListNotes(ctx); err != nil || len(notes) != 0 {
		t.Fatalf("expected the deleted note to be hidden from ListNotes, got %#v %v", notes, err)
	}
	if _, err := service.GetNote(ctx, note.ID); err == nil {
		t.Fatal("expected GetNote to fail for a deleted note")
	}
	if matched, err := service.SearchNotes(ctx, domain.SearchQuery{Query: "#work"}); err != nil || len(matched) != 0 {
		t.Fatalf("expected the deleted note to be hidden from search, got %#v %v", matched, err)
	}
}

func TestRestoreNoteBringsBackContentAndFolder(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})

	folder, err := service.SaveFolder(ctx, "", domain.FolderDraft{Name: "Work", Color: "blue"})
	if err != nil {
		t.Fatal(err)
	}
	note, err := service.CreateNote(ctx, domain.NoteDraft{Title: "Keep me", Content: "body", FolderID: &folder.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.DeleteNote(ctx, note.ID); err != nil {
		t.Fatal(err)
	}

	restored, err := service.RestoreNote(ctx, note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.ID != note.ID || restored.Content != "body" || restored.FolderID == nil || *restored.FolderID != folder.ID {
		t.Fatalf("restored note does not match the original: %#v", restored)
	}

	notes, err := service.ListNotes(ctx)
	if err != nil || len(notes) != 1 {
		t.Fatalf("expected the restored note to reappear in ListNotes, got %#v %v", notes, err)
	}
}

func TestRestoreNoteFailsWhenNotDeleted(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})

	note, err := service.CreateNote(ctx, domain.NoteDraft{Title: "Not deleted"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.RestoreNote(ctx, note.ID); err == nil {
		t.Fatal("expected restoring a note that was never deleted to fail")
	}
}

func TestRestoreNoteFailsForUnknownID(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})

	if _, err := service.RestoreNote(ctx, "note_missing"); err == nil {
		t.Fatal("expected restoring an unknown note to fail")
	}
}
