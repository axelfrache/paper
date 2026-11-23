const draftGuards = new Set<{ flush: () => Promise<void>; dirty: () => boolean; priority: number }>();
let mutations = 0;
export function registerDraftGuard(
  flush: () => Promise<void>,
  dirty: () => boolean,
  priority = 0,
) {
  const guard = { flush, dirty, priority };
  draftGuards.add(guard);
  return () => { draftGuards.delete(guard); };
}
export function hasPendingChanges() {
  return mutations > 0 || [...draftGuards].some((guard) => guard.dirty());
}
export async function prepareNavigation() {
  for (const guard of [...draftGuards].sort((a, b) => b.priority - a.priority)) {
    await guard.flush();
  }
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
