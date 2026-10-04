import { spawnSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demoRoutes } from "./demo-routing.mjs";
const routes = demoRoutes(process.env.DEMO_API_ORIGIN);
const result = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "apps/web"],
  { stdio: "inherit" },
);
if (result.status !== 0)
  throw new Error("Build do frontend de demonstração falhou.");
const output = resolve(".vercel/output");
await mkdir(output, { recursive: true });
await cp(resolve("apps/web/dist"), resolve(output, "static"), {
  recursive: true,
});
await writeFile(
  resolve(output, "config.json"),
  JSON.stringify({ version: 3, routes }, null, 2),
);
console.log("Frontend estático e proxy remoto preparados para a Vercel.");
