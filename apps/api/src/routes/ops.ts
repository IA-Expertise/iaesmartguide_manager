import { Router, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@iaesmartguide/db";
import { config } from "../config.js";
import { buildOpsContacts } from "../lib/ops-contacts.js";
import { isPlaceholderSlug } from "../utils/phone.js";

export const opsRouter = Router();

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function requireOpsAuth(req: Request, res: Response, next: NextFunction): void {
  const password = config.opsPassword;
  if (!password) {
    res.status(503).json({ error: "OPS_PASSWORD não configurado" });
    return;
  }

  const header = req.headers.authorization;
  const token =
    (typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7)
      : undefined) ?? (req.headers["x-ops-password"] as string | undefined);

  if (!token || !safeEqual(token, password)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

opsRouter.use(requireOpsAuth);

opsRouter.get("/summary", async (_req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: { plan: true, isPublished: true, slug: true },
    });

    const total = tenants.length;
    const free = tenants.filter((t) => t.plan === "free").length;
    const premium = tenants.filter((t) => t.plan === "premium").length;
    const published = tenants.filter((t) => t.isPublished).length;
    const onboarding = tenants.filter(
      (t) => !t.isPublished && !isPlaceholderSlug(t.slug)
    ).length;
    const registeredOnly = tenants.filter((t) => isPlaceholderSlug(t.slug)).length;

    const whatsappContacts = await prisma.chatState.count();
    const tenantPhones = new Set(
      (await prisma.tenant.findMany({ select: { whatsappNumber: true } })).map(
        (t) => t.whatsappNumber
      )
    );
    const allChatPhones = await prisma.chatState.findMany({
      select: { whatsappNumber: true },
    });
    const contactsWithoutTenant = allChatPhones.filter(
      (c) => !tenantPhones.has(c.whatsappNumber)
    ).length;

    res.json({
      total,
      free,
      premium,
      published,
      onboarding,
      registeredOnly,
      whatsappContacts,
      contactsWithoutTenant,
    });
  } catch (error) {
    console.error("[ops/summary]", error);
    res.status(500).json({ error: "Internal error" });
  }
});

opsRouter.get("/tenants", async (_req, res) => {
  try {
    const domain = config.rootDomain;
    const [chatStates, tenants] = await Promise.all([
      prisma.chatState.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { products: true, photos: true } } },
      }),
    ]);

    const contacts = buildOpsContacts(chatStates, tenants, domain);

    res.json({ contacts, tenants: contacts });
  } catch (error) {
    console.error("[ops/tenants]", error);
    res.status(500).json({ error: "Internal error" });
  }
});

opsRouter.delete("/tenants/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    await prisma.$transaction([
      prisma.chatState.deleteMany({ where: { whatsappNumber: tenant.whatsappNumber } }),
      prisma.authCode.deleteMany({ where: { whatsappNumber: tenant.whatsappNumber } }),
      prisma.payment.updateMany({ where: { tenantId: id }, data: { tenantId: null } }),
      prisma.tenant.delete({ where: { id } }),
    ]);

    console.log(`[ops] tenant removido id=${id} slug=${tenant.slug}`);
    res.json({ ok: true, slug: tenant.slug });
  } catch (error) {
    console.error("[ops/delete]", error);
    res.status(500).json({ error: "Não foi possível remover" });
  }
});
