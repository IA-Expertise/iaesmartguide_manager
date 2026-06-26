import { isPlaceholderSlug } from "../utils/phone.js";

export const CHAT_STATE_LABELS: Record<string, string> = {
  START: "Início",
  WAITING_PAYMENT: "Aguardando pagamento",
  COLLECTING_NAME: "Coletando nome",
  COLLECTING_LOGO: "Coletando logo",
  COLLECTING_PHOTOS: "Coletando fotos",
  COLLECTING_YOUTUBE: "Coletando YouTube",
  CONFIRMED: "Menu / site ativo",
  EDITING: "Editando",
  EDITING_DESCRIPTION: "Editando descrição",
  EDITING_ADDRESS: "Editando endereço",
  EDITING_LOGO: "Editando logo",
  EDITING_PHOTOS: "Editando fotos",
  EDITING_PRODUCT_TITLE: "Nova oferta",
  EDITING_PRODUCT_PRICE: "Preço da oferta",
  EDITING_PRODUCT_IMAGE: "Foto da oferta",
  EDITING_DELETE_PRODUCT: "Remover oferta",
  EDITING_DELETE_PRODUCT_CONFIRM: "Confirmar remoção",
  EDITING_YOUTUBE: "Editando YouTube",
  EDITING_INSTAGRAM: "Editando Instagram",
  MARKETING_PICK_IMAGE: "Marketing — foto",
  MARKETING_PICK_TOPIC: "Marketing — assunto",
  MARKETING_TAGLINE_CONFIRM: "Marketing — gancho",
};

export type TenantOpsStatus = "live" | "onboarding" | "registered" | "blocked";

export function chatStateLabel(state: string | undefined): string {
  if (!state) return "—";
  return CHAT_STATE_LABELS[state] ?? state;
}

export function tenantOpsStatus(
  tenant: { isPublished: boolean; slug: string },
  chatState?: { currentState: string } | null
): { key: TenantOpsStatus; label: string } {
  if (tenant.isPublished) {
    return { key: "live", label: "No ar" };
  }

  if (isPlaceholderSlug(tenant.slug)) {
    return { key: "registered", label: "Só WhatsApp" };
  }

  const state = chatState?.currentState;
  if (state === "WAITING_PAYMENT") {
    return { key: "blocked", label: "Aguardando pagamento" };
  }

  return { key: "onboarding", label: "Em cadastro" };
}
