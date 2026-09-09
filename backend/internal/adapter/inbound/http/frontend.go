package http

import (
	"embed"
	"io/fs"
	stdhttp "net/http"
	"path"
	"strings"
)

//go:embed all:web/dist
var frontendFiles embed.FS

func embeddedFrontend() fs.FS {
	assets, err := fs.Sub(frontendFiles, "web/dist")
	if err != nil {
		panic(err)
	}
	return assets
}

func newSPAHandler(assets fs.FS) stdhttp.Handler {
	files := stdhttp.FileServer(stdhttp.FS(assets))
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if r.Method != stdhttp.MethodGet && r.Method != stdhttp.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			stdhttp.Error(w, "Method not allowed", stdhttp.StatusMethodNotAllowed)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "." && name != "index.html" {
			if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
				setAssetCache(w, name)
				files.ServeHTTP(w, r)
				return
			}
		}

		if strings.HasPrefix(name, "assets/") || strings.HasPrefix(name, "diagram-icons/") {
			stdhttp.NotFound(w, r)
			return
		}
		if info, err := fs.Stat(assets, "index.html"); err != nil || info.IsDir() {
			stdhttp.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-cache")
		request := r.Clone(r.Context())
		url := *r.URL
		url.Path = "/"
		request.URL = &url
		files.ServeHTTP(w, request)
	})
}

func setAssetCache(w stdhttp.ResponseWriter, name string) {
	switch {
	case strings.HasPrefix(name, "assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	case strings.HasPrefix(name, "diagram-icons/"):
		w.Header().Set("Cache-Control", "public, max-age=604800")
	default:
		w.Header().Set("Cache-Control", "no-cache")
	}
}
