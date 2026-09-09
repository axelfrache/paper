package service

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func TestNoteServiceIsolatesNotesByUser(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil, nil)
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

func TestNoteSharingAllowsAnyAuthenticatedUserToEditViaToken(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil, nil)
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "user-2"})

	note, err := service.CreateNote(owner, domain.NoteDraft{Title: "Shared"})
	if err != nil {
		t.Fatal(err)
	}

	shared, err := service.EnableShare(owner, note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if shared.ShareToken == "" {
		t.Fatal("expected a share token to be generated")
	}

	fetched, err := service.GetSharedNote(other, shared.ShareToken)
	if err != nil {
		t.Fatalf("other user could not open the shared note: %v", err)
	}
	if fetched.ID != note.ID {
		t.Fatalf("expected shared note %q, got %q", note.ID, fetched.ID)
	}

	updated, err := service.UpdateSharedNote(other, shared.ShareToken, domain.NoteDraft{Title: "Edited by guest"})
	if err != nil {
		t.Fatalf("other user could not edit the shared note: %v", err)
	}
	if updated.Title != "Edited by guest" {
		t.Fatalf("expected edit to persist, got %q", updated.Title)
	}
}

func TestNoteSharingRequiresAuthentication(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil, nil)
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})

	note, err := service.CreateNote(owner, domain.NoteDraft{Title: "Shared"})
	if err != nil {
		t.Fatal(err)
	}
	shared, err := service.EnableShare(owner, note.ID)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.GetSharedNote(context.Background(), shared.ShareToken); err == nil {
		t.Fatal("expected anonymous access to be rejected")
	}
}

func TestDisableShareRevokesTheToken(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil, nil)
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "user-2"})

	note, err := service.CreateNote(owner, domain.NoteDraft{Title: "Shared"})
	if err != nil {
		t.Fatal(err)
	}
	shared, err := service.EnableShare(owner, note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.DisableShare(owner, note.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetSharedNote(other, shared.ShareToken); err == nil {
		t.Fatal("expected the revoked link to be rejected")
	}
}

func TestEnableShareRequiresOwnership(t *testing.T) {
	repository := memory.NewNoteRepository()
	service := NewNote(repository, nil, nil)
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "user-2"})

	note, err := service.CreateNote(owner, domain.NoteDraft{Title: "Private"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.EnableShare(other, note.ID); err == nil {
		t.Fatal("expected a non-owner to be rejected")
	}
}
