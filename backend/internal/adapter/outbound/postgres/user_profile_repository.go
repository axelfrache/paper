package postgres

import (
	"context"
	"errors"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserProfileRepository struct {
	pool *pgxpool.Pool
}

func NewUserProfileRepository(ctx context.Context, databaseURL string) (*UserProfileRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	repo := &UserProfileRepository{pool: pool}
	if err := repo.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return repo, nil
}

func (r *UserProfileRepository) Close() {
	r.pool.Close()
}

func (r *UserProfileRepository) Get(ctx context.Context, userID string) (domain.UserProfile, error) {
	var profile domain.UserProfile
	err := r.pool.QueryRow(ctx, `
		select user_id, display_name, avatar_key, avatar_content_type, updated_at
		from user_profiles
		where user_id = $1
	`, userID).Scan(&profile.UserID, &profile.DisplayName, &profile.AvatarKey, &profile.AvatarContentType, &profile.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.UserProfile{}, domain.NewNotFoundError("Profile was not found.")
	}
	if err != nil {
		return domain.UserProfile{}, err
	}
	return profile, nil
}

func (r *UserProfileRepository) Upsert(ctx context.Context, profile domain.UserProfile) error {
	_, err := r.pool.Exec(ctx, `
		insert into user_profiles (user_id, display_name, avatar_key, avatar_content_type, updated_at)
		values ($1, $2, $3, $4, $5)
		on conflict (user_id) do update set
			display_name = excluded.display_name,
			avatar_key = excluded.avatar_key,
			avatar_content_type = excluded.avatar_content_type,
			updated_at = excluded.updated_at
	`, profile.UserID, profile.DisplayName, profile.AvatarKey, profile.AvatarContentType, profile.UpdatedAt)
	return err
}

func (r *UserProfileRepository) DeleteAccount(ctx context.Context, userID string) ([]string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		select storage_key from note_images where owner_id = $1
		union all
		select avatar_key from user_profiles where user_id = $1 and avatar_key <> ''
	`, userID)
	if err != nil {
		return nil, err
	}
	keys, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}

	statements := []string{
		`delete from note_images where owner_id = $1`,
		`delete from notes where owner_id = $1`,
		`delete from folders where owner_id = $1`,
		`delete from user_profiles where user_id = $1`,
		`delete from auth_sessions where user_id = $1`,
	}
	var hasUsers bool
	// users only exists with the local auth provider.
	if err := tx.QueryRow(ctx, `select to_regclass('users') is not null`).Scan(&hasUsers); err != nil {
		return nil, err
	}
	if hasUsers {
		statements = append(statements, `delete from users where id = $1`)
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement, userID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return keys, nil
}

func (r *UserProfileRepository) migrate(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		create table if not exists user_profiles (
			user_id text primary key,
			display_name text not null default '',
			avatar_key text not null default '',
			avatar_content_type text not null default '',
			updated_at timestamptz not null default now()
		)
	`)
	return err
}
