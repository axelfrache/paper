package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type NoteRepository struct {
	pool *pgxpool.Pool
}

func NewNoteRepository(ctx context.Context, databaseURL, legacyOwnerID string) (*NoteRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	repo := &NoteRepository{pool: pool}
	if err := repo.migrate(ctx, legacyOwnerID); err != nil {
		pool.Close()
		return nil, err
	}
	return repo, nil
}

func (r *NoteRepository) Close() {
	r.pool.Close()
}

func (r *NoteRepository) Create(ctx context.Context, ownerID string, draft domain.NoteDraft) (domain.Note, error) {
	now := time.Now().UTC()
	note := domain.Note{
		ID:        newNoteID(),
		OwnerID:   ownerID,
		Title:     draft.Title,
		Content:   draft.Content,
		Tags:      cloneTags(draft.Tags),
		Favorite:  draft.Favorite,
		CreatedAt: now,
		UpdatedAt: now,
	}
	tags, err := json.Marshal(note.Tags)
	if err != nil {
		return domain.Note{}, err
	}
	_, err = r.pool.Exec(ctx, `
		insert into notes (id, owner_id, title, content, tags, favorite, created_at, updated_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
	`, note.ID, note.OwnerID, note.Title, note.Content, tags, note.Favorite, note.CreatedAt, note.UpdatedAt)
	if err != nil {
		return domain.Note{}, err
	}
	return cloneNote(note), nil
}

func (r *NoteRepository) Update(ctx context.Context, ownerID, id string, draft domain.NoteDraft) (domain.Note, error) {
	now := time.Now().UTC()
	tags, err := json.Marshal(draft.Tags)
	if err != nil {
		return domain.Note{}, err
	}
	row := r.pool.QueryRow(ctx, `
		update notes
		set title = $2, content = $3, tags = $4, favorite = $5, updated_at = $6
		where id = $1 and owner_id = $7
		returning id, title, content, tags, favorite, created_at, updated_at
	`, id, draft.Title, draft.Content, tags, draft.Favorite, now, ownerID)
	return scanNote(row, id)
}

func (r *NoteRepository) GetByID(ctx context.Context, ownerID, id string) (domain.Note, error) {
	row := r.pool.QueryRow(ctx, `
		select id, title, content, tags, favorite, created_at, updated_at
		from notes
		where id = $1 and owner_id = $2
	`, id, ownerID)
	return scanNote(row, id)
}

func (r *NoteRepository) List(ctx context.Context, ownerID string) ([]domain.Note, error) {
	rows, err := r.pool.Query(ctx, `
		select id, title, content, tags, favorite, created_at, updated_at
		from notes
		where owner_id = $1
		order by updated_at desc
	`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := make([]domain.Note, 0)
	for rows.Next() {
		note, err := scanNote(rows, "")
		if err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return notes, nil
}

func (r *NoteRepository) Delete(ctx context.Context, ownerID, id string) error {
	command, err := r.pool.Exec(ctx, `delete from notes where id = $1 and owner_id = $2`, id, ownerID)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return domain.NewNotFoundError("Note %q was not found.", id)
	}
	return nil
}

func (r *NoteRepository) ClaimOwner(ctx context.Context, previousOwnerID, ownerID string) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	command, err := tx.Exec(ctx, `update notes set owner_id = $2 where owner_id = $1`, previousOwnerID, ownerID)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `update note_images set owner_id = $2 where owner_id = $1`, previousOwnerID, ownerID); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return command.RowsAffected(), nil
}

func (r *NoteRepository) SaveImage(ctx context.Context, image domain.NoteImageRecord) error {
	_, err := r.pool.Exec(ctx, `
		insert into note_images (id, note_id, owner_id, storage_key, name, content_type, size, created_at)
		values ($1, $2, $3, $4, $5, $6, $7, now())
	`, image.ID, image.NoteID, image.OwnerID, image.StorageKey, image.Name, image.ContentType, image.Size)
	return err
}

func (r *NoteRepository) GetImage(ctx context.Context, ownerID, imageID string) (domain.NoteImageRecord, error) {
	var image domain.NoteImageRecord
	err := r.pool.QueryRow(ctx, `
		select id, note_id, owner_id, storage_key, name, content_type, size
		from note_images
		where id = $1 and owner_id = $2
	`, imageID, ownerID).Scan(&image.ID, &image.NoteID, &image.OwnerID, &image.StorageKey,
		&image.Name, &image.ContentType, &image.Size)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.NoteImageRecord{}, domain.NewNotFoundError("Image was not found.")
	}
	if err != nil {
		return domain.NoteImageRecord{}, err
	}
	return image, nil
}

func (r *NoteRepository) DeleteImage(ctx context.Context, ownerID, imageID string) error {
	command, err := r.pool.Exec(ctx, `delete from note_images where id = $1 and owner_id = $2`, imageID, ownerID)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return domain.NewNotFoundError("Image was not found.")
	}
	return nil
}

func (r *NoteRepository) migrate(ctx context.Context, legacyOwnerID string) error {
	if legacyOwnerID == "" {
		legacyOwnerID = "legacy"
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	statements := []string{`
		create table if not exists notes (
			id text primary key,
			owner_id text,
			title text not null,
			content text not null,
			tags jsonb not null default '[]'::jsonb,
			favorite boolean not null default false,
			created_at timestamptz not null,
			updated_at timestamptz not null
		)
	`, `alter table notes add column if not exists owner_id text`, `
		create table if not exists note_images (
			id text primary key,
			note_id text not null references notes(id) on delete cascade,
			owner_id text not null,
			storage_key text not null,
			name text not null default '',
			content_type text not null default '',
			size bigint not null default 0,
			created_at timestamptz not null
		)
	`, `create index if not exists notes_owner_updated_idx on notes (owner_id, updated_at desc)`,
		`create index if not exists note_images_owner_idx on note_images (owner_id, id)`, `
		insert into note_images (id, note_id, owner_id, storage_key, name, content_type, size, created_at)
		select found[1], notes.id, notes.owner_id, 'images/' || found[1], found[1], '', 0, notes.created_at
		from notes
		cross join lateral regexp_matches(notes.content, '/api/images/([a-f0-9]{32}\.(png|jpg|gif|webp|svg))', 'g') as found
		on conflict (id) do nothing
	`}
	for _, statement := range statements[:2] {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `update notes set owner_id = $1 where owner_id is null or owner_id = ''`, legacyOwnerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `alter table notes alter column owner_id set not null`); err != nil {
		return err
	}
	for _, statement := range statements[2:] {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type noteScanner interface {
	Scan(dest ...any) error
}

func scanNote(scanner noteScanner, requestedID string) (domain.Note, error) {
	var note domain.Note
	var rawTags []byte
	if err := scanner.Scan(&note.ID, &note.Title, &note.Content, &rawTags, &note.Favorite, &note.CreatedAt, &note.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Note{}, domain.NewNotFoundError("Note %q was not found.", requestedID)
		}
		return domain.Note{}, err
	}
	if err := json.Unmarshal(rawTags, &note.Tags); err != nil {
		return domain.Note{}, err
	}
	note.Tags = domain.NormalizeTags(note.Tags)
	return note, nil
}

func newNoteID() string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "note_" + hex.EncodeToString([]byte(time.Now().UTC().Format("20060102150405.000000000")))
	}
	return "note_" + hex.EncodeToString(bytes[:])
}

func cloneNote(note domain.Note) domain.Note {
	note.Tags = cloneTags(note.Tags)
	return note
}

func cloneTags(tags []string) []string {
	out := make([]string, len(tags))
	copy(out, tags)
	return out
}
