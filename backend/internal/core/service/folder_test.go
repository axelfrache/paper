package service

import (
	"context"
	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"testing"
)

func TestFolderLifecycleAndAutosave(t *testing.T) {
	s := NewNote(memory.NewNoteRepository(), nil)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	f, err := s.SaveFolder(ctx, "", domain.FolderDraft{Name: "  Home  lab ", Color: "blue"})
	if err != nil {
		t.Fatal(err)
	}
	if f.Name != "Home lab" {
		t.Fatal(f.Name)
	}
	n, err := s.CreateNote(ctx, domain.NoteDraft{Title: "Architecture", FolderID: &f.ID})
	if err != nil {
		t.Fatal(err)
	}
	if n.FolderID == nil || *n.FolderID != f.ID {
		t.Fatal("creation lost folder")
	}
	if err := s.MoveNotes(ctx, []domain.NoteMove{{NoteID: n.ID}}); err != nil {
		t.Fatal(err)
	}
	moved, _ := s.GetNote(ctx, n.ID)
	if moved.FolderID != nil || !moved.UpdatedAt.Equal(n.UpdatedAt) {
		t.Fatal("moving changed content timestamp or failed")
	}
	// An autosave queued before moving must never restore the old folder.
	saved, err := s.UpdateNote(ctx, n.ID, domain.NoteDraft{Title: "Edited", FolderID: &f.ID})
	if err != nil {
		t.Fatal(err)
	}
	if saved.FolderID != nil {
		t.Fatal("autosave restored folder")
	}
	if err := s.MoveNotes(ctx, []domain.NoteMove{{NoteID: n.ID, FolderID: &f.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteFolder(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	kept, err := s.GetNote(ctx, n.ID)
	if err != nil || kept.Title != "Edited" || kept.FolderID != nil || !kept.UpdatedAt.Equal(saved.UpdatedAt) {
		t.Fatalf("deleting folder changed note: %+v %v", kept, err)
	}
}
func TestFolderOwnershipAndAtomicMoves(t *testing.T) {
	s := NewNote(memory.NewNoteRepository(), nil)
	a := domain.ContextWithUser(context.Background(), domain.User{ID: "a"})
	b := domain.ContextWithUser(context.Background(), domain.User{ID: "b"})
	f, _ := s.SaveFolder(a, "", domain.FolderDraft{Name: "Private", Color: "blue"})
	n, _ := s.CreateNote(a, domain.NoteDraft{Title: "A"})
	foreign, _ := s.CreateNote(b, domain.NoteDraft{Title: "B"})
	if folders, err := s.ListFolders(b); err != nil || len(folders) != 0 {
		t.Fatal("folders leaked")
	}
	if _, err := s.SaveFolder(b, f.ID, domain.FolderDraft{Name: "Hacked", Color: "green"}); err == nil {
		t.Fatal("edited foreign folder")
	}
	if err := s.DeleteFolder(b, f.ID); err == nil {
		t.Fatal("deleted foreign folder")
	}
	if _, err := s.CreateNote(b, domain.NoteDraft{FolderID: &f.ID}); err == nil {
		t.Fatal("created note in foreign folder")
	}
	if err := s.MoveNotes(b, []domain.NoteMove{{NoteID: foreign.ID, FolderID: &f.ID}}); err == nil {
		t.Fatal("moved to foreign folder")
	}
	if err := s.MoveNotes(a, []domain.NoteMove{{NoteID: n.ID, FolderID: &f.ID}, {NoteID: foreign.ID, FolderID: &f.ID}}); err == nil {
		t.Fatal("moved foreign note")
	}
	unchanged, _ := s.GetNote(a, n.ID)
	if unchanged.FolderID != nil {
		t.Fatal("batch partially applied")
	}
	if err := s.MoveNotes(a, []domain.NoteMove{{NoteID: n.ID}, {NoteID: n.ID}}); err == nil {
		t.Fatal("accepted duplicate move")
	}
	if _, err := s.SaveFolder(a, "", domain.FolderDraft{Name: " ", Color: "blue"}); err == nil {
		t.Fatal("accepted empty folder name")
	}
	if _, err := s.ListFolders(context.Background()); err == nil {
		t.Fatal("unauthenticated access")
	}
}
