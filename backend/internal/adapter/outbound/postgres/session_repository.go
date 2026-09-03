package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(ctx context.Context, databaseURL string) (*SessionRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	repo := &SessionRepository{pool: pool}
	if err := repo.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return repo, nil
}

func (r *SessionRepository) Close() {
	r.pool.Close()
}

func (r *SessionRepository) Save(ctx context.Context, session domain.Session) error {
	roles, err := json.Marshal(session.User.Roles)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		insert into auth_sessions (
			id, user_id, email, display_name, roles, token_envelope, expires_at, created_at, updated_at
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		on conflict (id) do update set
			email = excluded.email,
			display_name = excluded.display_name,
			roles = excluded.roles,
			token_envelope = excluded.token_envelope,
			expires_at = excluded.expires_at,
			updated_at = excluded.updated_at
	`, session.ID, session.User.ID, session.User.Email, session.User.Name, roles, session.TokenEnvelope,
		session.ExpiresAt, session.CreatedAt, session.UpdatedAt)
	return err
}

func (r *SessionRepository) Get(ctx context.Context, id string) (domain.Session, error) {
	var session domain.Session
	var roles []byte
	err := r.pool.QueryRow(ctx, `
		select id, user_id, email, display_name, roles, token_envelope, expires_at, created_at, updated_at
		from auth_sessions
		where id = $1
	`, id).Scan(&session.ID, &session.User.ID, &session.User.Email, &session.User.Name, &roles,
		&session.TokenEnvelope, &session.ExpiresAt, &session.CreatedAt, &session.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Session{}, domain.NewNotFoundError("Session was not found.")
	}
	if err != nil {
		return domain.Session{}, err
	}
	if err := json.Unmarshal(roles, &session.User.Roles); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (r *SessionRepository) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `delete from auth_sessions where id = $1`, id)
	return err
}

func (r *SessionRepository) migrate(ctx context.Context) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	statements := []string{`
		create table if not exists auth_sessions (
			id text primary key,
			user_id text not null,
			email text not null default '',
			display_name text not null default '',
			roles jsonb not null default '[]'::jsonb,
			token_envelope text not null default '',
			expires_at timestamptz not null,
			created_at timestamptz not null,
			updated_at timestamptz not null
		)
	`, `create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id)`,
		`create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
