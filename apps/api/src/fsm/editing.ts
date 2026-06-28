import { prisma } from "@iaesmartguide/db";
import type { TempData } from "./states.js";
import { ChatStates } from "./states.js";
import { persistWhatsAppImage, resolveMediaUrls } from "../services/media.js";
import { revalidateTenant } from "../services/revalidate.js";
import { taglineFromDescription } from "../utils/tagline.js";
import { normalizeInstagramUrl } from "../utils/instagram.js";
import { findTenantByWhatsApp } from "../lib/whatsapp-db.js";
import { appendPhotoToChatState, MAX_GALLERY_PHOTOS } from "../lib/chat-photos.js";
import {
  buttonsMessage,
  listMessage,
  textMessage,
  type WhatsAppOutbound,
} from "../services/whatsapp-send.js";
import { config } from "../config.js";
import {
  buildMarketingReplies,
  focusFromTempData,
  geminiUnavailableMessage,
  generateMarketingCopy,
  isGeminiConfigured,
  isMarketingAction,
  marketingErrorMessage,
  marketingKindFromAction,
  marketingMenuMessage,
  marketingPhotoPickerMessage,
  marketingTopicPickerMessage,
  resolveMarketingImage,
  resolveMarketingTopic,
  type MarketingKind,
} from "../services/lia-marketing.js";
import {
  applyPremiumDowngradeIfNeeded,
  canAddProduct,
  canPublishMaintenance,
  consumeMaintenanceCredit,
  isPremium,
  maintenanceHintForMenu,
  maintenanceStatusUserMessage,
  planUpsellMessage,
} from "../services/plan.js";
import type { IncomingMessage } from "./types.js";

const APPLY_TAGLINE = [{ id: "apply_tagline", title: "Usar no site" }];

const ADVANCE_PHOTOS = [{ id: "advance_photos", title: "Avançar" }];
const SKIP_YOUTUBE = [{ id: "skip_youtube", title: "Pular" }];
const SKIP_INSTAGRAM = [{ id: "skip_instagram", title: "Remover" }];
const SKIP_PRODUCT_PRICE = [{ id: "skip_product_price", title: "Sem preço" }];
const SKIP_PRODUCT_IMAGE = [{ id: "skip_product_image", title: "Sem foto" }];
const CANCEL_EDIT = [{ id: "cancel_edit", title: "Cancelar" }];
const CONFIRM_DELETE_PRODUCT = [{ id: "confirm_delete_product", title: "Sim, remover" }];

const EDIT_STATES = new Set<string>([
  ChatStates.CONFIRMED,
  ChatStates.EDITING,
  ChatStates.EDITING_DESCRIPTION,
  ChatStates.EDITING_ADDRESS,
  ChatStates.EDITING_LOGO,
  ChatStates.EDITING_PHOTOS,
  ChatStates.EDITING_PRODUCT_TITLE,
  ChatStates.EDITING_PRODUCT_PRICE,
  ChatStates.EDITING_PRODUCT_IMAGE,
  ChatStates.EDITING_DELETE_PRODUCT,
  ChatStates.EDITING_DELETE_PRODUCT_CONFIRM,
  ChatStates.EDITING_YOUTUBE,
  ChatStates.EDITING_INSTAGRAM,
  ChatStates.MARKETING_PICK_IMAGE,
  ChatStates.MARKETING_PICK_TOPIC,
  ChatStates.MARKETING_TAGLINE_CONFIRM,
]);

export function isEditingState(state: string): boolean {
  return EDIT_STATES.has(state);
}

export function editMenuMessage(
  slug: string,
  tenant?: {
    plan: string;
    onboardingAdjustmentsUsed: number;
    maintenanceCreditsUsed: number;
    maintenanceCreditsPeriod: string | null;
    premiumOverdueSince: Date | null;
    premiumTrialUntil: Date | null;
  }
): WhatsAppOutbound {
  const domain = config.rootDomain;
  const planHint = tenant ? `\n_${maintenanceHintForMenu(tenant)}_` : "";
  return listMessage(
    `Seu site: https://${slug}.${domain}${planHint}\n\nEscolha o que deseja atualizar:`,
    "Ver opções",
    [
      {
        title: "Conteúdo",
        rows: [
          { id: "edit_desc", title: "Descrição", description: "Texto sobre o negócio" },
          { id: "edit_address", title: "Endereço", description: "Onde fica o local" },
          { id: "edit_youtube", title: "YouTube", description: "Link do vídeo" },
          { id: "edit_instagram", title: "Instagram", description: "Perfil ou @usuario" },
        ],
      },
      {
        title: "Imagens",
        rows: [
          { id: "edit_logo", title: "Logo", description: "Enviar nova imagem" },
          { id: "edit_photos", title: "Fotos", description: "Substituir galeria (até 5)" },
        ],
      },
      {
        title: "Produtos",
        rows: [
          { id: "add_product", title: "Novo produto", description: "Nome, preço e foto" },
          { id: "delete_product", title: "Excluir oferta", description: "Remover do site" },
        ],
      },
      {
        title: "Divulgar",
        rows: [
          {
            id: "open_divulgar",
            title: "Divulgar com Lia",
            description: "Post com foto, textos e gancho",
          },
        ],
      },
    ]
  );
}

async function beginMarketingTopicFlow(
  phone: string,
  kind: MarketingKind,
  tenant: NonNullable<Awaited<ReturnType<typeof loadTenant>>>,
  extra: Partial<TempData> = {}
): Promise<WhatsAppOutbound[]> {
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: {
      currentState: ChatStates.MARKETING_PICK_TOPIC,
      tempData: { marketingKind: kind, ...extra },
    },
  });
  return [marketingTopicPickerMessage(kind, tenant.products)];
}

async function generateAndDeliverMarketing(
  phone: string,
  tenant: NonNullable<Awaited<ReturnType<typeof loadTenant>>>,
  tempData: TempData
): Promise<WhatsAppOutbound[]> {
  const slug = tenant.slug;
  const kind = tempData.marketingKind;
  const focus = focusFromTempData(tempData);

  if (!kind || !focus) {
    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.CONFIRMED, tempData: {} },
    });
    return [textMessage("Fluxo interrompido. Envie *divulgar* para começar de novo.")];
  }

  if (!isPremium(tenant)) {
    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.CONFIRMED, tempData: {} },
    });
    return [
      textMessage(planUpsellMessage(tenant, "marketing")),
      editMenuMessage(slug, tenant),
    ];
  }

  if (!isGeminiConfigured()) {
    return [geminiUnavailableMessage(), editMenuMessage(slug, tenant)];
  }

  try {
    const copy = await generateMarketingCopy(kind, tenant, config.rootDomain, focus);

    if (kind === "tagline") {
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          currentState: ChatStates.MARKETING_TAGLINE_CONFIRM,
          tempData: { suggestedTagline: copy },
        },
      });
      return [
        textMessage(`✨ Gancho sugerido (${focus.topicLabel}):`),
        textMessage(copy),
        buttonsMessage("Quer colocar isso no topo do site?", [...APPLY_TAGLINE, ...CANCEL_EDIT]),
      ];
    }

    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.CONFIRMED, tempData: {} },
    });
    return buildMarketingReplies(kind, tenant, config.rootDomain, copy, focus);
  } catch (error) {
    console.error("[Lia marketing]", error);
    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.CONFIRMED, tempData: {} },
    });
    return [textMessage(marketingErrorMessage(error))];
  }
}

async function runMarketingAction(
  phone: string,
  actionId: string,
  tenant: NonNullable<Awaited<ReturnType<typeof loadTenant>>>
): Promise<WhatsAppOutbound[]> {
  const slug = tenant.slug;
  const fresh = (await refreshTenant(phone)) ?? tenant;

  if (!isPremium(fresh)) {
    return [
      textMessage(planUpsellMessage(tenant, "marketing")),
      editMenuMessage(slug, fresh),
    ];
  }

  const kind = marketingKindFromAction(actionId);

  if (actionId === "open_divulgar") {
    return [marketingMenuMessage()];
  }

  if (!kind) return [textMessage("Opção inválida."), editMenuMessage(slug, fresh)];

  if (!isGeminiConfigured()) {
    return [geminiUnavailableMessage(), editMenuMessage(slug, fresh)];
  }

  if (kind === "post") {
    const picker = marketingPhotoPickerMessage(tenant);
    if (!picker) {
      return [
        textMessage(
          "Para montar o *post com foto*, cadastre imagens no menu:\n*Imagens → Fotos*"
        ),
      ];
    }
    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.MARKETING_PICK_IMAGE, tempData: { marketingKind: kind } },
    });
    return [picker];
  }

  return beginMarketingTopicFlow(phone, kind, tenant);
}

async function refreshTenant(phone: string) {
  const tenant = await loadTenant(phone);
  if (!tenant) return null;
  await applyPremiumDowngradeIfNeeded(prisma, tenant);
  return loadTenant(phone);
}

async function finishEdit(
  phone: string,
  slug: string,
  successText: string
): Promise<WhatsAppOutbound[]> {
  const tenant = await refreshTenant(phone);
  if (!tenant) return [textMessage("Site não encontrado.")];

  if (!canPublishMaintenance(tenant)) {
    return [
      textMessage(
        `${planUpsellMessage(tenant, "maintenance")}\n\nNenhuma alteração foi publicada.`
      ),
      editMenuMessage(slug, tenant),
    ];
  }

  await consumeMaintenanceCredit(prisma, tenant);
  await revalidateTenant(slug);
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { currentState: ChatStates.CONFIRMED, tempData: {} },
  });

  const updated = await loadTenant(phone);
  const statusLine = updated ? maintenanceStatusUserMessage(updated) : "";

  return [
    textMessage(`${successText}\n\nAlterações publicadas no site.${statusLine}`),
    editMenuMessage(slug, updated ?? tenant),
  ];
}

async function cancelEdit(phone: string, slug: string): Promise<WhatsAppOutbound[]> {
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { currentState: ChatStates.CONFIRMED, tempData: {} },
  });
  const tenant = await loadTenant(phone);
  return [textMessage("Edição cancelada."), editMenuMessage(slug, tenant ?? undefined)];
}

function isCancel(message: IncomingMessage): boolean {
  return (
    message.buttonId === "cancel_edit" ||
    (message.type === "text" && message.text?.trim().toLowerCase() === "cancelar")
  );
}

function menuTrigger(message: IncomingMessage): boolean {
  if (message.type === "interactive") return false;
  if (message.type !== "text") return true;
  const t = message.text?.trim().toLowerCase() ?? "";
  return (
    t === "" ||
    t === "menu" ||
    t === "ver menu" ||
    t === "oi" ||
    t === "olá" ||
    t === "ola" ||
    t === "ajuda"
  );
}

function isDivulgarTrigger(message: IncomingMessage): boolean {
  if (message.type !== "text") return false;
  const t = message.text?.trim().toLowerCase() ?? "";
  return t === "divulgar" || t === "marketing";
}

async function loadTenant(phone: string) {
  const base = await findTenantByWhatsApp(prisma, phone);
  if (!base) return null;
  return prisma.tenant.findUnique({
    where: { id: base.id },
    include: {
      products: { orderBy: { createdAt: "desc" }, take: 20 },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
}

function productDeleteListMessage(
  products: Array<{ id: number; title: string; price: string | null }>
): WhatsAppOutbound {
  return listMessage(
    "Qual oferta deseja remover do site?",
    "Ver ofertas",
    [
      {
        title: "Ofertas",
        rows: products.slice(0, 10).map((product) => ({
          id: `del_prod_${product.id}`,
          title: product.title.slice(0, 24),
          description: (product.price ?? "Sem preço").slice(0, 72),
        })),
      },
    ]
  );
}

async function handleMenuAction(
  phone: string,
  actionId: string,
  slug: string
): Promise<WhatsAppOutbound[] | null> {
  if (isMarketingAction(actionId)) {
    const tenant = await loadTenant(phone);
    if (!tenant) return [textMessage("Site não encontrado.")];
    return runMarketingAction(phone, actionId, tenant);
  }

  switch (actionId) {
    case "edit_desc":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_DESCRIPTION, tempData: {} },
      });
      return [
        buttonsMessage("Envie a nova descrição do seu negócio.", CANCEL_EDIT),
      ];
    case "edit_address":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_ADDRESS, tempData: {} },
      });
      return [buttonsMessage("Envie o endereço completo.", CANCEL_EDIT)];
    case "edit_logo":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_LOGO, tempData: {} },
      });
      return [
        buttonsMessage(
          "Envie o novo logo (imagem ou documento 📎). PNG transparente: use documento.",
          CANCEL_EDIT
        ),
      ];
    case "edit_photos":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_PHOTOS, tempData: { photos: [] } },
      });
      return [
        buttonsMessage(
          "Envie até 5 fotos para substituir a galeria. Toque em Avançar quando terminar.",
          [...ADVANCE_PHOTOS, ...CANCEL_EDIT]
        ),
      ];
    case "add_product": {
      const withProducts = await refreshTenant(phone);
      if (!withProducts) return [textMessage("Site não encontrado.")];
      if (!canAddProduct(withProducts, withProducts.products.length)) {
        return [
          textMessage(planUpsellMessage(withProducts, "products")),
          editMenuMessage(slug, withProducts),
        ];
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_PRODUCT_TITLE, tempData: {} },
      });
      return [buttonsMessage("Qual o nome do produto ou oferta?", CANCEL_EDIT)];
    }
    case "delete_product": {
      const withProducts = await loadTenant(phone);
      if (!withProducts?.products.length) {
        return [
          textMessage("Você ainda não tem ofertas cadastradas."),
          editMenuMessage(slug, withProducts ?? undefined),
        ];
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_DELETE_PRODUCT, tempData: {} },
      });
      return [productDeleteListMessage(withProducts.products)];
    }
    case "edit_youtube":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_YOUTUBE, tempData: {} },
      });
      return [
        buttonsMessage("Envie o link do YouTube ou toque em Pular.", [...SKIP_YOUTUBE, ...CANCEL_EDIT]),
      ];
    case "edit_instagram":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_INSTAGRAM, tempData: {} },
      });
      return [
        buttonsMessage(
          "Envie o link do Instagram ou @usuario (ex: @adegadotoninho). Toque em Remover para apagar.",
          [...SKIP_INSTAGRAM, ...CANCEL_EDIT]
        ),
      ];
    default:
      return null;
  }
}

export async function handleEditingMessage(
  message: IncomingMessage,
  phone: string,
  currentState: string,
  tempData: TempData
): Promise<WhatsAppOutbound[]> {
  const tenant = await loadTenant(phone);
  if (!tenant) {
    return [textMessage("Site não encontrado. Envie uma mensagem para começar o cadastro.")];
  }

  await applyPremiumDowngradeIfNeeded(prisma, tenant);
  const activeTenant = (await loadTenant(phone)) ?? tenant;
  const slug = activeTenant.slug;

  if (isCancel(message)) {
    return cancelEdit(phone, slug);
  }

  if (
    currentState === ChatStates.MARKETING_PICK_IMAGE ||
    currentState === ChatStates.MARKETING_PICK_TOPIC
  ) {
    if (isDivulgarTrigger(message)) {
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.CONFIRMED, tempData: {} },
      });
      return [marketingMenuMessage()];
    }
    if (menuTrigger(message)) {
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.CONFIRMED, tempData: {} },
      });
      return [editMenuMessage(slug, activeTenant)];
    }
  }

  if (currentState === ChatStates.CONFIRMED || currentState === ChatStates.EDITING) {
    if (message.type === "interactive" && message.buttonId) {
      const action = await handleMenuAction(phone, message.buttonId, slug);
      if (action) return action;
    }
    if (isDivulgarTrigger(message)) {
      if (!isPremium(activeTenant)) {
        return [
          textMessage(planUpsellMessage(tenant, "marketing")),
          editMenuMessage(slug, activeTenant),
        ];
      }
      return [marketingMenuMessage()];
    }
    if (menuTrigger(message)) {
      return [editMenuMessage(slug, activeTenant)];
    }
    return [
      textMessage("Toque em *Ver opções* no menu ou envie *menu* para editar seu site."),
      editMenuMessage(slug, activeTenant),
    ];
  }

  switch (currentState) {
    case ChatStates.EDITING_DESCRIPTION: {
      if (message.type !== "text" || !message.text?.trim()) {
        return [textMessage("Envie a descrição em texto.")];
      }
      const description = message.text.trim();
      await prisma.tenant.update({
        where: { id: activeTenant.id },
        data: {
          description,
          tagline: taglineFromDescription(description),
        },
      });
      return finishEdit(phone, slug, "Descrição atualizada!");
    }

    case ChatStates.EDITING_ADDRESS: {
      if (message.type !== "text" || !message.text?.trim()) {
        return [textMessage("Envie o endereço em texto.")];
      }
      await prisma.tenant.update({
        where: { id: activeTenant.id },
        data: { address: message.text.trim() },
      });
      return finishEdit(phone, slug, "Endereço atualizado!");
    }

    case ChatStates.EDITING_LOGO: {
      if (message.type !== "image" || !message.imageId) {
        return [
          textMessage(
            "Envie o logo como imagem ou documento (📎). Para PNG transparente, use documento."
          ),
        ];
      }
      try {
        const logoUrl = await persistWhatsAppImage(message.imageId, slug, "logo");
        await prisma.tenant.update({
          where: { id: activeTenant.id },
          data: { logoUrl },
        });
        return finishEdit(phone, slug, "Logo atualizado!");
      } catch (error) {
        console.error("[FSM edit logo]", error);
        return [textMessage("Não consegui salvar o logo. Tente novamente.")];
      }
    }

    case ChatStates.EDITING_PHOTOS: {
      if (message.type === "interactive" && message.buttonId === "advance_photos") {
        const freshState = await prisma.chatState.findUnique({ where: { whatsappNumber: phone } });
        const photos = ((freshState?.tempData ?? {}) as TempData).photos ?? [];
        if (!photos.length) {
          return [textMessage("Envie pelo menos uma foto ou toque em Cancelar.")];
        }
        const resolved = await resolveMediaUrls(photos, slug);
        await prisma.tenantPhoto.deleteMany({ where: { tenantId: activeTenant.id } });
        await prisma.tenantPhoto.createMany({
          data: resolved.map((photoUrl) => ({ tenantId: activeTenant.id, photoUrl })),
        });
        return finishEdit(phone, slug, `Galeria atualizada com ${resolved.length} foto(s)!`);
      }
      if (message.type === "image" && message.imageId) {
        try {
          const photoUrl = await persistWhatsAppImage(message.imageId, slug, "photo");
          const { photos, added, atCapacity } = await appendPhotoToChatState(phone, photoUrl);
          if (!added && atCapacity) {
            return [
              buttonsMessage(
                `Galeria completa (${MAX_GALLERY_PHOTOS}/${MAX_GALLERY_PHOTOS}). Toque em Avançar.`,
                [...ADVANCE_PHOTOS, ...CANCEL_EDIT]
              ),
            ];
          }
          if (!added) return [];
          return [
            buttonsMessage(
              `Foto ${photos.length}/${MAX_GALLERY_PHOTOS} recebida. Envie mais ou toque em Avançar.`,
              [...ADVANCE_PHOTOS, ...CANCEL_EDIT]
            ),
          ];
        } catch (error) {
          console.error("[FSM edit photos]", error);
          return [textMessage("Não consegui salvar a foto. Tente novamente.")];
        }
      }
      return [
        buttonsMessage(
          "Envie fotos ou toque em Avançar para publicar a galeria.",
          [...ADVANCE_PHOTOS, ...CANCEL_EDIT]
        ),
      ];
    }

    case ChatStates.EDITING_PRODUCT_TITLE: {
      if (message.type !== "text" || !message.text?.trim()) {
        return [textMessage("Envie o nome do produto em texto.")];
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          currentState: ChatStates.EDITING_PRODUCT_PRICE,
          tempData: { ...tempData, productTitle: message.text.trim() },
        },
      });
      return [
        buttonsMessage(
          `Preço de "${message.text.trim()}"? Envie o valor (ex: R$ 45,00) ou toque em Sem preço.`,
          [...SKIP_PRODUCT_PRICE, ...CANCEL_EDIT]
        ),
      ];
    }

    case ChatStates.EDITING_PRODUCT_PRICE: {
      let price: string | null = null;
      if (message.type === "interactive" && message.buttonId === "skip_product_price") {
        price = null;
      } else if (message.type === "text" && message.text?.trim()) {
        price = message.text.trim();
      } else {
        return [
          buttonsMessage("Envie o preço em texto ou toque em Sem preço.", [
            ...SKIP_PRODUCT_PRICE,
            ...CANCEL_EDIT,
          ]),
        ];
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          currentState: ChatStates.EDITING_PRODUCT_IMAGE,
          tempData: { ...tempData, productPrice: price },
        },
      });
      return [
        buttonsMessage(
          "Envie uma foto do produto ou toque em Sem foto.",
          [...SKIP_PRODUCT_IMAGE, ...CANCEL_EDIT]
        ),
      ];
    }

    case ChatStates.EDITING_PRODUCT_IMAGE: {
      let imageUrl: string | undefined;
      if (message.type === "interactive" && message.buttonId === "skip_product_image") {
        imageUrl = undefined;
      } else if (message.type === "image" && message.imageId) {
        try {
          imageUrl = await persistWhatsAppImage(message.imageId, slug, "photo");
        } catch (error) {
          console.error("[FSM edit product image]", error);
          return [textMessage("Não consegui salvar a foto. Tente novamente.")];
        }
      } else {
        return [
          buttonsMessage("Envie a foto do produto ou toque em Sem foto.", [
            ...SKIP_PRODUCT_IMAGE,
            ...CANCEL_EDIT,
          ]),
        ];
      }

      const title = tempData.productTitle!;
      await prisma.tenantProduct.create({
        data: {
          tenantId: activeTenant.id,
          title: title.slice(0, 100),
          price: tempData.productPrice ?? undefined,
          imageUrl,
        },
      });
      return finishEdit(phone, slug, `Produto "${title}" adicionado!`);
    }

    case ChatStates.EDITING_DELETE_PRODUCT: {
      if (message.type === "interactive" && message.buttonId?.startsWith("del_prod_")) {
        const productId = Number.parseInt(message.buttonId.replace("del_prod_", ""), 10);
        const product = activeTenant.products.find((p) => p.id === productId);
        if (!product) {
          return [textMessage("Oferta não encontrada."), editMenuMessage(slug, activeTenant)];
        }
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: {
            currentState: ChatStates.EDITING_DELETE_PRODUCT_CONFIRM,
            tempData: { ...tempData, productIdToDelete: productId },
          },
        });
        const label = product.price ? `${product.title} (${product.price})` : product.title;
        return [
          buttonsMessage(`Remover "${label}" do site?`, [
            ...CONFIRM_DELETE_PRODUCT,
            ...CANCEL_EDIT,
          ]),
        ];
      }
      if (menuTrigger(message)) {
        return [editMenuMessage(slug, activeTenant)];
      }
      if (!activeTenant.products.length) {
        return [textMessage("Nenhuma oferta para remover."), editMenuMessage(slug, activeTenant)];
      }
      return [
        textMessage("Toque em *Ver ofertas* e escolha qual remover."),
        productDeleteListMessage(activeTenant.products),
      ];
    }

    case ChatStates.EDITING_DELETE_PRODUCT_CONFIRM: {
      if (message.type === "interactive" && message.buttonId === "confirm_delete_product") {
        const productId = tempData.productIdToDelete;
        if (!productId) {
          return cancelEdit(phone, slug);
        }
        const product = activeTenant.products.find((p) => p.id === productId);
        const deleted = await prisma.tenantProduct.deleteMany({
          where: { id: productId, tenantId: activeTenant.id },
        });
        if (!deleted.count) {
          return [textMessage("Oferta não encontrada ou já foi removida."), editMenuMessage(slug, activeTenant)];
        }
        const name = product?.title ?? "Oferta";
        return finishEdit(phone, slug, `"${name}" removida!`);
      }
      return [
        buttonsMessage('Toque em "Sim, remover" para confirmar.', [
          ...CONFIRM_DELETE_PRODUCT,
          ...CANCEL_EDIT,
        ]),
      ];
    }

    case ChatStates.EDITING_YOUTUBE: {
      let youtubeUrl: string | null = null;
      if (message.type === "interactive" && message.buttonId === "skip_youtube") {
        youtubeUrl = null;
      } else if (message.type === "text" && message.text?.trim()) {
        youtubeUrl = message.text.trim();
      } else {
        return [
          buttonsMessage("Envie o link ou toque em Pular.", [...SKIP_YOUTUBE, ...CANCEL_EDIT]),
        ];
      }
      await prisma.tenant.update({
        where: { id: activeTenant.id },
        data: { youtubeUrl: youtubeUrl ?? null },
      });
      return finishEdit(phone, slug, youtubeUrl ? "Link do YouTube atualizado!" : "YouTube removido.");
    }

    case ChatStates.EDITING_INSTAGRAM: {
      if (message.type === "interactive" && message.buttonId === "skip_instagram") {
        await prisma.tenant.update({
          where: { id: activeTenant.id },
          data: { instagramUrl: null },
        });
        return finishEdit(phone, slug, "Instagram removido.");
      }
      if (message.type !== "text" || !message.text?.trim()) {
        return [
          buttonsMessage(
            "Envie o @usuario ou link do Instagram, ou toque em Remover.",
            [...SKIP_INSTAGRAM, ...CANCEL_EDIT]
          ),
        ];
      }
      const instagramUrl = normalizeInstagramUrl(message.text.trim());
      if (!instagramUrl) {
        return [
          textMessage("Não reconheci esse Instagram. Envie @usuario ou o link completo do perfil."),
        ];
      }
      await prisma.tenant.update({
        where: { id: activeTenant.id },
        data: { instagramUrl },
      });
      return finishEdit(phone, slug, "Instagram atualizado!");
    }

    case ChatStates.MARKETING_PICK_IMAGE: {
      if (message.type !== "interactive" || !message.buttonId?.startsWith("mkt_img_")) {
        return [textMessage("Toque em *Ver imagens* e escolha uma, ou envie *cancelar*.")];
      }

      if (message.buttonId === "mkt_img_next") {
        const nextPage = (tempData.marketingImagePage ?? 0) + 1;
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { tempData: { ...tempData, marketingImagePage: nextPage } },
        });
        const picker = marketingPhotoPickerMessage(tenant, nextPage);
        return picker ? [picker] : [textMessage("Não há mais imagens.")];
      }

      if (message.buttonId === "mkt_img_prev") {
        const prevPage = Math.max(0, (tempData.marketingImagePage ?? 0) - 1);
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { tempData: { ...tempData, marketingImagePage: prevPage } },
        });
        const picker = marketingPhotoPickerMessage(tenant, prevPage);
        return picker ? [picker] : [textMessage("Não há imagens anteriores.")];
      }

      const image = resolveMarketingImage(message.buttonId, tenant);
      if (!image) return [textMessage("Imagem inválida. Tente de novo.")];
      return beginMarketingTopicFlow(phone, "post", tenant, {
        marketingKind: "post",
        marketingImageUrl: image.url,
        marketingImageLabel: image.label,
        marketingImagePage: 0,
      });
    }

    case ChatStates.MARKETING_PICK_TOPIC: {
      if (message.type !== "interactive" || !message.buttonId?.startsWith("mkt_topic_")) {
        return [textMessage("Toque em *Ver assuntos* e escolha o tema, ou envie *cancelar*.")];
      }
      const topic = resolveMarketingTopic(message.buttonId, tenant);
      if (!topic) return [textMessage("Assunto inválido. Tente de novo.")];
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          tempData: {
            ...tempData,
            marketingTopicKey: topic.topicKey,
            marketingTopicLabel: topic.topicLabel,
            marketingProductTitle: topic.productTitle,
            marketingProductPrice: topic.productPrice,
          },
        },
      });
      const merged = {
        ...tempData,
        marketingTopicKey: topic.topicKey,
        marketingTopicLabel: topic.topicLabel,
        marketingProductTitle: topic.productTitle,
        marketingProductPrice: topic.productPrice,
      };
      return generateAndDeliverMarketing(phone, tenant, merged);
    }

    case ChatStates.MARKETING_TAGLINE_CONFIRM: {
      if (message.type === "interactive" && message.buttonId === "apply_tagline") {
        const line = tempData.suggestedTagline?.trim();
        if (!line) return cancelEdit(phone, slug);
        await prisma.tenant.update({
          where: { id: activeTenant.id },
          data: { tagline: line },
        });
        return finishEdit(phone, slug, "Gancho publicado no site! 🎉");
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.CONFIRMED, tempData: {} },
      });
      return [textMessage("Beleza! O texto ficou só com você."), editMenuMessage(slug, activeTenant)];
    }

    default:
      return [editMenuMessage(slug, activeTenant)];
  }
}
