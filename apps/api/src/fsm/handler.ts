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
import { ensureChatStateForWhatsApp, findTenantByWhatsApp } from "../lib/whatsapp-db.js";
import { appendPhotoToChatState, MAX_GALLERY_PHOTOS } from "../lib/chat-photos.js";
import { slugify } from "../utils/slugify.js";
import { config } from "../config.js";
import { editMenuMessage, handleEditingMessage, isEditingState } from "./editing.js";
import { isPremium, isOnPremiumTrial, onboardingWelcomeMessages, trialWelcomeMessages, computePremiumTrialUntil } from "../services/plan.js";
import type { IncomingMessage } from "./types.js";

export type { IncomingMessage } from "./types.js";

const ADVANCE_PHOTOS = [{ id: "advance_photos", title: "Avançar" }];
const SKIP_YOUTUBE = [{ id: "skip_youtube", title: "Pular" }];

function canStartOnboarding(tenant: Awaited<ReturnType<typeof findTenantByWhatsApp>>): boolean {
  if (!config.whatsapp.requirePayment) return true;
  return Boolean(tenant && isPremium(tenant));
}

async function beginOnboarding(
  phone: string,
  tenant: Awaited<ReturnType<typeof findTenantByWhatsApp>>,
  domain: string
): Promise<WhatsAppOutbound[]> {
  if (tenant && !isPlaceholderSlug(tenant.slug)) {
    await prisma.chatState.update({
      where: { whatsappNumber: phone },
      data: { currentState: ChatStates.CONFIRMED },
    });
    return [
      textMessage(`Olá! Seu site está ativo em https://${tenant.slug}.${domain}.`),
      editMenuMessage(tenant.slug, tenant),
    ];
  }

  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { currentState: ChatStates.COLLECTING_NAME },
  });

  const intro = config.whatsapp.requirePayment
    ? "Pagamento confirmado! Digite o nome comercial do seu local (Ex: Adega do Toninho)."
    : "Bem-vindo ao IAE Smart Guide! Digite o nome comercial do seu local (Ex: Adega do Toninho).";

  return [textMessage(intro)];
}

export async function handleWhatsAppMessage(message: IncomingMessage): Promise<WhatsAppOutbound[]> {
  const replies: WhatsAppOutbound[] = [];
  const domain = config.rootDomain;

  const { state, phone } = await ensureChatStateForWhatsApp(prisma, message.from);
  const tenant = await findTenantByWhatsApp(prisma, message.from);

  const currentState = state.currentState;
  const tempData = (state.tempData ?? {}) as TempData;

  console.log(
    `[FSM] from=${message.from} phone=${phone} state=${currentState} payment=${tenant?.paymentStatus ?? "none"} requirePayment=${config.whatsapp.requirePayment}`
  );

  switch (currentState) {
    case ChatStates.START: {
      if (canStartOnboarding(tenant)) {
        replies.push(...(await beginOnboarding(phone, tenant, domain)));
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
      const freshTenant = await findTenantByWhatsApp(prisma, phone);
      if (canStartOnboarding(freshTenant)) {
        replies.push(...(await beginOnboarding(phone, freshTenant, domain)));
      } else {
        replies.push(
          textMessage(
            "Aguardando confirmação do pagamento. Assim que for aprovado, você poderá montar seu site por aqui."
          )
        );
      }
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
      replies.push(textMessage(`Ótimo! Agora envie o logotipo de "${businessName}".\n\nDica: para PNG transparente, envie como *documento* (ícone 📎), não como foto.`));
      break;
    }

    case ChatStates.COLLECTING_LOGO: {
      if (message.type !== "image" || !message.imageId) {
        replies.push(
          textMessage(
            "Envie o logotipo como imagem ou documento (📎). Para PNG transparente, use *documento* — fotos pelo WhatsApp perdem transparência."
          )
        );
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
          const { photos, added, atCapacity } = await appendPhotoToChatState(phone, photoUrl);
          if (!added && atCapacity) {
            replies.push(
              buttonsMessage(
                `Galeria completa (${MAX_GALLERY_PHOTOS}/${MAX_GALLERY_PHOTOS}). Toque em Avançar.`,
                ADVANCE_PHOTOS
              )
            );
            break;
          }
          if (!added) break;
          replies.push(
            buttonsMessage(
              `Foto ${photos.length}/${MAX_GALLERY_PHOTOS} recebida. Envie mais ou toque em Avançar.`,
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
          plan: "free",
          paymentStatus: "active",
          premiumTrialUntil: computePremiumTrialUntil(),
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
      if (isOnPremiumTrial(saved)) {
        for (const msg of trialWelcomeMessages()) {
          replies.push(textMessage(msg));
        }
      } else if (isPremium(saved)) {
        replies.push(
          textMessage(
            "Dica da Lia: envie *divulgar* que eu monto textos pra Status, Instagram e grupos com IA ✨"
          )
        );
      } else {
        for (const msg of onboardingWelcomeMessages()) {
          replies.push(textMessage(msg));
        }
      }
      replies.push(editMenuMessage(slug, saved));
      break;
    }

    default: {
      if (isEditingState(currentState)) {
        replies.push(...(await handleEditingMessage(message, phone, currentState, tempData)));
        break;
      }
      replies.push(textMessage("Não entendi. Envie *menu* para ver as opções."));
    }
  }

  return replies;
}
