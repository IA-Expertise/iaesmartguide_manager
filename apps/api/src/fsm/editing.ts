import { prisma } from "@iaesmartguide/db";
import type { TempData } from "./states.js";
import { ChatStates } from "./states.js";
import { persistWhatsAppImage, resolveMediaUrls } from "../services/media.js";
import { revalidateTenant } from "../services/revalidate.js";
import { taglineFromDescription } from "../utils/tagline.js";
import { findTenantByWhatsApp } from "../lib/whatsapp-db.js";
import { appendPhotoToChatState, MAX_GALLERY_PHOTOS } from "../lib/chat-photos.js";
import {
  buttonsMessage,
  listMessage,
  textMessage,
  type WhatsAppOutbound,
} from "../services/whatsapp-send.js";
import { config } from "../config.js";
import type { IncomingMessage } from "./types.js";

const ADVANCE_PHOTOS = [{ id: "advance_photos", title: "Avançar" }];
const SKIP_YOUTUBE = [{ id: "skip_youtube", title: "Pular" }];
const SKIP_PRODUCT_PRICE = [{ id: "skip_product_price", title: "Sem preço" }];
const SKIP_PRODUCT_IMAGE = [{ id: "skip_product_image", title: "Sem foto" }];
const CANCEL_EDIT = [{ id: "cancel_edit", title: "Cancelar" }];

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
  ChatStates.EDITING_YOUTUBE,
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
        ],
      },
    ]
  );
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
  return t === "" || t === "menu" || t === "oi" || t === "olá" || t === "ola" || t === "ajuda";
}

async function loadTenant(phone: string) {
  const base = await findTenantByWhatsApp(prisma, phone);
  if (!base) return null;
  return prisma.tenant.findUnique({
    where: { id: base.id },
    include: { products: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

async function handleMenuAction(
  phone: string,
  actionId: string,
  slug: string
): Promise<WhatsAppOutbound[] | null> {
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
    case "edit_youtube":
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.EDITING_YOUTUBE, tempData: {} },
      });
      return [
        buttonsMessage("Envie o link do YouTube ou toque em Pular.", [...SKIP_YOUTUBE, ...CANCEL_EDIT]),
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

    default:
      return [editMenuMessage(slug)];
  }
}
