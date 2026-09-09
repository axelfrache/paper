FROM ghcr.io/pnpm/pnpm:12.3.4 AS frontend-build

WORKDIR /src/frontend

COPY frontend/.node-version ./
RUN pnpm runtime set node $(cat .node-version) -g

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=paper-frontend-pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm run build

FROM golang:1.26-bookworm AS backend-build

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontend-build /src/frontend/dist ./internal/adapter/inbound/http/web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/paper-api ./cmd/api

FROM alpine:3.22

RUN adduser -D -H app

WORKDIR /app

COPY --from=backend-build /out/paper-api /app/paper-api

USER app

EXPOSE 8080

ENTRYPOINT ["/app/paper-api"]
