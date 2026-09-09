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

The backend is a Go API built on a strict hexagonal (ports & adapters) architecture. The frontend is a React 19 + TypeScript SPA. Notes live in Postgres, images in a self-hosted S3-compatible store (Garage), and the AI features talk to a pluggable, OpenAI-compatible LLM provider.

### Features

- **WYSIWYG markdown editor**: a hand-rolled editor over `contenteditable` with its own caret model, rendered line by line.
- **Diagrams**: flat and isometric diagrams as embedded blocks, with an interactive editor (with an isometric placement grid) and text-to-diagram generation.
- **AI note actions**: summarize, extract tasks, suggest title/tags, clean up, improve clarity, and ask-your-notes.
- **Diagram-safe rewriting**: clean up and improve clarity mask embedded diagram markers before sending content to the LLM, so a diagram is never mangled.
- **Image uploads**: client-side resize and compression, stored in a self-hosted S3 bucket.
- **Pluggable LLM providers**: configured by environment, not code (`ai-gateway`, `ollama`, or any `openai-compatible` endpoint).

## Architecture

Paper runs as a small set of containers wired together by `docker-compose.yml`:

| Service | Role | Port |
|---------|------|------|
| `frontend` | React 19 + Vite SPA, served by nginx | 5173 |
| `backend` | Go API (hexagonal / ports & adapters) | 8080 |
| `garage` | S3-compatible image store, self-provisioning | 3902 |
| `postgres` | Persistent note store | 5432 (internal) |

The backend follows the dependency direction *adapters to core, never core to adapter*:

```
cmd/api/main.go              wiring: config, postgres repo, ai assistant, note service
internal/core/domain/        domain types and errors
internal/core/port/          interfaces (NoteService, NoteRepository, NoteAssistant, ImageStorage)
internal/core/service/       business logic, talks only to ports (the only Go tests live here)
internal/adapter/inbound/    HTTP server, routes, handlers, DTOs
internal/adapter/outbound/   postgres, memory, ai (OpenAI-compatible), s3 (Garage) adapters
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
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/api/health

To stop:

```bash
docker compose down
```

Use `-v` to also remove the Postgres and Garage volumes.

> Garage self-provisions its layout, bucket and access key on first boot and marks itself
> healthy once ready. The backend waits on that healthcheck before starting.

### Frontend only (development mode)

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173 and proxies `/api` to http://localhost:8080.

### Backend only (development mode)

```bash
cd backend
go run ./cmd/api
```

Runs on http://localhost:8080.

The backend reads its configuration from environment variables (see `.env.example`) and expects a
reachable Postgres and S3 endpoint. `ALLOWED_ORIGINS` must include the frontend origin for CORS.

### AI provider

The AI features are configured entirely by environment, not code:

- `AI_PROVIDER`: `ai-gateway` (default), `ollama`, or `openai-compatible`
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
npm run build          # tsc -b && vite build
npm run test           # type-check + vitest run
npm run format:check   # check formatting
npm run format         # fix formatting
```

> **Warning**: CI checks backend `vet` / `gofmt` / `go test` and frontend `build` / `test` on every
> push, then builds and pushes the Docker images. Keep `gofmt` clean and `tsc` error-free. Both gate CI.

## License

This project is distributed under the [MIT License](LICENSE).

Copyright (c) 2026 Axel Frache.
