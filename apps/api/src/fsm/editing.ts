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
  generateMarketingCopy,
  geminiUnavailableMessage,
  isGeminiConfigured,
  isMarketingAction,
  marketingKindFromAction,
  marketingMenuMessage,
  splitWhatsAppMessages,
  type MarketingKind,
} from "../services/lia-marketing.js";
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
  ChatStates.MARKETING_TAGLINE_CONFIRM,
]);

export function isEditingState(state: string): boolean {
  return EDIT_STATES.has(state);
}

export function editMenuMessage(slug: string): WhatsAppOutbound {
  const domain = config.rootDomain;
  return listMessage(
    `Seu site: https://${slug}.${domain}\n\nEscolha o que deseja atualizar:`,
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
          { id: "lia_kit", title: "Kit completo", description: "Status, grupo, Insta e bio" },
          { id: "lia_status", title: "Status WhatsApp", description: "Texto pro Status" },
          { id: "lia_instagram", title: "Legenda Instagram", description: "Post com hashtags" },
          { id: "open_divulgar", title: "Mais opções", description: "Grupo, bio, gancho..." },
        ],
      },
    ]
  );
}

const MARKETING_LABELS: Record<MarketingKind, string> = {
  kit: "Kit de divulgação",
  status: "Status WhatsApp",
  instagram: "Legenda Instagram",
  grupo: "Grupo de turismo",
  bio: "Bio Instagram",
  tagline: "Gancho do site",
};

async function runMarketingAction(
  phone: string,
  actionId: string,
  tenant: NonNullable<Awaited<ReturnType<typeof loadTenant>>>
): Promise<WhatsAppOutbound[]> {
  const slug = tenant.slug;
  const kind = marketingKindFromAction(actionId);

  if (actionId === "open_divulgar") {
    return [marketingMenuMessage()];
  }

  if (!kind) return [textMessage("Opção inválida."), editMenuMessage(slug)];

  if (!isGeminiConfigured()) {
    return [geminiUnavailableMessage(), editMenuMessage(slug)];
  }

  try {
    const copy = await generateMarketingCopy(kind, tenant, config.rootDomain);

    if (kind === "tagline") {
      const line = copy.replace(/^["']|["']$/g, "").trim();
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          currentState: ChatStates.MARKETING_TAGLINE_CONFIRM,
          tempData: { suggestedTagline: line },
        },
      });
      return [
        textMessage(`✨ *Sugestão de gancho:*\n\n${line}`),
        buttonsMessage("Quer colocar isso no topo do site?", [...APPLY_TAGLINE, ...CANCEL_EDIT]),
      ];
    }

    const chunks = splitWhatsAppMessages(copy);
    return [
      textMessage(`✨ *${MARKETING_LABELS[kind]}* — copie e cole:\n`),
      ...chunks.map((chunk) => textMessage(chunk)),
      textMessage("Gostou? Envie *divulgar* para gerar outro texto."),
      editMenuMessage(slug),
    ];
  } catch (error) {
    console.error("[Lia marketing]", error);
    return [
      textMessage("Ops, não consegui gerar agora 😅 Tenta de novo em alguns segundos."),
      editMenuMessage(slug),
    ];
  }
}

async function finishEdit(
  phone: string,
  slug: string,
  successText: string
): Promise<WhatsAppOutbound[]> {
  await revalidateTenant(slug);
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { currentState: ChatStates.CONFIRMED, tempData: {} },
  });
  return [textMessage(`${successText}\n\nAlterações publicadas no site.`), editMenuMessage(slug)];
}

async function cancelEdit(phone: string, slug: string): Promise<WhatsAppOutbound[]> {
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { currentState: ChatStates.CONFIRMED, tempData: {} },
  });
  return [textMessage("Edição cancelada."), editMenuMessage(slug)];
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
    include: { products: { orderBy: { createdAt: "desc" }, take: 20 } },
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
    case "add_product":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_PRODUCT_TITLE, tempData: {} },
      });
      return [buttonsMessage("Qual o nome do produto ou oferta?", CANCEL_EDIT)];
    case "delete_product": {
      const withProducts = await loadTenant(phone);
      if (!withProducts?.products.length) {
        return [
          textMessage("Você ainda não tem ofertas cadastradas."),
          editMenuMessage(slug),
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

  const slug = tenant.slug;

  if (isCancel(message)) {
    return cancelEdit(phone, slug);
  }

  if (currentState === ChatStates.CONFIRMED || currentState === ChatStates.EDITING) {
    if (message.type === "interactive" && message.buttonId) {
      const action = await handleMenuAction(phone, message.buttonId, slug);
      if (action) return action;
    }
    if (isDivulgarTrigger(message)) {
      return [marketingMenuMessage()];
    }
    if (menuTrigger(message)) {
      return [editMenuMessage(slug)];
    }
    return [
      textMessage("Toque em *Ver opções* no menu ou envie *menu* para editar seu site."),
      editMenuMessage(slug),
    ];
  }

  switch (currentState) {
    case ChatStates.EDITING_DESCRIPTION: {
      if (message.type !== "text" || !message.text?.trim()) {
        return [textMessage("Envie a descrição em texto.")];
      }
      const description = message.text.trim();
      await prisma.tenant.update({
        where: { id: tenant.id },
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
        where: { id: tenant.id },
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
          where: { id: tenant.id },
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
        await prisma.tenantPhoto.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.tenantPhoto.createMany({
          data: resolved.map((photoUrl) => ({ tenantId: tenant.id, photoUrl })),
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
          tenantId: tenant.id,
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
        const product = tenant.products.find((p) => p.id === productId);
        if (!product) {
          return [textMessage("Oferta não encontrada."), editMenuMessage(slug)];
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
        return [editMenuMessage(slug)];
      }
      if (!tenant.products.length) {
        return [textMessage("Nenhuma oferta para remover."), editMenuMessage(slug)];
      }
      return [
        textMessage("Toque em *Ver ofertas* e escolha qual remover."),
        productDeleteListMessage(tenant.products),
      ];
    }

    case ChatStates.EDITING_DELETE_PRODUCT_CONFIRM: {
      if (message.type === "interactive" && message.buttonId === "confirm_delete_product") {
        const productId = tempData.productIdToDelete;
        if (!productId) {
          return cancelEdit(phone, slug);
        }
        const product = tenant.products.find((p) => p.id === productId);
        const deleted = await prisma.tenantProduct.deleteMany({
          where: { id: productId, tenantId: tenant.id },
        });
        if (!deleted.count) {
          return [textMessage("Oferta não encontrada ou já foi removida."), editMenuMessage(slug)];
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
        where: { id: tenant.id },
        data: { youtubeUrl: youtubeUrl ?? null },
      });
      return finishEdit(phone, slug, youtubeUrl ? "Link do YouTube atualizado!" : "YouTube removido.");
    }

    case ChatStates.EDITING_INSTAGRAM: {
      if (message.type === "interactive" && message.buttonId === "skip_instagram") {
        await prisma.tenant.update({
          where: { id: tenant.id },
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
        where: { id: tenant.id },
        data: { instagramUrl },
      });
      return finishEdit(phone, slug, "Instagram atualizado!");
    }

    case ChatStates.MARKETING_TAGLINE_CONFIRM: {
      if (message.type === "interactive" && message.buttonId === "apply_tagline") {
        const line = tempData.suggestedTagline?.trim();
        if (!line) return cancelEdit(phone, slug);
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { tagline: line },
        });
        return finishEdit(phone, slug, "Gancho publicado no site! 🎉");
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.CONFIRMED, tempData: {} },
      });
      return [textMessage("Beleza! O texto ficou só com você."), editMenuMessage(slug)];
    }

    default:
      return [editMenuMessage(slug)];
  }
}
