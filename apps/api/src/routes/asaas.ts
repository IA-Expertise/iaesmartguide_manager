import { Router } from "express";
import { prisma } from "@iaesmartguide/db";
import { config } from "../config.js";
import { ChatStates } from "../fsm/states.js";
import { normalizePhone } from "../utils/phone.js";

export const asaasRouter = Router();

asaasRouter.post("/", async (req, res) => {
  const token = req.headers["asaas-access-token"];
  if (config.asaas.webhookToken && token !== config.asaas.webhookToken) {
    res.sendStatus(401);
    return;
  }

  try {
    const event = req.body?.event as string | undefined;
    const payment = req.body?.payment;

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      const externalId = payment?.id as string | undefined;
      const customerPhone = payment?.customer?.mobilePhone ?? payment?.description;

      if (!externalId) {
        res.sendStatus(400);
        return;
      }

      const existing = await prisma.payment.findUnique({ where: { externalId } });
      if (existing) {
        res.sendStatus(200);
        return;
      }

      const whatsappNumber = normalizePhone(customerPhone);
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
          paymentStatus: "paid",
        },
        update: { paymentStatus: "paid" },
      });

      await prisma.payment.create({
        data: {
          externalId,
          tenantId: tenant.id,
          amountCents: Math.round((payment?.value ?? 0) * 100),
          status: "paid",
        },
      });

      await prisma.chatState.upsert({
        where: { whatsappNumber },
        create: {
          whatsappNumber,
          currentState: ChatStates.COLLECTING_NAME,
          tempData: {},
        },
        update: { currentState: ChatStates.COLLECTING_NAME },
      });

      // Mensagem ativa via Lia — Fase 3
      console.log(`[Asaas] Pagamento confirmado para ${whatsappNumber}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("[Asaas webhook]", error);
    res.sendStatus(500);
  }
});
