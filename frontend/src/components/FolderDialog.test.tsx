import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FolderDialog, type FolderDialogState } from "./FolderDialog";
import type { Folder } from "../types/note";
let root: Root;
const folder: Folder = {
  id: "f1",
  name: "Homelab",
  color: "blue",
  createdAt: "",
  updatedAt: "",
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});
function mount(state: FolderDialogState) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props = {
    state,
    folders: [folder],
    onSave: vi.fn().mockResolvedValue(folder),
    onMove: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };
  act(() => root.render(<FolderDialog {...props} />));
  return { host, ...props };
}
async function click(button: Element | null) {
  expect(button).not.toBeNull();
  await act(async () => {
    (button as HTMLElement).click();
  });
}
it("moves the entire selection to an existing folder", async () => {
  const p = mount({ kind: "move", ids: ["a", "b"] });
  await click(p.host.querySelectorAll(".folder-picker-list button")[1]);
  expect(p.onMove).toHaveBeenCalledWith(["a", "b"], "f1");
  expect(p.onClose).toHaveBeenCalledOnce();
});
it("requires confirmation before removing a folder", async () => {
  const p = mount({ kind: "edit", folder });
  await click(p.host.querySelector(".folder-delete-link"));
  expect(p.onDelete).not.toHaveBeenCalled();
  expect(p.host.textContent).toContain("notes will be kept");
  await click(p.host.querySelector(".folder-danger"));
  expect(p.onDelete).toHaveBeenCalledWith(folder);
});
it("keeps the picker open and reports a failed move", async () => {
  const p = mount({ kind: "move", ids: ["a"] });
  p.onMove.mockRejectedValueOnce(new Error("Folder unavailable"));
  await click(p.host.querySelectorAll(".folder-picker-list button")[1]);
  expect(p.onClose).not.toHaveBeenCalled();
  expect(p.host.querySelector('[role="alert"]')?.textContent).toBe(
    "Folder unavailable",
  );
});
it("reuses a newly created folder when retrying a failed move", async () => {
  const p = mount({ kind: "move", ids: ["a"] });
  p.onMove.mockRejectedValueOnce(new Error("Try again"));
  await click(p.host.querySelector(".folder-create-option"));
  const input = p.host.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Homelab");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    p.host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(p.onClose).not.toHaveBeenCalled();
  await act(async () => {
    p.host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(p.onSave).toHaveBeenLastCalledWith(
    { name: "Homelab", color: "blue" },
    "f1",
  );
  expect(p.onClose).toHaveBeenCalledOnce();
});
it("opens directly on confirmation from the folder context menu", () => {
  const p = mount({ kind: "edit", folder, confirmDelete: true });
  expect(p.host.querySelector("h2")?.textContent).toBe("Delete folder?");
  expect(p.host.textContent).toContain("notes will be kept");
  expect(p.onDelete).not.toHaveBeenCalled();
});
