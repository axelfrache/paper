import { useEffect, useState } from "react";
import { LoginPage } from "./components/LoginPage";
import { APIError, getAuthConfig, getCurrentUser, logout } from "./lib/api";
import { NotesPage } from "./pages/NotesPage";
import { SharedNotePage } from "./pages/SharedNotePage";
import type { AuthConfig, AuthUser } from "./types/auth";

const sharedNoteMatch = /^\/shared\/([^/]+)$/.exec(window.location.pathname);

export default function App() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => initialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("paper.theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const load = async () => {
      try {
        const authConfig = await getAuthConfig();
        setConfig(authConfig);
        try {
          setUser(await getCurrentUser());
        } catch (error) {
          if (!(error instanceof APIError) || error.status !== 401) {
            throw error;
          }
        }
      } catch (error) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return <div className="auth-loading" aria-label="Loading" />;
  }

  if (loadError || !config) {
    return (
      <div className="auth-unavailable">
        <strong>Paper is unavailable</strong>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        config={config}
        theme={theme}
        error={new URLSearchParams(window.location.search).has("authError")}
        returnTo={sharedNoteMatch ? window.location.pathname : undefined}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    );
  }

  const handleLogout = async () => {
    const result = await logout();
    window.location.assign(result.redirectTo || "/");
  };

  if (sharedNoteMatch) {
    return (
      <SharedNotePage
        token={sharedNoteMatch[1]}
        theme={theme}
        user={user}
        onLogout={handleLogout}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    );
  }

  return <NotesPage user={user} aiEnabled={config.aiEnabled} onLogout={handleLogout} />;
}

function initialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("paper.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    return "light";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
