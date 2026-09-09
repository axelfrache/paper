package http

import (
	"io/fs"
	stdhttp "net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestSPAHandlerServesFrontendRoutesAndAssets(t *testing.T) {
	assets := fstest.MapFS{
		"index.html":                 &fstest.MapFile{Data: []byte("<main>Paper</main>")},
		"assets/app-abc123.js":       &fstest.MapFile{Data: []byte("app")},
		"diagram-icons/flat/api.svg": &fstest.MapFile{Data: []byte("<svg></svg>")},
		"paper-mark.svg":             &fstest.MapFile{Data: []byte("<svg></svg>")},
	}
	handler := newSPAHandler(assets)

	tests := []struct {
		name   string
		path   string
		status int
		body   string
		cache  string
		method string
	}{
		{name: "root", path: "/", status: stdhttp.StatusOK, body: "<main>Paper</main>", cache: "no-cache"},
		{name: "frontend route", path: "/notes/123", status: stdhttp.StatusOK, body: "<main>Paper</main>", cache: "no-cache"},
		{name: "hashed asset", path: "/assets/app-abc123.js", status: stdhttp.StatusOK, body: "app", cache: "public, max-age=31536000, immutable"},
		{name: "diagram icon", path: "/diagram-icons/flat/api.svg", status: stdhttp.StatusOK, body: "<svg></svg>", cache: "public, max-age=604800"},
		{name: "stable asset", path: "/paper-mark.svg", status: stdhttp.StatusOK, body: "<svg></svg>", cache: "no-cache"},
		{name: "missing hashed asset", path: "/assets/missing.js", status: stdhttp.StatusNotFound},
		{name: "unsupported method", path: "/", method: stdhttp.MethodPost, status: stdhttp.StatusMethodNotAllowed},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			method := test.method
			if method == "" {
				method = stdhttp.MethodGet
			}
			request := httptest.NewRequest(method, test.path, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != test.status {
				t.Fatalf("expected status %d, got %d", test.status, response.Code)
			}
			if test.body != "" && response.Body.String() != test.body {
				t.Fatalf("expected body %q, got %q", test.body, response.Body.String())
			}
			if test.cache != "" && response.Header().Get("Cache-Control") != test.cache {
				t.Fatalf("expected cache policy %q, got %q", test.cache, response.Header().Get("Cache-Control"))
			}
		})
	}
}

func TestEmbeddedFrontendFilesystemIsAvailable(t *testing.T) {
	if _, err := fs.Stat(embeddedFrontend(), ".keep"); err != nil {
		t.Fatal(err)
	}
}

func TestRouterDoesNotServeTheSPAForUnknownAPIRoutes(t *testing.T) {
	request := httptest.NewRequest(stdhttp.MethodGet, "/api/missing", nil)
	response := httptest.NewRecorder()
	NewRouter(nil, nil, nil, nil, AuthHTTPConfig{}, nil).ServeHTTP(response, request)
	if response.Code != stdhttp.StatusNotFound {
		t.Fatalf("expected status %d, got %d", stdhttp.StatusNotFound, response.Code)
	}
}
