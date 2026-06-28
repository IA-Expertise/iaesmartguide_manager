import type { PrismaClient, Tenant } from "@prisma/client";
import { config } from "../config.js";

export const FREE_MAX_PRODUCTS = 4;
export const ONBOARDING_ADJUSTMENTS = 2;
export const MONTHLY_MAINTENANCE = 1;
export const PREMIUM_GRACE_DAYS = 15;

export type TenantPlan = Pick<
  Tenant,
  | "plan"
  | "onboardingAdjustmentsUsed"
  | "maintenanceCreditsUsed"
  | "maintenanceCreditsPeriod"
  | "premiumOverdueSince"
  | "premiumTrialUntil"
>;

export type TenantWithId = TenantPlan & Pick<Tenant, "id">;

export function getPremiumTrialDays(): number {
  return config.plans.premiumTrialDays;
}

export function computePremiumTrialUntil(from = new Date()): Date | null {
  const days = getPremiumTrialDays();
  if (days <= 0) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isPaidPremium(tenant: { plan: string }): boolean {
  return tenant.plan === "premium";
}

export function isOnPremiumTrial(tenant: {
  plan: string;
  premiumTrialUntil: Date | null;
}): boolean {
  if (isPaidPremium(tenant)) return false;
  if (!tenant.premiumTrialUntil) return false;
  return tenant.premiumTrialUntil > new Date();
}

export function isPremium(tenant: {
  plan: string;
  premiumTrialUntil?: Date | null;
}): boolean {
  if (isPaidPremium(tenant)) return true;
  return isOnPremiumTrial(tenant as { plan: string; premiumTrialUntil: Date | null });
}

export function getPlanDisplay(tenant: {
  plan: string;
  premiumTrialUntil: Date | null;
}): "trial" | "premium" | "free" {
  if (isPaidPremium(tenant)) return "premium";
  if (isOnPremiumTrial(tenant)) return "trial";
  return "free";
}

export function currentCreditsPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getMaintenanceStatus(tenant: TenantPlan): {
  phase: "premium" | "onboarding" | "monthly";
  remaining: number;
} {
  if (isPremium(tenant)) {
    return { phase: "premium", remaining: Number.POSITIVE_INFINITY };
  }

  const onboardingRemaining = ONBOARDING_ADJUSTMENTS - tenant.onboardingAdjustmentsUsed;
  if (onboardingRemaining > 0) {
    return { phase: "onboarding", remaining: onboardingRemaining };
  }

  const period = currentCreditsPeriod();
  if (tenant.maintenanceCreditsPeriod !== period) {
    return { phase: "monthly", remaining: MONTHLY_MAINTENANCE };
  }

  return {
    phase: "monthly",
    remaining: Math.max(0, MONTHLY_MAINTENANCE - tenant.maintenanceCreditsUsed),
  };
}

export function canPublishMaintenance(tenant: TenantPlan): boolean {
  if (isPremium(tenant)) return true;
  return getMaintenanceStatus(tenant).remaining > 0;
}

export function canAddProduct(tenant: TenantPlan, productCount: number): boolean {
  if (isPremium(tenant)) return true;
  return productCount < FREE_MAX_PRODUCTS;
}

export async function applyPremiumDowngradeIfNeeded(
  prisma: PrismaClient,
  tenant: TenantWithId
): Promise<void> {
  if (!isPaidPremium(tenant) || !tenant.premiumOverdueSince) return;

  const graceMs = PREMIUM_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - tenant.premiumOverdueSince.getTime();
  if (elapsed < graceMs) return;

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      plan: "free",
      paymentStatus: "active",
      premiumOverdueSince: null,
    },
  });

  console.log(`[Plan] tenant ${tenant.id} rebaixado para free após ${PREMIUM_GRACE_DAYS}d inadimplente`);
}

export async function consumeMaintenanceCredit(
  prisma: PrismaClient,
  tenant: TenantWithId
): Promise<void> {
  if (isPremium(tenant)) return;

  const status = getMaintenanceStatus(tenant);
  if (status.phase === "onboarding") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { onboardingAdjustmentsUsed: tenant.onboardingAdjustmentsUsed + 1 },
    });
    return;
  }

  const period = currentCreditsPeriod();
  const used =
    tenant.maintenanceCreditsPeriod === period ? tenant.maintenanceCreditsUsed + 1 : 1;

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      maintenanceCreditsPeriod: period,
      maintenanceCreditsUsed: used,
    },
  });
}

export function premiumPitchMessage(context: "maintenance" | "marketing" | "products"): string {
  const price = config.plans.premiumPriceLabel;
  const upgrade = config.plans.upgradeUrl;

  const intro =
    context === "marketing"
      ? "A divulgação com IA (posts, Status, Instagram) é do *Premium*."
      : context === "products"
        ? `No plano grátis você pode ter até *${FREE_MAX_PRODUCTS} ofertas*.`
        : "Você usou as atualizações disponíveis neste período.";

  const benefits = `*Premium ${price}/mês:* site sem propaganda, edições ilimitadas e Lia para redes sociais.`;

  const cta = upgrade
    ? `Assine aqui: ${upgrade}`
    : "Fale com a Lia para assinar o Premium.";

  return `${intro}\n\n${benefits}\n${cta}`;
}

export function trialExpiredMessage(): string {
  const price = config.plans.premiumPriceLabel;
  const upgrade = config.plans.upgradeUrl;
  const cta = upgrade
    ? `Assine o Premium (${price}/mês): ${upgrade}`
    : `Fale com a Lia para assinar o Premium (${price}/mês).`;
  return `Seu *trial Premium* de ${getPremiumTrialDays()} dias encerrou. No plano grátis: até ${FREE_MAX_PRODUCTS} ofertas, 1 atualização/mês e sem divulgar com IA.\n\n${cta}`;
}

export function maintenanceStatusUserMessage(tenant: TenantPlan): string {
  const status = getMaintenanceStatus(tenant);
  if (status.phase === "premium") return "";

  if (status.phase === "onboarding") {
    if (status.remaining === ONBOARDING_ADJUSTMENTS) {
      return `\n\n📋 Você tem *${status.remaining} ajustes grátis* para deixar o site do seu jeito.`;
    }
    if (status.remaining === 1) {
      return "\n\n📋 Resta *1 ajuste grátis* antes do plano mensal.";
    }
    return "\n\n📋 Ajustes iniciais concluídos. Daqui pra frente: *1 atualização por mês* no plano grátis.";
  }

  if (status.remaining > 0) {
    return `\n\n📋 Você ainda tem *${status.remaining} atualização* este mês no plano grátis.`;
  }

  return "\n\n📋 Sem atualizações grátis este mês. Premium libera edições ilimitadas.";
}

export function maintenanceHintForMenu(tenant: TenantPlan): string {
  if (isOnPremiumTrial(tenant)) {
    const daysLeft = Math.max(
      1,
      Math.ceil((tenant.premiumTrialUntil!.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );
    return `Trial Premium · *${daysLeft}* dia(s) restante(s) ✨`;
  }

  const status = getMaintenanceStatus(tenant);
  if (status.phase === "premium") return "Plano Premium ✨";

  if (
    tenant.premiumTrialUntil &&
    tenant.premiumTrialUntil <= new Date() &&
    !isPaidPremium(tenant)
  ) {
    return "Trial encerrado · plano grátis";
  }

  if (status.phase === "onboarding") {
    return `Plano grátis · *${status.remaining}* ajuste(s) grátis restante(s)`;
  }

  if (status.remaining > 0) {
    return `Plano grátis · *${status.remaining}* atualização este mês`;
  }

  return "Plano grátis · sem atualizações este mês";
}

export function onboardingWelcomeMessages(): string[] {
  const days = getPremiumTrialDays();
  if (days > 0) {
    return trialWelcomeMessages();
  }

  return [
    "No plano *grátis* você tem *2 ajustes grátis* para deixar o site do seu jeito. Depois: *1 atualização por mês*.",
    `*Premium ${config.plans.premiumPriceLabel}/mês:* sem propaganda no site, edições ilimitadas e *divulgar* com IA para redes.`,
  ];
}

export function trialWelcomeMessages(): string[] {
  const days = getPremiumTrialDays();
  const price = config.plans.premiumPriceLabel;
  const upgrade = config.plans.upgradeUrl;

  const messages = [
    `🎁 Você ganhou *${days} dias de Premium* grátis: divulgar com IA, ofertas ilimitadas e site sem propaganda!`,
    "Dica da Lia: envie *divulgar* que eu monto textos para Status, Instagram e grupos ✨",
  ];

  if (upgrade) {
    messages.push(`Depois do trial, assine por ${price}/mês: ${upgrade}`);
  } else {
    messages.push(`Depois do trial, o Premium (${price}/mês) libera tudo de novo.`);
  }

  return messages;
}

export function planUpsellMessage(
  tenant: Pick<Tenant, "plan" | "premiumTrialUntil">,
  context: "maintenance" | "marketing" | "products"
): string {
  if (
    tenant.premiumTrialUntil &&
    tenant.premiumTrialUntil <= new Date() &&
    !isPaidPremium(tenant)
  ) {
    return trialExpiredMessage();
  }
  return premiumPitchMessage(context);
}

export async function upgradeTenantToPremium(
  prisma: PrismaClient,
  tenantId: number
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: "premium",
      paymentStatus: "paid",
      premiumOverdueSince: null,
      premiumTrialUntil: null,
    },
  });
}

export async function markPremiumOverdue(
  prisma: PrismaClient,
  tenantId: number
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !isPaidPremium(tenant)) return;

  if (tenant.premiumOverdueSince) return;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { premiumOverdueSince: new Date() },
  });

  console.log(`[Plan] tenant ${tenantId} — início do prazo de ${PREMIUM_GRACE_DAYS}d (inadimplência)`);
}
