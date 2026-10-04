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
