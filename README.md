# Paper

[![CI](https://github.com/axelfrache/paper/actions/workflows/ci.yml/badge.svg)](https://github.com/axelfrache/paper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

## Description

Paper is an AI-assisted notes app. It pairs a from-scratch markdown editor with embedded, editable diagrams and a set of LLM-powered actions that work directly on the note you are writing.

The backend is a Go application built on a strict hexagonal (ports & adapters) architecture. It embeds and serves the React 19 + TypeScript SPA in production. Notes live in Postgres, images use either the local filesystem or an S3-compatible store, and the AI features talk to a pluggable, OpenAI-compatible LLM provider.

### Features

- **WYSIWYG markdown editor**: a hand-rolled editor over `contenteditable` with its own caret model, rendered line by line.
- **Diagrams**: flat and isometric diagrams as embedded blocks, with an interactive editor (with an isometric placement grid) and text-to-diagram generation.
- **Folders**: color-coded folders with note counts, scoped search, bulk moves, drag-and-drop, and undo. Deleting a folder keeps its notes in No folder.
- **AI note actions**: summarize, extract tasks, suggest title/tags, clean up, improve clarity, and ask-your-notes.
- **Diagram-safe rewriting**: clean up and improve clarity mask embedded diagram markers before sending content to the LLM, so a diagram is never mangled.
- **Image uploads**: client-side resize and compression, stored locally or in an S3-compatible bucket.
- **Pluggable LLM providers**: configured by environment, not code (`ai-gateway`, `ollama`, or any `openai-compatible` endpoint).

## Architecture

The minimal Docker Compose deployment runs two containers:

| Service | Role | Port |
|---------|------|------|
| `paper` | Go API and embedded React SPA | 5173 and 8080 |
| `postgres` | Persistent note store | 5432 (internal) |

The optional `docker-compose.s3.yml` override adds a self-provisioning Garage container on port 3902.

The backend follows the dependency direction *adapters to core, never core to adapter*:

```
cmd/api/main.go              wiring: config, postgres repo, ai assistant, note service
internal/core/domain/        domain types and errors
internal/core/port/          interfaces (NoteService, NoteRepository, NoteAssistant, ImageStorage)
internal/core/service/       business logic, talks only to ports (the only Go tests live here)
internal/adapter/inbound/    HTTP server, routes, handlers, DTOs
internal/adapter/outbound/   postgres, memory, ai, filesystem, and s3 adapters
internal/config/             env var loading
```

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (frontend development only)
- Go 1.26 (backend development only)

## Running

### Fully dockerized (recommended)

Copy the environment file and start the full stack:

```bash
cp .env.example .env
docker compose up --build
```

Then go to:
- Application: http://localhost:5173
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/api/health

To stop:

```bash
docker compose down
```

Use `-v` to also remove the Postgres and local image volumes.

Images are stored in the `paper-uploads` volume by default.

### S3-compatible image storage

Start Paper with Garage instead of local image storage:

```bash
docker compose -f docker-compose.yml -f docker-compose.s3.yml up --build
```

Set `STORAGE_PROVIDER=s3` with `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, and `S3_REGION` when using another S3-compatible service. Garage self-provisions its layout, bucket, and access key. Switching providers does not migrate existing images.

### Frontend only (development mode)

```bash
cd frontend
pnpm install
pnpm run dev
```

Runs on http://localhost:5173 and proxies `/api` to http://localhost:8080.

### Backend only (development mode)

```bash
cd backend
go run ./cmd/api
```

Runs on http://localhost:8080.

The development backend does not contain generated frontend assets; use the Vite server alongside it. The backend reads its configuration from environment variables (see `.env.example`) and expects a reachable Postgres instance. Local image storage defaults to `data/uploads`. `ALLOWED_ORIGINS` must include the frontend origin for CORS.

### Standalone binary

```bash
./scripts/build-standalone.sh
./backend/bin/paper
```

The build script compiles the frontend and embeds it in the Go binary. Node.js and pnpm are build-time dependencies only.

### AI provider

The AI features are optional and **off by default**: with `AI_PROVIDER` unset, the AI
actions are hidden and the app runs without them. Set a provider to enable them:

- `AI_PROVIDER`: `ollama`, `openai-compatible`, or `ai-gateway`
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`

All three providers speak the same OpenAI-compatible chat API.

## Code Quality

- **Backend**: `gofmt` and `go vet`, with unit tests on the service layer.
- **Frontend**: Prettier, TypeScript type-checking, and Vitest.

### Commands

**Backend (run from `backend/`):**

```bash
go build ./...
go vet ./...
gofmt -l .       # CI fails if this outputs anything; use `gofmt -w .` to fix
go test ./...
```

**Frontend (run from `frontend/`):**

```bash
pnpm run build          # tsc -b && vite build
pnpm run test           # type-check + vitest run
pnpm run format:check   # check formatting
pnpm run format         # fix formatting
```

> **Warning**: CI checks backend `vet` / `gofmt` / `go test` and frontend `build` / `test` on every
> push, then builds and pushes the `paper` Docker image. Keep `gofmt` clean and `tsc` error-free. Both gate CI.

## License

This project is distributed under the [MIT License](LICENSE).

Copyright (c) 2026 Axel Frache.

### Folder storage and integration tests

Folders are private to each user. Existing notes migrate to No folder automatically at startup. Content autosaves do not change folder membership or the last-edited date when moving a note.

The authenticated folder API uses `GET/POST /api/folders`, `PATCH/DELETE /api/folders/{id}`, and `POST /api/notes/move` with `{ "moves": [{ "noteId": "…", "folderId": "…" }] }`. Use `null` to unfile a note. Batches of up to 500 notes are atomic. Creation accepts an optional `folderId`; content updates intentionally ignore it.

To run the PostgreSQL migration and transaction test, point `PAPER_FOLDER_TEST_DATABASE_URL` at a **disposable database** and run `go test ./...` from `backend`. This test recreates the notes, images, and folders tables; never use an application database. Without that variable, this integration test is skipped and the in-memory service tests still run.

### Install Paper (PWA)

Production builds include a web app manifest, PNG installation icons, and a versioned service worker. Serve Paper over HTTPS (localhost is supported for development checks). Use **Install Paper** in the account menu, or your browser’s installation action. On iPhone/iPad, the menu explains how to add Paper to the home screen from Safari. The worker is registered only in production builds, not during Vite development.

This release caches only the public application shell: scripts, styles, fonts, logos, and installation assets. API requests, authentication callbacks, notes, and uploaded images are never cached by the worker. Opening Paper offline shows a reconnect screen; offline access to saved notes and durable offline editing are not included.

Failed autosaves retain the latest draft **in the current window** and expose a Retry action. Reconnecting retries outstanding drafts. Closing the window can lose these drafts; they are not stored in IndexedDB. Saves for the same note run serially. Sign-out and PWA updates wait for outstanding saves; updates also require other Paper windows to be closed. The app never automatically reloads an editing window for an update.

`npm run build` generates `dist/sw.js` from the final asset contents. Deploy the complete build together; the Go server serves the manifest and worker with revalidation headers. No extra runtime service or npm dependency is needed.
