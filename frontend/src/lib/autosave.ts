export type SaveState = "saved" | "pending" | "saving" | "error";
// In-memory only: this first PWA release does not promise offline persistence.
export class AutosaveQueue<T> {
  private pending = new Map<string, T>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Map<string, Promise<void>>();
  private failed = new Set<string>();
  constructor(
    private save: (id: string, value: T) => Promise<unknown>,
    private changed: (state: SaveState) => void,
    private delay = 420,
  ) {}
  get dirty() {
    return this.pending.size > 0 || this.running.size > 0;
  }
  private emit() {
    this.changed(
      this.failed.size
        ? "error"
        : this.running.size
          ? "saving"
          : this.pending.size
            ? "pending"
            : "saved",
    );
  }
  schedule(id: string, value: T) {
    this.pending.set(id, value);
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        void this.run(id).catch(() => {});
      }, this.delay),
    );
    this.emit();
  }
  private async run(id: string): Promise<void> {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const active = this.running.get(id);
    if (active) {
      await active;
      if (this.pending.has(id)) return this.run(id);
      return;
    }
    if (!this.pending.has(id)) return;
    const task = (async () => {
      // Start on a microtask so the running entry exists even if save throws synchronously.
      await Promise.resolve();
      try {
        while (this.pending.has(id)) {
          const value = this.pending.get(id)!;
          await this.save(id, value);
          if (this.pending.get(id) === value) this.pending.delete(id);
          this.failed.delete(id);
        }
      } catch (error) {
        if (this.pending.has(id)) this.failed.add(id);
        throw error;
      } finally {
        this.running.delete(id);
        this.emit();
      }
    })();
    this.running.set(id, task);
    this.emit();
    return task;
  }
  async flush() {
    const results = await Promise.allSettled(
      [...new Set([...this.pending.keys(), ...this.running.keys()])].map((id) =>
        this.run(id),
      ),
    );
    if (results.some((result) => result.status === "rejected") || this.dirty)
      throw new Error(
        "Some notes could not be saved. Keep this window open and retry.",
      );
  }
  discard(id: string) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.pending.delete(id);
    this.failed.delete(id);
    this.emit();
  }
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
