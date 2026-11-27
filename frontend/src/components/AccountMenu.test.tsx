import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

const deleteAccount = vi.fn(() => new Promise<void>(() => {}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  deleteAccount: () => deleteAccount(),
}));

const { AccountMenu } = await import("./AccountMenu");

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AccountMenu danger zone", () => {
  it("deletes the account only after the email is typed", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        <AccountMenu
          user={{
            id: "u1",
            email: "ada@example.com",
            name: "Ada",
            roles: [],
            isAdmin: false,
            avatarUrl: null,
          }}
          onLogout={async () => {}}
        />,
      ),
    );

    act(() => button(host, "Delete account").click());
    const confirm = button(host, "Delete permanently");
    const input = host.querySelector<HTMLInputElement>(
      ".account-danger input",
    )!;
    expect(confirm.disabled).toBe(true);

    type(input, "wrong@example.com");
    expect(confirm.disabled).toBe(true);

    type(input, "ada@example.com");
    expect(confirm.disabled).toBe(false);
    act(() => confirm.click());
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });
});
