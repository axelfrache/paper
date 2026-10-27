package service

import (
	"context"
	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func (s *Note) ListFolders(ctx context.Context) ([]domain.Folder, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return nil, err
	}
	return s.repo.ListFolders(ctx, user.ID)
}
func (s *Note) SaveFolder(ctx context.Context, id string, draft domain.FolderDraft) (domain.Folder, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.Folder{}, err
	}
	draft, err = draft.Normalize()
	if err != nil {
		return domain.Folder{}, err
	}
	return s.repo.SaveFolder(ctx, user.ID, id, draft)
}
func (s *Note) DeleteFolder(ctx context.Context, id string) error {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return err
	}
	return s.repo.DeleteFolder(ctx, user.ID, id)
}
func (s *Note) MoveNotes(ctx context.Context, moves []domain.NoteMove) error {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return err
	}
	if len(moves) == 0 || len(moves) > 500 {
		return domain.NewInvalidError("Move between 1 and 500 notes at a time.")
	}
	seen := map[string]bool{}
	for _, move := range moves {
		if move.NoteID == "" || seen[move.NoteID] || (move.FolderID != nil && *move.FolderID == "") {
			return domain.NewInvalidError("Invalid note move.")
		}
		seen[move.NoteID] = true
	}
	return s.repo.MoveNotes(ctx, user.ID, moves)
}
