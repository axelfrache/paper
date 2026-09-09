import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { LoginPage } from "./LoginPage";
import type { AuthConfig } from "../types/auth";
import type { Root } from "react-dom/client";

let root: Root | null = null;

function mount(config: AuthConfig) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <LoginPage
        config={config}
        theme="light"
        error={false}
        onToggleTheme={() => {}}
      />,
    );
  });
  return host;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.replaceChildren();
});

describe("LoginPage", () => {
  it("shows a credential form for the local provider", () => {
    const host = mount({ provider: "local", registrationEnabled: true });
    expect(host.querySelector("input[type='email']")).not.toBeNull();
    expect(host.querySelector("input[type='password']")).not.toBeNull();
    expect(host.querySelector("input[type='text']")).toBeNull();
  });

  it("switches to the registration form and reveals the name field", () => {
    const host = mount({ provider: "local", registrationEnabled: true });
    const toggle = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".login-switch button"),
    ).find((button) => /create an account/i.test(button.textContent ?? ""));
    expect(toggle).toBeDefined();
    act(() => {
      toggle?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(host.querySelector("input[type='text']")).not.toBeNull();
  });

  it("hides the registration switch when registration is disabled", () => {
    const host = mount({ provider: "local", registrationEnabled: false });
    expect(host.querySelector(".login-switch")).toBeNull();
  });

  it("renders a redirect link instead of a form for the oidc provider", () => {
    const host = mount({ provider: "oidc", registrationEnabled: true });
    expect(host.querySelector("input[type='password']")).toBeNull();
    expect(
      host.querySelector("a.login-primary[href='/api/auth/login']"),
    ).not.toBeNull();
  });
});
