package postgres

import (
	"context"
	"errors"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5"
	"sort"
)

func scanFolder(row noteScanner) (domain.Folder, error) {
	var f domain.Folder
	err := row.Scan(&f.ID, &f.OwnerID, &f.Name, &f.Color, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		err = domain.NewNotFoundError("Folder was not found.")
	}
	return f, err
}
func (r *NoteRepository) ListFolders(ctx context.Context, owner string) ([]domain.Folder, error) {
	rows, err := r.pool.Query(ctx, `select id, owner_id, name, color, created_at, updated_at from folders where owner_id = $1 order by lower(name), id`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Folder{}
	for rows.Next() {
		f, err := scanFolder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
func (r *NoteRepository) SaveFolder(ctx context.Context, owner, id string, d domain.FolderDraft) (domain.Folder, error) {
	if id == "" {
		return scanFolder(r.pool.QueryRow(ctx, `insert into folders (id, owner_id, name, color, created_at, updated_at) values ($1,$2,$3,$4,now(),now()) returning id, owner_id, name, color, created_at, updated_at`, "folder_"+newNoteID(), owner, d.Name, d.Color))
	}
	return scanFolder(r.pool.QueryRow(ctx, `update folders set name=$3,color=$4,updated_at=now() where id=$1 and owner_id=$2 returning id, owner_id, name, color, created_at, updated_at`, id, owner, d.Name, d.Color))
}
func (r *NoteRepository) DeleteFolder(ctx context.Context, owner, id string) error {
	cmd, err := r.pool.Exec(ctx, `delete from folders where id=$1 and owner_id=$2`, id, owner)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return domain.NewNotFoundError("Folder was not found.")
	}
	return nil
}
func (r *NoteRepository) MoveNotes(ctx context.Context, owner string, moves []domain.NoteMove) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Lock destinations first, then notes, in a stable order to avoid batch deadlocks.
	targets := map[string]bool{}
	for _, m := range moves {
		if m.FolderID != nil {
			targets[*m.FolderID] = true
		}
	}
	ids := []string{}
	for id := range targets {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		var found string
		err := tx.QueryRow(ctx, `select id from folders where id=$1 and owner_id=$2 for share`, id, owner).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Folder was not found.")
		}
		if err != nil {
			return err
		}
	}
	ordered := append([]domain.NoteMove(nil), moves...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].NoteID < ordered[j].NoteID })
	for _, m := range ordered {
		cmd, err := tx.Exec(ctx, `update notes set folder_id=$3 where id=$1 and owner_id=$2`, m.NoteID, owner, m.FolderID)
		if err != nil {
			return err
		}
		if cmd.RowsAffected() == 0 {
			return domain.NewNotFoundError("Note was not found.")
		}
	}
	return tx.Commit(ctx)
}
