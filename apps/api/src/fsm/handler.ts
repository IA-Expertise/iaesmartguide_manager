import { prisma } from "@iaesmartguide/db";
import type { TempData } from "../fsm/states.js";
import { ChatStates } from "../fsm/states.js";
import { persistWhatsAppImage, resolveMediaUrl, resolveMediaUrls } from "../services/media.js";
import { revalidateTenant } from "../services/revalidate.js";
import {
  buttonsMessage,
  textMessage,
  type WhatsAppOutbound,
} from "../services/whatsapp-send.js";
import { isPlaceholderSlug } from "../utils/phone.js";
import { slugify } from "../utils/slugify.js";
import { config } from "../config.js";

interface IncomingMessage {
  from: string;
  type: "text" | "image" | "interactive";
  text?: string;
  imageId?: string;
  buttonId?: string;
}

const ADVANCE_PHOTOS = [{ id: "advance_photos", title: "Avançar" }];
const SKIP_YOUTUBE = [{ id: "skip_youtube", title: "Pular" }];

export async function handleWhatsAppMessage(message: IncomingMessage): Promise<WhatsAppOutbound[]> {
  const replies: WhatsAppOutbound[] = [];
  const phone = message.from;
  const domain = config.rootDomain;

  let state = await prisma.chatState.findUnique({ where: { whatsappNumber: phone } });
  const tenant = await prisma.tenant.findUnique({ where: { whatsappNumber: phone } });

  if (!state) {
    state = await prisma.chatState.create({
      data: {
        whatsappNumber: phone,
        currentState: ChatStates.START,
        tempData: {},
      },
    });
  }

  const currentState = state.currentState;
  const tempData = (state.tempData ?? {}) as TempData;

  switch (currentState) {
    case ChatStates.START: {
      if (tenant?.paymentStatus === "paid") {
        if (!isPlaceholderSlug(tenant.slug)) {
          await prisma.chatState.update({
            where: { whatsappNumber: phone },
            data: { currentState: ChatStates.CONFIRMED },
          });
          replies.push(
            textMessage(
              `Olá! Seu site já está ativo em https://${tenant!.slug}.${domain}. Envie uma mensagem para atualizar produtos ou fotos.`
            )
          );
        } else {
          await prisma.chatState.update({
            where: { whatsappNumber: phone },
            data: { currentState: ChatStates.COLLECTING_NAME },
          });
          replies.push(
            textMessage(
              "Pagamento confirmado! Digite o nome comercial do seu local (Ex: Adega do Toninho)."
            )
          );
        }
      } else {
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { currentState: ChatStates.WAITING_PAYMENT },
        });
        replies.push(
          textMessage(
            "Bem-vindo ao IAE Smart Guide! Crie seu mini-site institucional em minutos. O link de pagamento será enviado em breve."
          )
        );
      }
      break;
    }

    case ChatStates.WAITING_PAYMENT: {
      replies.push(
        textMessage(
          "Aguardando confirmação do pagamento. Assim que for aprovado, você poderá montar seu site por aqui."
        )
      );
      break;
    }

    case ChatStates.COLLECTING_NAME: {
      if (message.type !== "text" || !message.text?.trim()) {
        replies.push(textMessage("Por favor, envie o nome comercial em texto."));
        break;
      }
      const businessName = message.text.trim();
      const baseSlug = slugify(businessName);
      let slug = baseSlug;
      let suffix = 1;
      while (await prisma.tenant.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${suffix++}`;
      }
      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: {
          currentState: ChatStates.COLLECTING_LOGO,
          tempData: { ...tempData, businessName, slug },
        },
      });
      replies.push(textMessage(`Ótimo! Agora envie a imagem do logotipo de "${businessName}".`));
      break;
    }

    case ChatStates.COLLECTING_LOGO: {
      if (message.type !== "image" || !message.imageId) {
        replies.push(textMessage("Envie uma imagem para o logotipo."));
        break;
      }
      const slug = tempData.slug!;
      try {
        const logoUrl = await persistWhatsAppImage(message.imageId, slug, "logo");
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: {
            currentState: ChatStates.COLLECTING_PHOTOS,
            tempData: { ...tempData, logoUrl, photos: [] },
          },
        });
        replies.push(
          buttonsMessage(
            "Logo recebido! Envie até 5 fotos do local. Quando terminar, toque em Avançar.",
            ADVANCE_PHOTOS
          )
        );
      } catch (error) {
        console.error("[FSM logo upload]", error);
        replies.push(textMessage("Não consegui salvar o logo. Tente enviar a imagem novamente."));
      }
      break;
    }

    case ChatStates.COLLECTING_PHOTOS: {
      if (message.type === "interactive" && message.buttonId === "advance_photos") {
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { currentState: ChatStates.COLLECTING_YOUTUBE },
        });
        replies.push(
          buttonsMessage(
            "Envie o link do YouTube (opcional) ou toque em Pular.",
            SKIP_YOUTUBE
          )
        );
        break;
      }
      if (message.type === "image" && message.imageId) {
        try {
          const photoUrl = await persistWhatsAppImage(message.imageId, tempData.slug!, "photo");
          const photos = [...(tempData.photos ?? []), photoUrl].slice(0, 5);
          await prisma.chatState.update({
            where: { whatsappNumber: phone },
            data: { tempData: { ...tempData, photos } },
          });
          replies.push(
            buttonsMessage(
              `Foto ${photos.length}/5 recebida. Envie mais ou toque em Avançar.`,
              ADVANCE_PHOTOS
            )
          );
        } catch (error) {
          console.error("[FSM photo upload]", error);
          replies.push(textMessage("Não consegui salvar a foto. Tente enviar novamente."));
        }
        break;
      }
      replies.push(
        buttonsMessage(
          "Envie fotos ou toque em Avançar para a próxima etapa.",
          ADVANCE_PHOTOS
        )
      );
      break;
    }

    case ChatStates.COLLECTING_YOUTUBE: {
      if (message.type === "interactive" && message.buttonId === "skip_youtube") {
        tempData.youtubeUrl = null;
      } else if (message.type === "text") {
        tempData.youtubeUrl = message.text?.trim() ?? null;
      } else {
        replies.push(
          buttonsMessage(
            "Envie o link do YouTube ou toque em Pular.",
            SKIP_YOUTUBE
          )
        );
        break;
      }

      const slug = tempData.slug!;
      const businessName = tempData.businessName!;

      let logoUrl = tempData.logoUrl;
      if (logoUrl) {
        logoUrl = await resolveMediaUrl(logoUrl, slug, "logo");
      }
      const photos = tempData.photos?.length
        ? await resolveMediaUrls(tempData.photos, slug)
        : [];

      const saved = await prisma.tenant.upsert({
        where: { whatsappNumber: phone },
        create: {
          whatsappNumber: phone,
          ownerName: businessName,
          businessName,
          slug,
          logoUrl,
          youtubeUrl: tempData.youtubeUrl ?? undefined,
          paymentStatus: "paid",
          isPublished: true,
        },
        update: {
          businessName,
          slug,
          logoUrl,
          youtubeUrl: tempData.youtubeUrl ?? undefined,
          isPublished: true,
        },
      });

      if (photos.length) {
        await prisma.tenantPhoto.deleteMany({ where: { tenantId: saved.id } });
        await prisma.tenantPhoto.createMany({
          data: photos.map((photoUrl) => ({ tenantId: saved.id, photoUrl })),
        });
      }

      await revalidateTenant(slug);

      await prisma.chatState.update({
        where: { whatsappNumber: phone },
        data: { currentState: ChatStates.CONFIRMED, tempData: {} },
      });

      replies.push(textMessage(`Seu site está pronto! Acesse: https://${slug}.${domain}`));
      break;
    }

    case ChatStates.CONFIRMED:
    case ChatStates.EDITING: {
      replies.push(
        textMessage(
          "Atualizações via IA serão implementadas em breve. Use o painel web por enquanto."
        )
      );
      break;
    }

    default:
      replies.push(textMessage("Não entendi. Envie qualquer mensagem para recomeçar."));
  }

  return replies;
}
