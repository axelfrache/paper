let flushDrafts: (() => Promise<void>) | undefined;
let dirtyDrafts: (() => boolean) | undefined;
let mutations = 0;
export function registerDraftGuard(
  flush: () => Promise<void>,
  dirty: () => boolean,
) {
  flushDrafts = flush;
  dirtyDrafts = dirty;
  return () => {
    if (flushDrafts === flush) {
      flushDrafts = undefined;
      dirtyDrafts = undefined;
    }
  };
}
export function hasPendingChanges() {
  return mutations > 0 || Boolean(dirtyDrafts?.());
}
export async function prepareNavigation() {
  await flushDrafts?.();
  if (hasPendingChanges())
    throw new Error("Please wait for your changes to finish saving.");
}
export async function trackMutation<T>(
  method: string | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const mutation = !["GET", "HEAD"].includes(method?.toUpperCase() ?? "GET");
  if (mutation) mutations++;
  try {
    return await action();
  } finally {
    if (mutation) mutations--;
  }
}
export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}
