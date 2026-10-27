import { afterEach, expect, it, vi } from "vitest";
import { AutosaveQueue } from "./autosave";
afterEach(() => vi.useRealTimers());
it("keeps a failed draft and retries the latest content", async () => {
  vi.useFakeTimers();
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const changed = vi.fn();
  const queue = new AutosaveQueue(save, changed);
  queue.schedule("n1", "first");
  await vi.advanceTimersByTimeAsync(420);
  expect(queue.dirty).toBe(true);
  expect(changed).toHaveBeenLastCalledWith("error");
  queue.schedule("n1", "latest");
  await queue.flush();
  expect(save).toHaveBeenLastCalledWith("n1", "latest");
  expect(queue.dirty).toBe(false);
});
it("serializes overlapping edits so an old request cannot overwrite a newer draft", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(undefined);
  const queue = new AutosaveQueue(save, vi.fn());
  queue.schedule("n1", "first");
  await vi.advanceTimersByTimeAsync(420);
  queue.schedule("n1", "latest");
  await vi.advanceTimersByTimeAsync(420);
  expect(save).toHaveBeenCalledTimes(1);
  resolve();
  await queue.flush();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith("n1", "latest");
  expect(queue.dirty).toBe(false);
});
it("blocks navigation after failed flushing and discards deleted notes", async () => {
  const save = vi.fn().mockRejectedValue(new Error("offline"));
  const queue = new AutosaveQueue(save, vi.fn());
  queue.schedule("n1", "draft");
  await expect(queue.flush()).rejects.toThrow("Keep this window open");
  queue.discard("n1");
  await queue.flush();
  expect(queue.dirty).toBe(false);
});
