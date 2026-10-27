package postgres

import (
	"context"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

// Use a dedicated disposable database: this test recreates the public tables.
func TestFolderMigrationAndTransactions(t *testing.T) {
	url := os.Getenv("PAPER_FOLDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires disposable PAPER_FOLDER_TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	_, err = pool.Exec(ctx, `drop table if exists note_images,notes,folders cascade;
 create table notes (id text primary key,owner_id text,title text not null,content text not null,tags jsonb not null default '[]',favorite boolean not null default false,created_at timestamptz not null,updated_at timestamptz not null);
 insert into notes values ('legacy','a','Existing','Keep me','[]',false,now(),now())`)
	if err != nil {
		t.Fatal(err)
	}
	r, err := NewNoteRepository(ctx, url, "a")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if err := r.migrate(ctx, "a"); err != nil {
		t.Fatal("migration not idempotent", err)
	}
	old, err := r.GetByID(ctx, "a", "legacy")
	if err != nil || old.FolderID != nil || old.Content != "Keep me" {
		t.Fatalf("migration lost note: %+v %v", old, err)
	}
	f, err := r.SaveFolder(ctx, "a", "", domain.FolderDraft{Name: "Infra", Color: "blue"})
	if err != nil {
		t.Fatal(err)
	}
	n, err := r.Create(ctx, "a", domain.NoteDraft{Title: "New", FolderID: &f.ID})
	if err != nil {
		t.Fatal(err)
	}
	// Compare persisted timestamps at PostgreSQL precision.
	n, err = r.GetByID(ctx, "a", n.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.Create(ctx, "b", domain.NoteDraft{FolderID: &f.ID}); err == nil {
		t.Fatal("foreign creation accepted")
	}
	foreign, err := r.Create(ctx, "b", domain.NoteDraft{Title: "Foreign"})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.MoveNotes(ctx, "a", []domain.NoteMove{{NoteID: "legacy", FolderID: &f.ID}, {NoteID: foreign.ID, FolderID: &f.ID}}); err == nil {
		t.Fatal("foreign batch accepted")
	}
	kept, _ := r.GetByID(ctx, "a", "legacy")
	if kept.FolderID != nil {
		t.Fatal("batch did not roll back")
	}
	if err := r.MoveNotes(ctx, "a", []domain.NoteMove{{NoteID: n.ID}}); err != nil {
		t.Fatal(err)
	}
	moved, _ := r.GetByID(ctx, "a", n.ID)
	if moved.FolderID != nil || !moved.UpdatedAt.Equal(n.UpdatedAt) {
		t.Fatal("move changed timestamp")
	}
	saved, err := r.Update(ctx, "a", n.ID, domain.NoteDraft{Title: "Edited", FolderID: &f.ID})
	if err != nil || saved.FolderID != nil {
		t.Fatal("autosave restored folder", err)
	}
	if err := r.MoveNotes(ctx, "a", []domain.NoteMove{{NoteID: n.ID, FolderID: &f.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := r.DeleteFolder(ctx, "b", f.ID); err == nil {
		t.Fatal("foreign delete accepted")
	}
	if err := r.DeleteFolder(ctx, "a", f.ID); err != nil {
		t.Fatal(err)
	}
	kept, err = r.GetByID(ctx, "a", n.ID)
	if err != nil || kept.FolderID != nil || kept.Title != "Edited" || !kept.UpdatedAt.Equal(saved.UpdatedAt) {
		t.Fatal("deletion changed note", err)
	}
}
