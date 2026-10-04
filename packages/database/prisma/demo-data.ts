import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Database } from "../src/index.js";
import {
  checkoutSchema,
  permissions,
  rolePermissions,
} from "@caramelo/contracts";
import { hashPassword } from "../../../apps/api/src/security.js";
import { saveIdentifiers } from "../../../apps/api/src/services/books.js";
import { lock, moveStock } from "../../../apps/api/src/services/stock.js";
import { writeSale } from "../../../apps/api/src/services/sales.js";
import type { AuthContext } from "../../../apps/api/src/context.js";

export const demoIdentity = {
  slug: "demo",
  email: "demo@caramelo.example",
  name: "DEMO — Livrarias Caramelo (dados fictícios)",
};
export function validateDemoSeed(environment: NodeJS.ProcessEnv) {
  if (environment.APP_ENV !== "demo")
    throw new Error(
      "Seed online exige APP_ENV=demo; não é um seed de produção.",
    );
  let url: URL;
  try {
    url = new URL(environment.DATABASE_URL!);
  } catch {
    throw new Error("Configure DATABASE_URL exclusiva para demonstração.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const testing =
    environment.NODE_ENV === "test" && database.endsWith("_demo_test");
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    (!database.endsWith("_demo") && !testing) ||
    environment.DEMO_SEED_CONFIRM !== database
  )
    throw new Error(
      "Seed exige banco exclusivo terminado em _demo e DEMO_SEED_CONFIRM igual ao nome do banco.",
    );
  if (
    !testing &&
    ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname)
  )
    throw new Error("Seed online não pode acessar o PostgreSQL local.");
  const password = environment.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 12 || /REPLACE|CHANGE_ME/.test(password))
    throw new Error(
      "Defina DEMO_ADMIN_PASSWORD exclusiva para a demo, com pelo menos 12 caracteres.",
    );
  return password;
}

/** All demo data and the marker are committed together; retries never refill stock. */
export async function seedOnlineDemo(
  db: Database,
  environment: NodeJS.ProcessEnv,
) {
  const password = validateDemoSeed(environment);
  const passwordHash = await hashPassword(password);
  return db.$transaction(
    async (tx) => {
      await lock(tx, "livrariaerp:online-demo-seed:v1");
      if (
        await tx.company.count({ where: { slug: { not: demoIdentity.slug } } })
      )
        throw new Error(
          "Banco contém outra empresa; seed demo recusado sem alterar dados.",
        );
      const existing = await tx.company.findUnique({
        where: { slug: demoIdentity.slug },
      });
      if (existing) {
        if (
          existing.name !== demoIdentity.name ||
          !(await tx.auditLog.findFirst({
            where: {
              companyId: existing.id,
              action: "DEMO_SEEDED",
              module: "system",
            },
          }))
        )
          throw new Error(
            "Empresa existente não foi criada por este seed; dados preservados.",
          );
        return { created: false, companyId: existing.id };
      }
      if (await tx.user.count())
        throw new Error(
          "Banco possui usuários existentes; use um banco demo novo e dedicado.",
        );
      const company = await tx.company.create({
        data: { slug: demoIdentity.slug, name: demoIdentity.name },
      });
      const companyId = company.id;
      for (const code of permissions)
        await tx.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        });
      const roles: Record<string, string> = {};
      for (const [name, codes] of Object.entries(rolePermissions)) {
        const role = await tx.role.create({
          data: {
            companyId,
            name,
            permissions: {
              create: codes.map((permissionCode) => ({ permissionCode })),
            },
          },
        });
        roles[name] = role.id;
      }
      const user = await tx.user.create({
        data: {
          name: "Administrador DEMO",
          email: demoIdentity.email,
          passwordHash,
        },
      });
      const branches = [];
      for (const name of ["DEMO — Loja Centro", "DEMO — Loja Jardim"])
        branches.push(await tx.branch.create({ data: { companyId, name } }));
      const member = await tx.membership.create({
        data: {
          companyId,
          userId: user.id,
          roleId: roles.Administrador!,
          branchId: branches[0]!.id,
        },
      });
      const auth: AuthContext = {
        companyId,
        membershipId: member.id,
        userId: user.id,
        branchId: null,
        role: "Administrador",
        permissions: [...permissions],
        name: user.name,
        email: user.email,
        companyName: company.name,
      };
      const suppliers = [];
      for (const [i, name] of [
        "DEMO — Distribuidora Aurora",
        "DEMO — Editora Horizonte",
      ].entries())
        suppliers.push(
          await tx.supplier.create({
            data: {
              companyId,
              name,
              email: `fornecedor${i + 1}@caramelo.example`,
              notes: "Fornecedor fictício para teste remoto.",
            },
          }),
        );
      const category = await tx.category.create({
        data: { companyId, name: "DEMO — Literatura" },
      });
      const products = [];
      for (let i = 0; i < 6; i++) {
        const base = `29000000000${i + 1}`;
        const sum = [...base].reduce(
          (n, d, index) => n + Number(d) * (index % 2 ? 3 : 1),
          0,
        );
        const product = await tx.product.create({
          data: {
            companyId,
            code: `DEMO-${String(i + 1).padStart(3, "0")}`,
            barcode: base + ((10 - (sum % 10)) % 10),
            description: `Livro DEMO ${i + 1} — ${["Contos do Jardim", "Aventura na Serra", "Poesia da Manhã", "Histórias da Lua", "Caminhos do Mar", "Caderno de Leituras"][i]}`,
            author: `Autor fictício ${i + 1}`,
            publisher: "Editora fictícia DEMO",
            cost: "20.00",
            price: "40.00",
            minStock: "5",
            categoryId: category.id,
            supplierId: suppliers[i % 2]!.id,
          },
        });
        await saveIdentifiers(tx, companyId, product);
        products.push(product);
      }
      const day = new Date().toISOString().slice(0, 10);
      const warehouses = [];
      const sessions = [];
      for (const branch of branches) {
        const warehouse = await tx.warehouse.create({
          data: {
            companyId,
            branchId: branch.id,
            name: "DEMO — Estoque da loja",
          },
        });
        warehouses.push(warehouse);
        const document = await tx.stockDocument.create({
          data: {
            companyId,
            warehouseId: warehouse.id,
            actorId: member.id,
            kind: "ENTRY",
            requestKey: randomUUID(),
            requestHash: "online-demo-v1",
            receivedAt: new Date(day),
            notes: "DEMO — Saldo inicial fictício",
          },
        });
        await tx.stockDocumentItem.createMany({
          data: products.map((p) => ({
            companyId,
            documentId: document.id,
            productId: p.id,
            title: p.description,
            quantity: 20,
            unitCost: p.cost,
          })),
        });
        for (const p of products)
          await moveStock(tx, auth, {
            warehouseId: warehouse.id,
            productId: p.id,
            delta: new Prisma.Decimal(20),
            documentId: document.id,
            type: "IN",
            reason: "DEMO — Saldo inicial fictício",
          });
        const terminal = await tx.cashRegister.create({
          data: {
            companyId,
            branchId: branch.id,
            name: "DEMO — Caixa da loja",
          },
        });
        const session = await tx.cashSession.create({
          data: {
            companyId,
            branchId: branch.id,
            cashRegisterId: terminal.id,
            openedById: member.id,
            openingAmount: "100.00",
            openingNotes: "DEMO — Fundo inicial fictício",
            requestKey: randomUUID(),
            requestHash: "online-demo-v1",
          },
        });
        sessions.push(session);
        await tx.cashMovement.create({
          data: {
            companyId,
            cashRegisterId: terminal.id,
            cashSessionId: session.id,
            actorId: member.id,
            method: "CASH",
            kind: "OPENING",
            amount: "100.00",
            description: "DEMO — Fundo inicial",
          },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            actorId: member.id,
            action: "CASH_OPENED",
            module: "cash",
            recordId: session.id,
            metadata: { branchId: branch.id, opening: "100.00", demo: true },
          },
        });
      }
      const customer = await tx.customer.create({
        data: {
          companyId,
          name: "Cliente fictício DEMO",
          email: "cliente@caramelo.example",
          notes: "Cadastro de teste, sem CPF/CNPJ real.",
        },
      });
      for (const [i, method] of ["PIX", "CREDIT_CARD"].entries()) {
        const input = checkoutSchema.parse({
          requestKey: randomUUID(),
          cashSessionId: sessions[i]!.id,
          cart: {
            warehouseId: warehouses[i]!.id,
            customerId: customer.id,
            items: [
              {
                productId: products[i]!.id,
                quantity: 1,
                expectedUnitPrice: "40.00",
              },
            ],
          },
          payments: [
            {
              method,
              amount: "40.00",
              installments: method === "CREDIT_CARD" ? 2 : 1,
              confirmed: true,
              reference: "DEMO — Pagamento simulado",
            },
          ],
        });
        await writeSale(
          tx,
          auth,
          input,
          createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        );
      }
      const financeCategory = await tx.financialCategory.create({
        data: { companyId, name: "DEMO — Despesas administrativas" },
      });
      const obligation = await tx.financialObligation.create({
        data: {
          companyId,
          branchId: branches[0]!.id,
          categoryId: financeCategory.id,
          actorId: member.id,
          origin: "MANUAL",
          description: "DEMO — Internet da loja",
          issuedAt: new Date(day),
          competence: new Date(day),
          originalAmount: "150.00",
          notes:
            "Obrigação administrativa fictícia; não efetuar pagamento real.",
        },
      });
      const due = new Date(day);
      due.setUTCDate(due.getUTCDate() + 7);
      await tx.financialEntry.create({
        data: {
          companyId,
          branchId: branches[0]!.id,
          obligationId: obligation.id,
          type: "PAYABLE",
          description: obligation.description,
          amount: "150.00",
          dueDate: due,
          installment: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: member.id,
          action: "PAYABLE_CREATED",
          module: "payables",
          recordId: obligation.id,
          metadata: { demo: true, amount: "150.00", branchId: branches[0]!.id },
        },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: member.id,
          action: "DEMO_SEEDED",
          module: "system",
          recordId: companyId,
          metadata: { version: 1, fictitious: true, branches: 2 },
        },
      });
      return { created: true, companyId };
    },
    { timeout: 20000 },
  );
}
