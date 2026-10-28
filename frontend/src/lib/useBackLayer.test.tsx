import { StrictMode, act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useBackLayer } from "./useBackLayer";

it("closes only the top layer on Back, including under Strict Mode", async () => {
  function Nested() {
    const [open, setOpen] = useState(false);
    useBackLayer(open, () => setOpen(false));
    return (
      <>
        <button onClick={() => setOpen(true)}>Open menu</button>
        {open ? <span>Menu</span> : null}
      </>
    );
  }
  function Screen() {
    const [open, setOpen] = useState(true);
    useBackLayer(open, () => setOpen(false));
    return open ? (
      <>
        <span>Editor</span>
        <Nested />
      </>
    ) : (
      <span>List</span>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Screen />
        </StrictMode>,
      ),
    );
    expect(window.history.state.paperLayers).toHaveLength(1);
    await act(async () => host.querySelector("button")!.click());
    expect(window.history.state.paperLayers).toHaveLength(2);
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.textContent).not.toContain("Menu");
    expect(host.textContent).toContain("Editor");
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.textContent).toBe("List");
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    host.remove();
  }
});

it("keeps a busy dialog open until its operation finishes", async () => {
  function Dialog() {
    const [busy, setBusy] = useState(true);
    const [open, setOpen] = useState(true);
    useBackLayer(open, () => (busy ? false : setOpen(false)));
    return open ? (
      <button onClick={() => setBusy(false)}>Saving</button>
    ) : (
      <span>Closed</span>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Dialog />));
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.textContent).toBe("Saving");
    await act(async () => host.querySelector("button")!.click());
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.textContent).toBe("Closed");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
