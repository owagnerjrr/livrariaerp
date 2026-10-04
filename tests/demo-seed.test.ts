import { beforeAll, afterAll, it, expect } from "vitest";
import { config } from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createDatabase, type Database } from "@caramelo/database";
import {
  seedOnlineDemo,
  demoIdentity,
} from "../packages/database/prisma/demo-data.js";
import { buildApp } from "../apps/api/src/app.js";
import { verifyPassword } from "../apps/api/src/security.js";
config({ quiet: true });
const name = `verify_${randomUUID().replaceAll("-", "")}_demo_test`;
let admin: pg.Client, db: Database, environment: NodeJS.ProcessEnv;
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    process.env.NODE_ENV === "production"
  )
    throw Error("Use somente PostgreSQL de teste local separado.");
  url.pathname = "/postgres";
  admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  environment = {
    APP_ENV: "demo",
    NODE_ENV: "test",
    DATABASE_URL: url.toString(),
    DEMO_SEED_CONFIRM: name,
    DEMO_ADMIN_PASSWORD: randomUUID() + "Demo!",
  };
  const result = spawnSync(
    process.execPath,
    ["../../node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: "packages/database",
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw Error("Migrations do banco de verificação demo falharam.");
  db = createDatabase(url.toString());
});
afterAll(async () => {
  await db?.$disconnect();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
});
it("falha ao finalizar seed faz rollback de todos os dados demo", async () => {
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_demo_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DEMO_SEEDED' THEN RAISE EXCEPTION 'Falha controlada do teste demo'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_demo_marker BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_demo_marker()`,
  );
  try {
    await expect(seedOnlineDemo(db, environment)).rejects.toThrow();
    expect(await db.company.count()).toBe(0);
    expect(await db.stockMovement.count()).toBe(0);
    expect(await db.sale.count()).toBe(0);
    expect(await db.financialEntry.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_demo_marker ON "AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION reject_demo_marker()`);
  }
});
it("seed cria demo consistente por serviços de estoque e venda", async () => {
  expect((await seedOnlineDemo(db, environment)).created).toBe(true);
  expect(await db.company.count()).toBe(1);
  expect(await db.branch.count()).toBe(2);
  expect(await db.product.count()).toBe(6);
  expect(await db.supplier.count()).toBe(2);
  expect(await db.sale.count()).toBe(2);
  expect(await db.stockMovement.count()).toBe(14);
  expect(
    String(
      (await db.stockBalance.aggregate({ _sum: { quantity: true } }))._sum
        .quantity,
    ),
  ).toBe("238");
  expect(await db.financialEntry.count({ where: { type: "PAYABLE" } })).toBe(1);
  expect(
    await db.financialEntry.count({
      where: { type: "RECEIVABLE", status: "OPEN" },
    }),
  ).toBe(2);
  expect(await db.auditLog.count({ where: { action: "DEMO_SEEDED" } })).toBe(1);
});
it("retry preserva estoque, vendas, lançamentos e senha", async () => {
  expect(
    (
      await seedOnlineDemo(db, {
        ...environment,
        DEMO_ADMIN_PASSWORD: "Outra-senha-ficticia-123",
      })
    ).created,
  ).toBe(false);
  expect(await db.sale.count()).toBe(2);
  expect(await db.stockMovement.count()).toBe(14);
  const user = await db.user.findUniqueOrThrow({
    where: { email: demoIdentity.email },
  });
  expect(
    await verifyPassword(environment.DEMO_ADMIN_PASSWORD!, user.passwordHash),
  ).toBe(true);
  expect(
    await verifyPassword("Outra-senha-ficticia-123", user.passwordHash),
  ).toBe(false);
});
it("recusa banco com outra empresa sem apagar ou alterar registros", async () => {
  const other = await db.company.create({
    data: { slug: "empresa-protegida", name: "Empresa protegida" },
  });
  try {
    await expect(seedOnlineDemo(db, environment)).rejects.toThrow(
      "outra empresa",
    );
    expect(await db.company.count()).toBe(2);
    expect(await db.sale.count()).toBe(2);
  } finally {
    await db.company.delete({ where: { id: other.id } });
  }
});
it("login demo HTTPS usa cookie seguro e preserva proteção de origem", async () => {
  const origin = "https://frontend.demo.example";
  const app = await buildApp({ db, origin, production: true });
  try {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: {
        company: "demo",
        email: demoIdentity.email,
        password: environment.DEMO_ADMIN_PASSWORD,
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(String(r.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(r.headers["set-cookie"])).toContain("Secure");
    expect(String(r.headers["set-cookie"])).toContain("SameSite=Lax");
    const cookie = String(r.headers["set-cookie"]).split(";")[0]!;
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    for (const permission of [
      "inventory:read",
      "transfers:read",
      "events:read",
      "payables:read",
      "receivables:read",
    ])
      expect(me.json().permissions).toContain(permission);
    expect((await app.inject({ url: "/api/health" })).json()).toEqual({
      status: "ok",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { origin: "https://outro.example", cookie },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
