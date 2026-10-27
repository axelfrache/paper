import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PwaProvider } from "./PwaProvider";
import { InstallPaper } from "./InstallPaper";
import { registerDraftGuard } from "../lib/pwa";
let root: Root;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <PwaProvider>
        <InstallPaper />
      </PwaProvider>,
    ),
  );
  return host;
}
it("offers manual installation instructions without a native install prompt", () => {
  const host = mount();
  act(() => host.querySelector("button")!.click());
  expect(host.textContent).toContain("browser’s menu");
});
it("uses the native prompt and hides installation after acceptance", async () => {
  const host = mount();
  const prompt = vi.fn().mockResolvedValue({ outcome: "accepted" });
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await act(async () => host.querySelector("button")!.click());
  expect(prompt).toHaveBeenCalledOnce();
  expect(host.querySelector(".pwa-install")).toBeNull();
});
it("warns before closing a window with unsaved drafts", () => {
  mount();
  const remove = registerDraftGuard(
    async () => {},
    () => true,
  );
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  remove();
});
