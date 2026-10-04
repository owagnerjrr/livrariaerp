import { it, expect } from "vitest";
import { validateDemoSeed } from "../packages/database/prisma/demo-data.js";
import { demoRoutes } from "../scripts/demo-routing.mjs";
const valid = {
  APP_ENV: "demo",
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://fixture:fake@postgres.demo.example/livrariaerp_demo",
  DEMO_SEED_CONFIRM: "livrariaerp_demo",
  DEMO_ADMIN_PASSWORD: "Senha-ficticia-demo-123",
};
it("seed remoto exige ambiente e confirmação do banco exclusivo", () => {
  expect(validateDemoSeed(valid)).toBe(valid.DEMO_ADMIN_PASSWORD);
  for (const changes of [
    { APP_ENV: "production" },
    { DEMO_SEED_CONFIRM: "outro" },
    {
      DATABASE_URL:
        "postgresql://fixture:fake@postgres.demo.example/production",
    },
    { DATABASE_URL: "postgresql://fixture:fake@127.0.0.1/livrariaerp_demo" },
    { DEMO_ADMIN_PASSWORD: "curta" },
  ])
    expect(() => validateDemoSeed({ ...valid, ...changes })).toThrow();
});
it("seed permite somente banco de teste próprio quando NODE_ENV=test", () => {
  expect(
    validateDemoSeed({
      ...valid,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://fixture:fake@127.0.0.1/livrariaerp_demo_test",
      DEMO_SEED_CONFIRM: "livrariaerp_demo_test",
    }),
  ).toBe(valid.DEMO_ADMIN_PASSWORD);
  expect(() =>
    validateDemoSeed({
      ...valid,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://fixture:fake@127.0.0.1/livrariaerp_demo_test",
      DEMO_SEED_CONFIRM: "livrariaerp_demo_test",
    }),
  ).toThrow();
});
it("proxy mantém API antes do fallback SPA e sem cache", () => {
  const routes = demoRoutes("https://api.demo.example");
  expect(routes[0]).toEqual({
    src: "^/api(?:/(.*))?$",
    dest: "https://api.demo.example/api/$1",
    headers: { "Cache-Control": "no-store" },
  });
  expect(routes[1]).toEqual({ handle: "filesystem" });
  expect(routes[2]).toEqual({ src: "/.*", dest: "/index.html" });
});
it("proxy rejeita ausência, HTTP, localhost e credenciais", () => {
  for (const value of [
    undefined,
    "http://api.demo.example",
    "https://localhost",
    "https://api-demo.example.invalid",
    "https://user:secret@api.demo.example",
    "https://api.demo.example/api",
    "https://api.demo.example?token=x",
  ])
    expect(() => demoRoutes(value)).toThrow();
});

it("seed aceita banco Render explicitamente declarado e confirmado", () => {
  const render = {
    ...valid,
    DATABASE_URL:
      "postgresql://fixture:fake@postgres.demo.example/caramelo_erp",
    DEMO_DATABASE_NAME: "caramelo_erp",
    DEMO_SEED_CONFIRM: "caramelo_erp",
  };
  expect(validateDemoSeed(render)).toBe(valid.DEMO_ADMIN_PASSWORD);
  expect(() =>
    validateDemoSeed({ ...render, DEMO_DATABASE_NAME: undefined }),
  ).toThrow();
  expect(() =>
    validateDemoSeed({ ...render, DEMO_SEED_CONFIRM: "outro" }),
  ).toThrow();
  expect(() =>
    validateDemoSeed({ ...render, APP_ENV: "production" }),
  ).toThrow();
});

import { spawnSync } from "node:child_process";
it("produção aceita PORT Render e recusa banco local/origem inválida", () => {
  const environment = {
    ...process.env,
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "10000",
    DATABASE_URL: valid.DATABASE_URL,
    WEB_ORIGIN: "https://demo.example",
  };
  const run = (changes: Record<string, string | undefined>) =>
    spawnSync(process.execPath, ["apps/api/src/config.ts"], {
      env: { ...environment, ...changes },
      encoding: "utf8",
    });
  expect(run({}).status).toBe(0);
  for (const changes of [
    { PORT: undefined },
    { DATABASE_URL: "postgresql://fixture:fake@localhost/caramelo_erp" },
    { WEB_ORIGIN: "https://demo.example/path" },
    { WEB_ORIGIN: "http://demo.example" },
  ])
    expect(run(changes).status).not.toBe(0);
});

it("entrypoint recusa PostgreSQL local antes de executar migrations", () => {
  const result = spawnSync(process.execPath, ["scripts/render-start.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_ENV: "demo",
      DEMO_SEED_ON_START: "false",
      DATABASE_URL:
        "postgresql://fixture:secret-sentinel@127.0.0.1/caramelo_erp",
    },
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "Inicialização Render exige PostgreSQL remoto.",
  );
  expect(result.stdout).not.toContain("prisma migrate");
  expect(result.stderr).not.toContain("secret-sentinel");
});

it("entrypoint recusa banco remoto diferente antes das migrations", () => {
  const result = spawnSync(process.execPath, ["scripts/render-start.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_ENV: "demo",
      DEMO_SEED_ON_START: "false",
      DATABASE_URL:
        "postgresql://fixture:secret-sentinel@postgres.demo.example/outro",
      DEMO_DATABASE_NAME: "caramelo_erp",
      DEMO_SEED_CONFIRM: "caramelo_erp",
    },
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Banco demo deve corresponder");
  expect(result.stdout).not.toContain("prisma migrate");
  expect(result.stderr).not.toContain("secret-sentinel");
});

import { buildApp } from "../apps/api/src/app.js";
import type { Database } from "../packages/database/src/index.js";
it("healthcheck confirma disponibilidade e falha quando o banco falha", async () => {
  let failure = false;
  let calls = 0;
  const db = {
    $queryRaw: async () => {
      calls++;
      if (failure) throw new Error("Database unavailable");
      return [{ value: 1 }];
    },
  } as unknown as Database;
  const app = await buildApp({
    db,
    origin: "https://demo.example",
    production: true,
  });
  try {
    const healthy = await app.inject({ method: "GET", url: "/api/health" });
    expect(healthy.statusCode).toBe(200);
    expect(healthy.json()).toEqual({ status: "ok" });
    failure = true;
    expect(
      (await app.inject({ method: "GET", url: "/api/health" })).statusCode,
    ).toBe(500);
    expect(calls).toBe(2);
  } finally {
    await app.close();
  }
});
