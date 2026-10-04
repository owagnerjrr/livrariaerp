import { spawnSync } from "node:child_process";
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (process.env.NODE_ENV !== "production" || process.env.APP_ENV !== "demo")
  throw new Error(
    "Inicialização Render exige NODE_ENV=production e APP_ENV=demo.",
  );
if (![undefined, "false", "true"].includes(process.env.DEMO_SEED_ON_START))
  throw new Error("DEMO_SEED_ON_START deve ser true ou false.");
let database;
try {
  database = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error("DATABASE_URL remota obrigatória.");
}
if (
  !["postgresql:", "postgres:"].includes(database.protocol) ||
  ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(database.hostname)
)
  throw new Error("Inicialização Render exige PostgreSQL remoto.");
if (
  !process.env.DEMO_DATABASE_NAME ||
  decodeURIComponent(database.pathname.slice(1)) !==
    process.env.DEMO_DATABASE_NAME ||
  process.env.DEMO_SEED_CONFIRM !== process.env.DEMO_DATABASE_NAME
)
  throw new Error(
    "Banco demo deve corresponder a DEMO_DATABASE_NAME e DEMO_SEED_CONFIRM antes das migrations.",
  );
run("npm", ["run", "db:migrate"]);
if (process.env.DEMO_SEED_ON_START === "true")
  run(process.execPath, ["apps/api/dist/demo-seed.js"]);
await import("../apps/api/dist/server.js");
