import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hasPendingChanges, prepareNavigation } from "../lib/pwa";
type InstallEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};
const Context = createContext<{
  installed: boolean;
  install: (() => Promise<void>) | null;
}>({ installed: false, install: null });
export const usePwa = () => useContext(Context);
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const reloading = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () =>
      setInstalled(
        media.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    checkInstalled();
    media.addEventListener("change", checkInstalled);
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const finishInstall = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPendingChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", finishInstall);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      media.removeEventListener("change", checkInstalled);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", finishInstall);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (!disposed && registration?.waiting) setWaiting(registration.waiting);
    };
    const found = () =>
      registration?.installing?.addEventListener("statechange", check);
    const refresh = () => {
      if (document.visibilityState === "visible")
        void registration?.update().catch(() => {});
    };
    const controllerChanged = () => {
      if (reloading.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    document.addEventListener("visibilitychange", refresh);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => {
        if (disposed) return;
        registration = value;
        check();
        value.addEventListener("updatefound", found);
        found();
      })
      .catch(() => {
        /* The online app remains usable if shell caching is unavailable. */
      });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", found);
      document.removeEventListener("visibilitychange", refresh);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
    };
  }, []);
  const update = async () => {
    if (!waiting) return;
    setUpdating(true);
    setError("");
    try {
      // Commit the focused input before flushing; keep the page inert until activation.
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await prepareNavigation();
      if (document.querySelector("dialog[open], .diagram-editor"))
        throw new Error("Finish editing and close the dialog before updating.");
      reloading.current = true;
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
          channel.port1.close();
          reject(new Error("Update unavailable. Please try again."));
        }, 10000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          event.data.ok ? resolve() : reject(new Error(event.data.error));
        };
        waiting.postMessage({ type: "APPLY_UPDATE" }, [channel.port2]);
      });
    } catch (caught) {
      reloading.current = false;
      setUpdating(false);
      setError(
        caught instanceof Error ? caught.message : "Could not update Paper.",
      );
    }
  };
  return (
    <Context.Provider
      value={{
        installed,
        install: prompt
          ? async () => {
              const result = await prompt.prompt();
              setPrompt(null);
              if (result.outcome === "accepted") setInstalled(true);
            }
          : null,
      }}
    >
      <div className="pwa-app" inert={updating}>
        {children}
      </div>
      {waiting ? (
        <div className="pwa-update" role="status">
          <span>{error || "A new version of Paper is available."}</span>
          <button disabled={updating} onClick={() => void update()}>
            {updating ? "Updating…" : "Update"}
          </button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
