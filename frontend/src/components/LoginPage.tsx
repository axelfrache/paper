import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Moon, Sun } from "lucide-react";
import { APIError, loginWithPassword, registerWithPassword } from "../lib/api";
import type { AuthConfig } from "../types/auth";

type LoginPageProps = {
  config: AuthConfig;
  theme: "light" | "dark";
  error: boolean;
  returnTo?: string;
  onToggleTheme: () => void;
};

export function LoginPage({
  config,
  theme,
  error,
  returnTo,
  onToggleTheme,
}: LoginPageProps) {
  const isDev = config.provider === "dev";
  const isLocal = config.provider === "local";
  const returnToParam = returnTo ? `returnTo=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="login-page">
      <header className="login-header">
        <img
          src={
            theme === "dark" ? "/paper-lockup-dark.svg" : "/paper-lockup.svg"
          }
          alt="Paper"
        />
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      <main className="login-main">
        {isLocal ? (
          <LocalLogin registrationEnabled={config.registrationEnabled} returnTo={returnTo} />
        ) : (
          <section className="login-panel">
            <div className="login-copy">
              <h1>Welcome back</h1>
              <p>Sign in to open your notes.</p>
            </div>

            <div className="login-card">
              <a className="login-primary" href={`/api/auth/login${returnToParam ? `?${returnToParam}` : ""}`}>
                <KeyRound size={16} strokeWidth={1.8} />
                {isDev ? "Continue locally" : "Continue with passkey"}
              </a>
              <p>{isDev ? "Local development identity" : "Use your device or security key"}</p>
            </div>

            {error ? <div className="login-error">Authentication could not be completed. Try again.</div> : null}

            {!isDev && config.registrationEnabled ? (
              <div className="login-switch">
                <span>New to Paper?</span>
                <a href={`/api/auth/login?mode=register${returnToParam ? `&${returnToParam}` : ""}`}>Create an account</a>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}

function LocalLogin({ registrationEnabled, returnTo }: { registrationEnabled: boolean; returnTo?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const registering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = registering
        ? await registerWithPassword(email, name, password, returnTo)
        : await loginWithPassword(email, password, returnTo);
      window.location.assign(result.redirectTo || "/");
    } catch (caught) {
      setFormError(
        caught instanceof APIError
          ? caught.message
          : "Something went wrong. Try again.",
      );
      setSubmitting(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setFormError(null);
    setPassword("");
  };

  return (
    <section className="login-panel">
      <div className="login-copy">
        <h1>{registering ? "Create your account" : "Welcome back"}</h1>
        <p>
          {registering
            ? "Set up your Paper account."
            : "Sign in to open your notes."}
        </p>
      </div>

      <form className="login-card login-form" onSubmit={handleSubmit}>
        {registering ? (
          <label className="login-field">
            <span>Name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
            />
          </label>
        ) : null}
        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            required
            autoComplete={registering ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>

        {formError ? <div className="login-error">{formError}</div> : null}

        <button type="submit" className="login-primary" disabled={submitting}>
          <KeyRound size={16} strokeWidth={1.8} />
          {registering
            ? submitting
              ? "Creating account"
              : "Create account"
            : submitting
              ? "Signing in"
              : "Sign in"}
        </button>
      </form>

      {registrationEnabled ? (
        <div className="login-switch">
          {registering ? (
            <>
              <span>Already have an account?</span>
              <button type="button" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              <span>New to Paper?</span>
              <button type="button" onClick={() => switchMode("register")}>
                Create an account
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
