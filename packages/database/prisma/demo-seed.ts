import { config } from "dotenv";
import { resolve } from "node:path";
import { createDatabase } from "../src/index.js";
import { seedOnlineDemo, validateDemoSeed } from "./demo-data.js";
config({ path: resolve(process.cwd(), ".env"), quiet: true });
validateDemoSeed(process.env);
const db = createDatabase(process.env.DATABASE_URL!);
try {
  const result = await seedOnlineDemo(db, process.env);
  console.log(
    result.created
      ? "DEMO criada: empresa demo / demo@caramelo.example. Senha definida por DEMO_ADMIN_PASSWORD."
      : "DEMO já existente; dados, operações e senha preservados.",
  );
} finally {
  await db.$disconnect();
}
