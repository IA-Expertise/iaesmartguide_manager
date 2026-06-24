import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { runSeed } from "../lib/seed.js";
import { config } from "../config.js";

export const adminRouter = Router();

function checkSecret(secret: string | undefined): boolean {
  return Boolean(config.seedSecret && secret === config.seedSecret);
}

adminRouter.get("/db-check", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const count = await prisma.tenant.count();
    res.json({ ok: true, database: "connected", tenantCount: count });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Database connection failed", detail });
  } finally {
    await prisma.$disconnect();
  }
});

adminRouter.get("/seed", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await runSeed();
    res.json({
      ok: true,
      message: result.created ? "Tenant criado" : "Tenant já existia",
      slug: result.slug,
    });
  } catch (error) {
    console.error("[admin/seed]", error);
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Seed failed", detail });
  }
});
