import { KeyRound, Moon, Sun } from "lucide-react";
import type { AuthConfig } from "../types/auth";

type LoginPageProps = {
  config: AuthConfig;
  theme: "light" | "dark";
  error: boolean;
  onToggleTheme: () => void;
};

export function LoginPage({ config, theme, error, onToggleTheme }: LoginPageProps) {
  const isDev = config.provider === "dev";

  return (
    <div className="login-page">
      <header className="login-header">
        <img src={theme === "dark" ? "/paper-lockup-dark.svg" : "/paper-lockup.svg"} alt="Paper" />
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      <main className="login-main">
        <section className="login-panel">
          <div className="login-copy">
            <h1>Welcome back</h1>
            <p>Sign in to open your notes.</p>
          </div>

          <div className="login-card">
            <a className="login-primary" href="/api/auth/login">
              <KeyRound size={16} strokeWidth={1.8} />
              {isDev ? "Continue locally" : "Continue with passkey"}
            </a>
            <p>{isDev ? "Local development identity" : "Use your device or security key"}</p>
          </div>

          {error ? <div className="login-error">Authentication could not be completed. Try again.</div> : null}

          {!isDev && config.registrationEnabled ? (
            <div className="login-switch">
              <span>New to Paper?</span>
              <a href="/api/auth/login?mode=register">Create an account</a>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
