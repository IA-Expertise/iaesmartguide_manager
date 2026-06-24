import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { isR2Configured, uploadToR2 } from "../services/r2.js";
import { runDbPush } from "../lib/db-setup.js";
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

adminRouter.get("/r2-check", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isR2Configured()) {
    res.status(503).json({
      ok: false,
      error: "R2 não configurado",
      missing: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"],
    });
    return;
  }

  try {
    const testUrl = await uploadToR2(
      `healthchecks/${Date.now()}.txt`,
      Buffer.from("iaesmartguide-r2-ok"),
      "text/plain"
    );
    res.json({ ok: true, message: "Upload R2 funcionando", testUrl });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "R2 upload failed", detail });
  }
});

adminRouter.get("/setup", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    runDbPush();
    const result = await runSeed();
    res.json({
      ok: true,
      schema: "synced",
      message: result.created ? "Tenant criado" : "Tenant já existia",
      slug: result.slug,
    });
  } catch (error) {
    console.error("[admin/setup]", error);
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Setup failed", detail });
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
