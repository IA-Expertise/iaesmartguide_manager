import { Router } from "express";
import { prisma } from "@iaesmartguide/db";
import { config } from "../config.js";
import { ChatStates } from "../fsm/states.js";
import { findTenantByWhatsApp } from "../lib/whatsapp-db.js";
import {
  markPremiumOverdue,
  upgradeTenantToPremium,
} from "../services/plan.js";
import { normalizePhone } from "../utils/phone.js";

export const asaasRouter = Router();

function phoneFromPayment(payment: Record<string, unknown> | undefined): string | null {
  const customer = payment?.customer as Record<string, unknown> | undefined;
  const raw =
    (customer?.mobilePhone as string | undefined) ??
    (payment?.description as string | undefined);
  return normalizePhone(raw);
}

asaasRouter.post("/", async (req, res) => {
  const token = req.headers["asaas-access-token"];
  if (config.asaas.webhookToken && token !== config.asaas.webhookToken) {
    res.sendStatus(401);
    return;
  }

  try {
    const event = req.body?.event as string | undefined;
    const payment = req.body?.payment as Record<string, unknown> | undefined;

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      const externalId = payment?.id as string | undefined;

      if (!externalId) {
        res.sendStatus(400);
        return;
      }

      const existing = await prisma.payment.findUnique({ where: { externalId } });
      if (existing) {
        if (existing.tenantId != null) {
          await upgradeTenantToPremium(prisma, existing.tenantId);
        }
        res.sendStatus(200);
        return;
      }

      const whatsappNumber = phoneFromPayment(payment);
      if (!whatsappNumber) {
        res.sendStatus(400);
        return;
      }

      const tenant = await prisma.tenant.upsert({
        where: { whatsappNumber },
        create: {
          whatsappNumber,
          ownerName: "Pendente",
          businessName: "Pendente",
          slug: `pending-${whatsappNumber.slice(-8)}`,
          plan: "premium",
          paymentStatus: "paid",
        },
        update: {},
      });

      await upgradeTenantToPremium(prisma, tenant.id);

      await prisma.payment.create({
        data: {
          externalId,
          tenantId: tenant.id,
          amountCents: Math.round(((payment?.value as number | undefined) ?? 0) * 100),
          status: "paid",
        },
      });

      if (tenant.slug.startsWith("pending-")) {
        await prisma.chatState.upsert({
          where: { whatsappNumber },
          create: {
            whatsappNumber,
            currentState: ChatStates.COLLECTING_NAME,
            tempData: {},
          },
          update: { currentState: ChatStates.COLLECTING_NAME },
        });
      }

      console.log(`[Asaas] Premium ativado para ${whatsappNumber}`);
    }

    if (event === "PAYMENT_OVERDUE") {
      const whatsappNumber = phoneFromPayment(payment);
      if (whatsappNumber) {
        const tenant = await findTenantByWhatsApp(prisma, whatsappNumber);
        if (tenant) await markPremiumOverdue(prisma, tenant.id);
        console.log(`[Asaas] Inadimplência registrada para ${whatsappNumber}`);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("[Asaas webhook]", error);
    res.sendStatus(500);
  }
});
