declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Some Node/jsdom combinations expose no usable localStorage (and warn when it
// is read), so tests always use an in-memory one.
{
  const values = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memory,
    configurable: true,
  });
}

export {};
