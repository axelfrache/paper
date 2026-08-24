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

func NewNoteRepository(ctx context.Context, databaseURL string) (*NoteRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	repo := &NoteRepository{pool: pool}
	if err := repo.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return repo, nil
}

func (r *NoteRepository) Close() {
	r.pool.Close()
}

func (r *NoteRepository) Create(ctx context.Context, draft domain.NoteDraft) (domain.Note, error) {
	now := time.Now().UTC()
	note := domain.Note{
		ID:        newNoteID(),
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
		insert into notes (id, title, content, tags, favorite, created_at, updated_at)
		values ($1, $2, $3, $4, $5, $6, $7)
	`, note.ID, note.Title, note.Content, tags, note.Favorite, note.CreatedAt, note.UpdatedAt)
	if err != nil {
		return domain.Note{}, err
	}
	return cloneNote(note), nil
}

func (r *NoteRepository) Update(ctx context.Context, id string, draft domain.NoteDraft) (domain.Note, error) {
	now := time.Now().UTC()
	tags, err := json.Marshal(draft.Tags)
	if err != nil {
		return domain.Note{}, err
	}
	row := r.pool.QueryRow(ctx, `
		update notes
		set title = $2, content = $3, tags = $4, favorite = $5, updated_at = $6
		where id = $1
		returning id, title, content, tags, favorite, created_at, updated_at
	`, id, draft.Title, draft.Content, tags, draft.Favorite, now)
	return scanNote(row, id)
}

func (r *NoteRepository) GetByID(ctx context.Context, id string) (domain.Note, error) {
	row := r.pool.QueryRow(ctx, `
		select id, title, content, tags, favorite, created_at, updated_at
		from notes
		where id = $1
	`, id)
	return scanNote(row, id)
}

func (r *NoteRepository) List(ctx context.Context) ([]domain.Note, error) {
	rows, err := r.pool.Query(ctx, `
		select id, title, content, tags, favorite, created_at, updated_at
		from notes
		order by updated_at desc
	`)
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

func (r *NoteRepository) Delete(ctx context.Context, id string) error {
	command, err := r.pool.Exec(ctx, `delete from notes where id = $1`, id)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return domain.NewNotFoundError("Note %q was not found.", id)
	}
	return nil
}

func (r *NoteRepository) migrate(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		create table if not exists notes (
			id text primary key,
			title text not null,
			content text not null,
			tags jsonb not null default '[]'::jsonb,
			favorite boolean not null default false,
			created_at timestamptz not null,
			updated_at timestamptz not null
		)
	`)
	return err
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
