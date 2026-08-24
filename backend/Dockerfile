FROM golang:1.26-bookworm AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/paper-api ./cmd/api

FROM alpine:3.22

RUN adduser -D -H app

WORKDIR /app

COPY --from=build /out/paper-api /app/paper-api

USER app

EXPOSE 8080

ENTRYPOINT ["/app/paper-api"]
