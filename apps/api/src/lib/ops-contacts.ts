import type { ChatState, Tenant } from "@prisma/client";
import { chatStateLabel, tenantOpsStatus } from "./ops-status.js";
import { getPlanDisplay } from "../services/plan.js";
import { isPlaceholderSlug } from "../utils/phone.js";

type TenantWithCounts = Tenant & {
  _count: { products: number; photos: number };
};

export interface OpsContactRow {
  id: number | null;
  displayName: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  slug: string | null;
  plan: string | null;
  isPublished: boolean;
  hasTenant: boolean;
  status: "live" | "onboarding" | "registered" | "blocked" | "contact";
  statusLabel: string;
  chatState: string | null;
  chatStateLabel: string;
  productCount: number;
  photoCount: number;
  lastActivityAt: string;
  createdAt: string | null;
  siteUrl: string | null;
  previewUrl: string | null;
  whatsappUrl: string;
}

function nameFromTempData(tempData: unknown): string | null {
  if (!tempData || typeof tempData !== "object") return null;
  const businessName = (tempData as Record<string, unknown>).businessName;
  if (typeof businessName === "string" && businessName.trim()) {
    return businessName.trim();
  }
  return null;
}

export function formatWhatsappDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function resolveDisplayName(tenant: Tenant | undefined, chat: ChatState | undefined): string {
  const fromTemp = chat ? nameFromTempData(chat.tempData) : null;
  if (fromTemp) return fromTemp;

  if (tenant) {
    if (tenant.businessName && tenant.businessName !== "Pendente") {
      return tenant.businessName;
    }
    if (tenant.ownerName && tenant.ownerName !== "Pendente" && tenant.ownerName !== "Teste") {
      return tenant.ownerName;
    }
  }

  return "Contato sem nome";
}

function contactStatus(
  tenant: Tenant | undefined,
  chat: ChatState | undefined
): { key: OpsContactRow["status"]; label: string } {
  if (!tenant) {
    return { key: "contact", label: "Só conversou" };
  }
  const { key, label } = tenantOpsStatus(tenant, chat);
  return { key, label };
}

export function buildOpsContacts(
  chatStates: ChatState[],
  tenants: TenantWithCounts[],
  domain: string
): OpsContactRow[] {
  const tenantByPhone = new Map(tenants.map((t) => [t.whatsappNumber, t]));
  const seen = new Set<string>();
  const rows: OpsContactRow[] = [];

  for (const chat of chatStates) {
    seen.add(chat.whatsappNumber);
    const tenant = tenantByPhone.get(chat.whatsappNumber);
    rows.push(toRow(chat.whatsappNumber, tenant, chat, domain));
  }

  for (const tenant of tenants) {
    if (seen.has(tenant.whatsappNumber)) continue;
    rows.push(toRow(tenant.whatsappNumber, tenant, undefined, domain));
  }

  rows.sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  );

  return rows;
}

function toRow(
  phone: string,
  tenant: TenantWithCounts | undefined,
  chat: ChatState | undefined,
  domain: string
): OpsContactRow {
  const status = contactStatus(tenant, chat);
  const slug = tenant?.slug ?? null;
  const siteUrl =
    tenant && slug && !isPlaceholderSlug(slug) ? `https://${slug}.${domain}` : null;

  const lastActivity = chat?.updatedAt ?? tenant?.updatedAt ?? tenant?.createdAt ?? new Date();

  return {
    id: tenant?.id ?? null,
    displayName: resolveDisplayName(tenant, chat),
    whatsappNumber: phone,
    whatsappDisplay: formatWhatsappDisplay(phone),
    slug,
    plan: tenant ? getPlanDisplay(tenant) : null,
    isPublished: tenant?.isPublished ?? false,
    hasTenant: Boolean(tenant),
    status: status.key,
    statusLabel: status.label,
    chatState: chat?.currentState ?? null,
    chatStateLabel: chat ? chatStateLabel(chat.currentState) : "—",
    productCount: tenant?._count.products ?? 0,
    photoCount: tenant?._count.photos ?? 0,
    lastActivityAt: lastActivity.toISOString(),
    createdAt: tenant?.createdAt.toISOString() ?? null,
    siteUrl,
    previewUrl: siteUrl ? `https://${domain}?site=${slug}` : null,
    whatsappUrl: `https://wa.me/${phone.replace(/\D/g, "")}`,
  };
}
