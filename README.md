# Paper

[![CI](https://github.com/axelfrache/paper/actions/workflows/ci.yml/badge.svg)](https://github.com/axelfrache/paper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Paper is a self-hosted notes app with a WYSIWYG Markdown editor, editable diagrams, and optional AI assistance.

- **Write and organize** with folders, tags, search, image uploads, and undo.
- **Draw** flat and isometric diagrams directly in your notes, or generate them from a description with AI.
- **Ask Paper** about a note, selected text, or your library: summarize, extract tasks, and rewrite while preserving diagrams.
- **Install as a PWA.** Only the app shell is cached: notes, images, and API responses are not available offline.

## Quick start

Requires Docker and Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

Open [localhost:5173](http://localhost:5173). The same application and API are also exposed on port `8080`, the health endpoint is `/api/health`.

Compose runs Paper and PostgreSQL, with persistent volumes for notes and uploaded images. Stop with `docker compose down`, adding `-v` deletes those volumes.

## Configuration

See [.env.example](.env.example) for all settings. Docker Compose reads `.env`: when running the binary directly, export the required environment variables yourself.

| Area | Settings |
| --- | --- |
| Database | `DATABASE_URL` (provided by Compose) |
| Authentication | `AUTH_PROVIDER`: `dev`, `local`, or `oidc` |
| Images | `STORAGE_PROVIDER`: `filesystem` (default) or `s3` |
| AI | `AI_PROVIDER`: unset (disabled), `ollama`, `openai-compatible`, or `ai-gateway`: configure `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` as needed |

The default `dev` authentication provides a single local user without login. For a public deployment, use `local` or `oidc`, set a strong `AUTH_SESSION_SECRET`, configure `AUTH_PUBLIC_URL`, and enable `AUTH_COOKIE_SECURE` over HTTPS. OIDC also requires the identity-provider settings listed in `.env.example`.

AI conversations stay in memory until reload and responses do not stream. Applying a response is explicit, supports undo, and checks for conflicting edits to the affected fields.

### S3 image storage

To try the bundled Garage service, which provisions its own bucket and access key:

```bash
docker compose -f docker-compose.yml -f docker-compose.s3.yml up --build
```

For another S3-compatible service, set `STORAGE_PROVIDER=s3` and configure `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, and `S3_REGION`. Switching providers does not migrate existing images.

## Development

Requires **Go 1.26**, **Node.js 24–26**, **pnpm 12.3.4**, and a reachable PostgreSQL database. Export `DATABASE_URL` and any other required configuration before starting the backend.

Run in separate terminals:

```bash
cd backend
go run ./cmd/api
```

```bash
cd frontend
pnpm install
pnpm run dev
```

Vite serves the frontend on `http://localhost:5173` and proxies `/api` to the backend on port `8080`. Set `ALLOWED_ORIGINS` to include your frontend origin. Local image storage defaults to `data/uploads` outside Compose.

To build a standalone binary after installing frontend dependencies:

```bash
./scripts/build-standalone.sh
./backend/bin/paper
```

The binary embeds the frontend: Node.js and pnpm are needed only at build time. PostgreSQL is still required at runtime.

### Architecture

React + TypeScript + Vite power the frontend. The Go backend uses ports and adapters: business logic lives in `backend/internal/core`, HTTP and storage integrations in `backend/internal/adapter`, and application wiring in `backend/cmd/api`. Production runs the API and embedded frontend from one binary, backed by PostgreSQL and filesystem or S3 image storage.

### Checks

From `backend/`:

```bash
go build ./...
go vet ./...
gofmt -l .
go test ./...
```

From `frontend/`:

```bash
pnpm run build
pnpm run test
pnpm run format:check
```

CI checks Go formatting, vet, and tests, plus the frontend build and tests. Use `gofmt -w .` or `pnpm run format` in the corresponding directory to format code.

The folder storage integration test requires `PAPER_FOLDER_TEST_DATABASE_URL` pointing to a **disposable PostgreSQL database**: it recreates the notes, images, and folders tables.

## License

[MIT](LICENSE) · Copyright © 2026 Axel Frache.
