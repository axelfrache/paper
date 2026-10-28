import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FolderNav } from "./FolderNav";
const folder = {
  id: "f1",
  name: "Homelab",
  color: "blue",
  createdAt: "",
  updatedAt: "",
};
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props = {
    folders: [folder],
    notes: [],
    selected: undefined,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDrop: vi.fn(),
  };
  act(() => root.render(<FolderNav {...props} />));
  return {
    ...props,
    host,
    row: host.querySelector<HTMLButtonElement>(".nav-item")!,
  };
}
it("replaces the options button with edit and delete actions on right click", () => {
  const p = mount();
  expect(p.host.querySelector(".folder-options")).toBeNull();
  act(() =>
    p.row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }),
    ),
  );
  expect(p.onSelect).not.toHaveBeenCalled();
  const actions =
    document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(actions).toHaveLength(3);
  act(() => actions[0].click());
  expect(p.onEdit).toHaveBeenCalledWith(folder);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  act(() =>
    p.row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    ),
  );
  act(() =>
    document
      .querySelector<HTMLButtonElement>('[role="menuitem"].danger')!
      .click(),
  );
  expect(p.onDelete).toHaveBeenCalledWith(folder);
});
it("opens from the keyboard and restores focus on Escape", () => {
  const p = mount();
  act(() =>
    p.row.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(document.activeElement).toBe(menu.querySelector("button"));
  act(() =>
    menu.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(p.row);
});

it("opens folder actions by tapping without changing the selected folder", () => {
  const p = mount();
  act(() => p.host.querySelector<HTMLButtonElement>(".row-actions")!.click());
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(p.onSelect).not.toHaveBeenCalled();
});
