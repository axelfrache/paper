import { useState } from "react";
import { Download } from "lucide-react";
import { usePwa } from "./PwaProvider";
export function InstallPaper() {
  const { installed, install } = usePwa();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  const appleMobile =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <div className="pwa-install">
      <button
        type="button"
        onClick={() => {
          if (install) void install().catch(() => setHelp(true));
          else setHelp((value) => !value);
        }}
      >
        <Download size={14} />
        Install Paper
      </button>
      {help ? (
        <p>
          {appleMobile
            ? "Open Paper in Safari, use Share, then Add to Home Screen."
            : "Use your browser’s menu to install Paper or add it to your Dock. If that option is unavailable, use a browser that supports web app installation."}
        </p>
      ) : null}
    </div>
  );
}
