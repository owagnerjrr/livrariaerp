import { config as dotenv } from "dotenv";
import { z } from "zod";
import { resolve } from "node:path";
if (process.env.NODE_ENV !== "production")
  dotenv({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
export const config = z
  .object({
    DATABASE_URL: z.string().startsWith("postgresql://"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    HOST: z.string().default("127.0.0.1"),
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SESSION_HOURS: z.coerce.number().positive().max(24).default(8),
  })
  .parse(process.env);
if (
  config.NODE_ENV === "production" &&
  !config.WEB_ORIGIN.startsWith("https://")
)
  throw new Error("Produção exige WEB_ORIGIN HTTPS");
if (config.NODE_ENV === "production") {
  const database = new URL(config.DATABASE_URL);
  const origin = new URL(config.WEB_ORIGIN);
  if (
    ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(database.hostname)
  )
    throw new Error("Produção exige PostgreSQL remoto.");
  if (!process.env.PORT || config.HOST !== "0.0.0.0")
    throw new Error("Produção exige PORT do serviço e HOST=0.0.0.0.");
  if (origin.origin !== config.WEB_ORIGIN || origin.username || origin.password)
    throw new Error(
      "WEB_ORIGIN deve ser uma origem HTTPS exata, sem caminho ou credenciais.",
    );
}
