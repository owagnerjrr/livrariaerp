import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { config } from "dotenv";
import { createDatabase, type Database } from "@caramelo/database";
import { seedOnlineDemo } from "../packages/database/prisma/demo-data.js";
import { buildApp } from "../apps/api/src/app.js";
config({ quiet: true });
const origin = "http://localhost:5274",
  name = `browser_${randomUUID().replaceAll("-", "")}_demo_test`,
  password = randomUUID() + "Demo!";
const requireWeb = createRequire(resolve("apps/web/package.json"));
let admin: pg.Client,
  db: Database,
  app: Awaited<ReturnType<typeof buildApp>>,
  vite: ViteDevServer;
test.use({ baseURL: origin });
test.beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    process.env.NODE_ENV === "production"
  )
    throw Error("Use banco de teste local separado.");
  url.pathname = "/postgres";
  admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const migration = spawnSync(
    process.execPath,
    ["../../node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: "packages/database",
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
    },
  );
  if (migration.status !== 0)
    throw Error("Migrations da fixture demo falharam.");
  db = createDatabase(url.toString());
  await seedOnlineDemo(db, {
    APP_ENV: "demo",
    NODE_ENV: "test",
    DATABASE_URL: url.toString(),
    DEMO_SEED_CONFIRM: name,
    DEMO_ADMIN_PASSWORD: password,
  });
  app = await buildApp({ db, origin, rateLimitMax: 1000 });
  await app.listen({ host: "127.0.0.1", port: 3434 });
  vite = await createServer({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [
      requireWeb("@vitejs/plugin-react").default(),
      requireWeb("@tailwindcss/vite").default(),
    ],
    server: {
      host: "127.0.0.1",
      port: 5274,
      strictPort: true,
      proxy: {
        "/api": { target: "http://127.0.0.1:3434", changeOrigin: false },
      },
    },
  });
  await vite.listen();
});
test.afterAll(async () => {
  await vite?.close();
  await app?.close();
  await db?.$disconnect();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
});
test("demo real: login, dashboard e todos os módulos sem erros", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("input[name=company]").fill("demo");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("demo@caramelo.example");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no Caramelo" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Administrador." }),
  ).toBeVisible();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400)
      errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  for (const [menu, title] of [
    ["Livros", "Livros"],
    ["Estoque", "Estoque da livraria"],
    ["PDV / Vendas", "PDV / Vendas"],
    ["Caixa", "Caixa"],
    ["Compras", "Compras"],
    ["Financeiro", "Contas a Pagar"],
    ["Transferências", "Transferências entre filiais"],
    ["Inventário / Balanço", "Inventários"],
    ["Feiras / Eventos", "Feiras / Eventos"],
  ]) {
    if (info.project.name === "mobile")
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page.getByRole("button", { name: menu, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (menu === "Financeiro")
      for (const tab of [
        "Contas a Receber",
        "Fluxo de Caixa",
        "Contas a Pagar",
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await expect(
          page.getByRole("heading", { name: tab, exact: true }),
        ).toBeVisible();
      }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
