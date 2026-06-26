import type { PrismaClient, ChatState, Tenant } from "@prisma/client";
import { brazilPhoneVariants, canonicalBrazilWhatsApp } from "../utils/phone.js";
import { ChatStates } from "../fsm/states.js";

export async function findTenantByWhatsApp(
  prisma: PrismaClient,
  rawPhone: string
): Promise<Tenant | null> {
  for (const variant of brazilPhoneVariants(rawPhone)) {
    const tenant = await prisma.tenant.findUnique({ where: { whatsappNumber: variant } });
    if (tenant) return tenant;
  }
  return null;
}

export async function ensureChatStateForWhatsApp(
  prisma: PrismaClient,
  rawPhone: string
): Promise<{ state: ChatState; phone: string }> {
  const phone = canonicalBrazilWhatsApp(rawPhone);

  const existing = await prisma.chatState.findUnique({ where: { whatsappNumber: phone } });
  if (existing) {
    return { state: existing, phone };
  }

  for (const variant of brazilPhoneVariants(rawPhone)) {
    if (variant === phone) continue;
    const alt = await prisma.chatState.findUnique({ where: { whatsappNumber: variant } });
    if (alt) {
      await prisma.chatState.delete({ where: { whatsappNumber: variant } });
      const migrated = await prisma.chatState.create({
        data: {
          whatsappNumber: phone,
          currentState: alt.currentState,
          tempData: alt.tempData ?? {},
        },
      });
      return { state: migrated, phone };
    }
  }

  const created = await prisma.chatState.create({
    data: {
      whatsappNumber: phone,
      currentState: ChatStates.START,
      tempData: {},
    },
  });
  return { state: created, phone };
}

/** Marca pagamento simulado em todas as variantes e consolida chat no número canônico */
export async function prepareWhatsAppTestUser(
  prisma: PrismaClient,
  rawPhone: string
): Promise<string> {
  const phone = canonicalBrazilWhatsApp(rawPhone);
  const variants = brazilPhoneVariants(rawPhone);

  for (const variant of variants) {
    await prisma.tenant.upsert({
      where: { whatsappNumber: variant },
      create: {
        whatsappNumber: variant,
        ownerName: "Teste",
        businessName: "Pendente",
        slug: `pending-${variant.slice(-8)}`,
        plan: "premium",
        paymentStatus: "paid",
      },
      update: { plan: "premium", paymentStatus: "paid" },
    });
  }

  for (const variant of variants) {
    if (variant === phone) continue;
    await prisma.chatState.deleteMany({ where: { whatsappNumber: variant } });
  }

  await prisma.chatState.upsert({
    where: { whatsappNumber: phone },
    create: {
      whatsappNumber: phone,
      currentState: ChatStates.START,
      tempData: {},
    },
    update: {
      currentState: ChatStates.START,
      tempData: {},
    },
  });

  return phone;
}

export async function resetWhatsAppChat(
  prisma: PrismaClient,
  rawPhone: string
): Promise<string> {
  const phone = canonicalBrazilWhatsApp(rawPhone);
  for (const variant of brazilPhoneVariants(rawPhone)) {
    await prisma.chatState.deleteMany({ where: { whatsappNumber: variant } });
  }
  return phone;
}
