package domain

import "fmt"

type ErrorKind string

const (
	KindInvalid          ErrorKind = "invalid"
	KindNotFound         ErrorKind = "not_found"
	KindTooLarge         ErrorKind = "too_large"
	KindUnsupportedMedia ErrorKind = "unsupported_media"
	KindAIUnavailable    ErrorKind = "ai_unavailable"
	KindUnauthorized     ErrorKind = "unauthorized"
	KindForbidden        ErrorKind = "forbidden"
	KindRateLimited      ErrorKind = "rate_limited"
)

type AppError struct {
	Kind    ErrorKind
	Message string
	Status  int
}

func (e *AppError) Error() string {
	return e.Message
}

func NewInvalidError(format string, args ...any) error {
	return &AppError{Kind: KindInvalid, Message: fmt.Sprintf(format, args...)}
}

func NewNotFoundError(format string, args ...any) error {
	return &AppError{Kind: KindNotFound, Message: fmt.Sprintf(format, args...)}
}

func NewUnauthorizedError(format string, args ...any) error {
	return &AppError{Kind: KindUnauthorized, Message: fmt.Sprintf(format, args...)}
}

func NewForbiddenError(format string, args ...any) error {
	return &AppError{Kind: KindForbidden, Message: fmt.Sprintf(format, args...)}
}

func NewAIError(status int, format string, args ...any) error {
	return &AppError{Kind: KindAIUnavailable, Status: status, Message: fmt.Sprintf(format, args...)}
}

func NewRateLimitedError(format string, args ...any) error {
	return &AppError{Kind: KindRateLimited, Message: fmt.Sprintf(format, args...)}
}
