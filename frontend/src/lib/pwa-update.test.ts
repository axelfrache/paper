import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateUpdate } from "./pwa-update";
let worker: ServiceWorker;
let container: ServiceWorkerContainer;
let reply: (data: unknown) => void;
let close: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  close = vi.fn();
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = {
        onmessage: null as null | ((event: { data: unknown }) => void),
        close,
      };
      port2 = { close };
      constructor() {
        reply = (data) => this.port1.onmessage?.({ data });
      }
    },
  );
  worker = Object.assign(new EventTarget(), {
    state: "installed",
    postMessage: vi.fn(),
  }) as unknown as ServiceWorker;
  container = Object.assign(new EventTarget(), {
    controller: null,
  }) as unknown as ServiceWorkerContainer;
  vi.stubGlobal("navigator", { serviceWorker: container });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function state(value: ServiceWorkerState) {
  Object.assign(worker, { state: value });
  worker.dispatchEvent(new Event("statechange"));
}
function claim() {
  Object.assign(container, { controller: worker });
  container.dispatchEvent(new Event("controllerchange"));
}
it("times out even after an acknowledgement", async () => {
  const result = activateUpdate(worker);
  const failure = expect(result).rejects.toThrow("taking too long");
  reply({ ok: true });
  await vi.advanceTimersByTimeAsync(15000);
  await failure;
  expect(close).toHaveBeenCalledTimes(2);
});
it("waits for activation to finish after the controller changes", async () => {
  let done = false;
  const result = activateUpdate(worker).then(() => {
    done = true;
  });
  reply({ ok: true });
  state("activating");
  claim();
  await Promise.resolve();
  expect(done).toBe(false);
  state("activated");
  await result;
  expect(done).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("handles an already activated controller when retrying", async () => {
  state("activated");
  claim();
  await activateUpdate(worker);
  expect(worker.postMessage).not.toHaveBeenCalled();
});
it("reports a replaced worker", async () => {
  const result = activateUpdate(worker);
  state("redundant");
  await expect(result).rejects.toThrow("no longer available");
});
it("preserves the refusal when other windows are open", async () => {
  const result = activateUpdate(worker);
  reply({ error: "Close other Paper windows before updating." });
  await expect(result).rejects.toThrow("Close other Paper windows");
  expect(vi.getTimerCount()).toBe(0);
});
