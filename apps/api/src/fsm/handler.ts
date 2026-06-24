import { prisma } from "@iaesmartguide/db";
import type { TempData } from "../fsm/states.js";
import { ChatStates } from "../fsm/states.js";
import { persistWhatsAppImage, resolveMediaUrl, resolveMediaUrls } from "../services/media.js";
import { revalidateTenant } from "../services/revalidate.js";
import { slugify } from "../utils/slugify.js";

interface IncomingMessage {
  from: string;
  type: "text" | "image" | "interactive";
  text?: string;
  imageId?: string;
  buttonId?: string;
}

export async function handleWhatsAppMessage(message: IncomingMessage): Promise<string[]> {
  const replies: string[] = [];
  const phone = message.from;

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
        if (tenant.slug) {
          await prisma.chatState.update({
            where: { whatsappNumber: phone },
            data: { currentState: ChatStates.CONFIRMED },
          });
          replies.push(
            `Olá! Seu site já está ativo em https://${tenant.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br"}. Envie uma mensagem para atualizar produtos ou fotos.`
          );
        } else {
          await prisma.chatState.update({
            where: { whatsappNumber: phone },
            data: { currentState: ChatStates.COLLECTING_NAME },
          });
          replies.push("Pagamento confirmado! Digite o nome comercial do seu local (Ex: Adega do Toninho).");
        }
      } else {
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { currentState: ChatStates.WAITING_PAYMENT },
        });
        replies.push(
          "Bem-vindo ao IAE Smart Guide! Crie seu mini-site institucional em minutos. O link de pagamento será enviado em breve."
        );
      }
      break;
    }

    case ChatStates.COLLECTING_NAME: {
      if (message.type !== "text" || !message.text?.trim()) {
        replies.push("Por favor, envie o nome comercial em texto.");
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
      replies.push(`Ótimo! Agora envie a imagem do logotipo de "${businessName}".`);
      break;
    }

    case ChatStates.COLLECTING_LOGO: {
      if (message.type !== "image" || !message.imageId) {
        replies.push("Envie uma imagem para o logotipo.");
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
        replies.push("Logo recebido! Envie até 5 fotos do local. Quando terminar, toque em ➡️ Avançar.");
      } catch (error) {
        console.error("[FSM logo upload]", error);
        replies.push("Não consegui salvar o logo. Tente enviar a imagem novamente.");
      }
      break;
    }

    case ChatStates.COLLECTING_PHOTOS: {
      if (message.type === "interactive" && message.buttonId === "advance_photos") {
        await prisma.chatState.update({
          where: { whatsappNumber: phone },
          data: { currentState: ChatStates.COLLECTING_YOUTUBE },
        });
        replies.push("Envie o link do YouTube (opcional) ou toque em Pular.");
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
            `Foto ${photos.length}/5 recebida. Envie mais ou toque em ➡️ Avançar para Próxima Etapa.`
          );
        } catch (error) {
          console.error("[FSM photo upload]", error);
          replies.push("Não consegui salvar a foto. Tente enviar novamente.");
        }
        break;
      }
      replies.push("Envie fotos ou toque no botão para avançar.");
      break;
    }

    case ChatStates.COLLECTING_YOUTUBE: {
      if (message.type === "interactive" && message.buttonId === "skip_youtube") {
        tempData.youtubeUrl = null;
      } else if (message.type === "text") {
        tempData.youtubeUrl = message.text?.trim() ?? null;
      } else {
        replies.push("Envie o link do YouTube ou toque em Pular.");
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
          isPublished: false,
        },
        update: {
          businessName,
          slug,
          logoUrl,
          youtubeUrl: tempData.youtubeUrl ?? undefined,
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

      const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br";
      replies.push(`Seu site está pronto! Acesse: https://${slug}.${domain}`);
      break;
    }

    case ChatStates.CONFIRMED:
    case ChatStates.EDITING: {
      replies.push("Atualizações via IA serão implementadas na Fase 5. Use o painel web por enquanto.");
      break;
    }

    default:
      replies.push("Não entendi. Envie 'Oi' para recomeçar.");
  }

  return replies;
}
