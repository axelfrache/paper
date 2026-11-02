import { afterEach, expect, it, vi } from "vitest";
import { APIError, listNotes, registerUnauthorizedHandler } from "./api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

it("notifies the unauthorized handler when a request comes back 401", async () => {
  stubFetch(401, { error: "session expired" });
  const onUnauthorized = vi.fn();
  const remove = registerUnauthorizedHandler(onUnauthorized);

  await expect(listNotes()).rejects.toThrow(APIError);
  expect(onUnauthorized).toHaveBeenCalledOnce();

  remove();
});

it("does not notify the unauthorized handler for other error statuses", async () => {
  stubFetch(500, { error: "boom" });
  const onUnauthorized = vi.fn();
  const remove = registerUnauthorizedHandler(onUnauthorized);

  await expect(listNotes()).rejects.toThrow(APIError);
  expect(onUnauthorized).not.toHaveBeenCalled();

  remove();
});

it("stops notifying once the handler has been unregistered", async () => {
  stubFetch(401);
  const onUnauthorized = vi.fn();
  const remove = registerUnauthorizedHandler(onUnauthorized);
  remove();

  await expect(listNotes()).rejects.toThrow(APIError);
  expect(onUnauthorized).not.toHaveBeenCalled();
});
