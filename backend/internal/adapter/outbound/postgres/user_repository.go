package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(ctx context.Context, databaseURL string) (*UserRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	repo := &UserRepository{pool: pool}
	if err := repo.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return repo, nil
}

func (r *UserRepository) Close() {
	r.pool.Close()
}

func (r *UserRepository) Create(ctx context.Context, record domain.UserRecord) error {
	roles, err := json.Marshal(record.Roles)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		insert into users (id, email, display_name, roles, password_hash, created_at, updated_at)
		values ($1, $2, $3, $4, $5, $6, $7)
	`, record.ID, record.Email, record.Name, roles, record.PasswordHash, record.CreatedAt, record.UpdatedAt)
	return err
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (domain.UserRecord, error) {
	var record domain.UserRecord
	var roles []byte
	err := r.pool.QueryRow(ctx, `
		select id, email, display_name, roles, password_hash, created_at, updated_at
		from users
		where email = $1
	`, email).Scan(&record.ID, &record.Email, &record.Name, &roles, &record.PasswordHash, &record.CreatedAt, &record.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.UserRecord{}, domain.NewNotFoundError("User was not found.")
	}
	if err != nil {
		return domain.UserRecord{}, err
	}
	if err := json.Unmarshal(roles, &record.Roles); err != nil {
		return domain.UserRecord{}, err
	}
	return record, nil
}

func (r *UserRepository) SetRoles(ctx context.Context, id string, roles []string) error {
	encoded, err := json.Marshal(roles)
	if err != nil {
		return err
	}
	command, err := r.pool.Exec(ctx, `update users set roles = $2, updated_at = now() where id = $1`, id, encoded)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return domain.NewNotFoundError("User was not found.")
	}
	return nil
}

func (r *UserRepository) migrate(ctx context.Context) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	statements := []string{`
		create table if not exists users (
			id text primary key,
			email text not null unique,
			display_name text not null default '',
			roles jsonb not null default '[]'::jsonb,
			password_hash text not null,
			created_at timestamptz not null,
			updated_at timestamptz not null
		)
	`}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
