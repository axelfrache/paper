import { afterEach, expect, it, vi } from "vitest";
import {
  hasPendingChanges,
  prepareNavigation,
  registerDraftGuard,
  trackMutation,
} from "./pwa";
afterEach(() => vi.unstubAllGlobals());
it("flushes drafts before allowing navigation and propagates saving errors", async () => {
  let dirty = true;
  const flush = vi.fn(async () => {
    dirty = false;
  });
  const remove = registerDraftGuard(flush, () => dirty);
  expect(hasPendingChanges()).toBe(true);
  await prepareNavigation();
  expect(hasPendingChanges()).toBe(false);
  flush.mockRejectedValueOnce(new Error("offline"));
  await expect(prepareNavigation()).rejects.toThrow("offline");
  remove();
});
it("blocks updates during mutations and releases the guard on network failure", async () => {
  let reject!: (error: Error) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((_, fail) => {
          reject = fail;
        }),
    ),
  );
  const request = trackMutation("POST", () =>
    fetch("/api/notes", { method: "POST" }),
  );
  expect(hasPendingChanges()).toBe(true);
  await expect(prepareNavigation()).rejects.toThrow("wait");
  reject(new Error("offline"));
  await expect(request).rejects.toThrow("offline");
  expect(hasPendingChanges()).toBe(false);
});

it("keeps the mutation guard until response processing finishes", async () => {
  let finish!: () => void;
  const request = trackMutation("POST", async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { saved: true };
  });
  await Promise.resolve();
  expect(hasPendingChanges()).toBe(true);
  finish();
  await request;
  expect(hasPendingChanges()).toBe(false);
});
