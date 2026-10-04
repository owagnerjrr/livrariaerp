import { config } from "dotenv";
import { defineConfig } from "prisma/config";
if (process.env.NODE_ENV !== "production")
  config({ path: "../../.env", quiet: true });
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
