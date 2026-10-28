export function activateUpdate(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const container = navigator.serviceWorker;
    const channel = new MessageChannel();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      container.removeEventListener("controllerchange", check);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (worker.state === "redundant") {
        finish(
          new Error(
            "This update is no longer available. Reload Paper to try again.",
          ),
        );
      } else if (
        worker.state === "activated" &&
        container.controller === worker
      ) {
        finish();
      }
    };
    const timer = setTimeout(() => {
      finish(new Error("The update is taking too long. Please try again."));
    }, 15000);
    worker.addEventListener("statechange", check);
    container.addEventListener("controllerchange", check);
    channel.port1.onmessage = (event) => {
      if (event.data?.error) finish(new Error(event.data.error));
      else check();
    };
    try {
      if (worker.state === "installed") {
        worker.postMessage({ type: "APPLY_UPDATE" }, [channel.port2]);
      }
      check();
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("Could not update Paper."),
      );
    }
  });
}
