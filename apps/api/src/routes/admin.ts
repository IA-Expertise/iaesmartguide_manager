import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { isR2Configured, uploadToR2 } from "../services/r2.js";
import { isGeminiConfigured, runGeminiPrompt } from "../services/gemini.js";
import { isWhatsAppConfigured, sendWhatsAppText } from "../services/whatsapp-send.js";
import { runDbPush } from "../lib/db-setup.js";
import { runSeed } from "../lib/seed.js";
import { config } from "../config.js";
import { ChatStates } from "../fsm/states.js";
import {
  findTenantByWhatsApp,
  prepareWhatsAppTestUser,
  resetWhatsAppChat,
} from "../lib/whatsapp-db.js";
import { normalizePhone, brazilPhoneVariants, canonicalBrazilWhatsApp } from "../utils/phone.js";

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

adminRouter.get("/whatsapp-check", (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const railwayWebhookUrl = `${config.apiUrl.replace(/\/$/, "")}/webhooks/whatsapp`;
  const proxyMode = Boolean(config.whatsapp.forwardSecret);

  res.json({
    ok: isWhatsAppConfigured(),
    mode: proxyMode ? "replit-proxy" : "direct",
    metaWebhook: "permanece no Replit — não altere na Meta",
    replitForwardsTo: railwayWebhookUrl,
    railwayWebhookUrl,
    wabaId: config.whatsapp.wabaId || null,
    phoneNumberId: config.whatsapp.phoneNumberId || null,
    tokenConfigured: Boolean(config.whatsapp.token),
    forwardSecretConfigured: proxyMode,
    requirePayment: config.whatsapp.requirePayment,
    geminiConfigured: isGeminiConfigured(),
    message: isWhatsAppConfigured()
      ? proxyMode
        ? "Railway pronta. Replit deve encaminhar POSTs com header X-Webhook-Forward-Secret."
        : "Credenciais OK. Webhook pode apontar direto para a Railway."
      : "Configure WHATSAPP_TOKEN e PHONE_NUMBER_ID na Railway.",
  });
});

adminRouter.get("/gemini-test", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ ok: false, error: "GEMINI_API_KEY não configurada" });
    return;
  }

  try {
    const text = await runGeminiPrompt(
      "Responda em português, uma frase curta.",
      "Diga apenas: Lia online."
    );
    res.json({ ok: true, sample: text.slice(0, 120) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin/gemini-test]", error);
    res.status(502).json({ ok: false, error: message });
  }
});

adminRouter.get("/whatsapp-test-send", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const phone = normalizePhone(String(req.query.phone ?? ""));
  if (!phone) {
    res.status(400).json({ error: "Informe ?phone=5511999999999" });
    return;
  }

  if (!isWhatsAppConfigured()) {
    res.status(503).json({ error: "WhatsApp não configurado na API" });
    return;
  }

  try {
    await sendWhatsAppText(
      phone,
      "IAE Smart Guide: conexão OK! Envie qualquer mensagem para começar o cadastro do seu mini-site."
    );
    res.json({ ok: true, sentTo: phone });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao enviar", detail });
  }
});

adminRouter.get("/whatsapp-prepare-test", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawPhone = String(req.query.phone ?? "");
  if (!normalizePhone(rawPhone)) {
    res.status(400).json({ error: "Informe ?phone=5511999999999 (seu celular com DDD)" });
    return;
  }

  const prisma = new PrismaClient();
  try {
    const phone = await prepareWhatsAppTestUser(prisma, rawPhone);

    res.json({
      ok: true,
      phone,
      variants: brazilPhoneVariants(String(req.query.phone ?? "")),
      hint: "Use o celular de quem ENVIA a mensagem — não o número business (+55 19 93619-6154).",
      message:
        "Número liberado para teste (pagamento simulado). Envie uma mensagem no WhatsApp para iniciar o cadastro.",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao preparar teste", detail });
  } finally {
    await prisma.$disconnect();
  }
});

adminRouter.get("/whatsapp-status", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const prisma = new PrismaClient();
  try {
    const phone = normalizePhone(String(req.query.phone ?? ""));

    if (phone) {
      const [tenant, chatState] = await Promise.all([
        findTenantByWhatsApp(prisma, phone),
        prisma.chatState.findUnique({
          where: { whatsappNumber: canonicalBrazilWhatsApp(phone) },
        }),
      ]);
      res.json({
        ok: true,
        phone: canonicalBrazilWhatsApp(phone),
        variants: brazilPhoneVariants(phone),
        tenant,
        chatState,
      });
      return;
    }

    const recent = await prisma.chatState.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    res.json({
      ok: true,
      hint: "Passe ?phone=5511... para ver um número específico. Use o celular pessoal de quem envia mensagens.",
      recent,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao consultar status", detail });
  } finally {
    await prisma.$disconnect();
  }
});

adminRouter.get("/whatsapp-reset", async (req, res) => {
  if (!checkSecret(req.query.secret as string | undefined)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const phone = normalizePhone(String(req.query.phone ?? ""));
  if (!phone) {
    res.status(400).json({ error: "Informe ?phone=5511999999999" });
    return;
  }

  const prisma = new PrismaClient();
  try {
    const cleared = await resetWhatsAppChat(prisma, String(req.query.phone ?? ""));
    res.json({ ok: true, phone: cleared, message: "Estado da conversa resetado." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao resetar", detail });
  } finally {
    await prisma.$disconnect();
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
