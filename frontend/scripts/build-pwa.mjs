import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
const dist = new URL("../dist/", import.meta.url);
const files = (await readdir(dist, { recursive: true }))
  .filter(
    (name) =>
      name === "index.html" ||
      name === "manifest.webmanifest" ||
      /^(assets|fonts)\/.*\.(js|css|woff2?)$/.test(name) ||
      /^(paper-.*\.svg|pwa-.*\.png|apple-touch-icon\.png)$/.test(name),
  )
  .sort();
const template = await readFile(
  new URL("./service-worker.js", import.meta.url),
  "utf8",
);
const hash = createHash("sha256").update(template);
for (const name of files)
  hash.update(name).update(await readFile(new URL(name, dist)));
const version = hash.digest("hex").slice(0, 20);
await writeFile(
  new URL("sw.js", dist),
  template
    .replace("__VERSION__", JSON.stringify(version))
    .replace("__ASSETS__", JSON.stringify(files.map((name) => "/" + name))),
);
console.log(`PWA shell ${version}: ${files.length} public resources`);
