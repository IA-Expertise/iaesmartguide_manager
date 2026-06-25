import type { Request } from "express";
import { Router } from "express";
import { config } from "../config.js";
import { handleWhatsAppMessage } from "../fsm/handler.js";
import {
  deliverOutbound,
  sendWhatsAppText,
  textMessage,
} from "../services/whatsapp-send.js";
import {
  isGeminiConfigured,
  marketingKindFromAction,
} from "../services/lia-marketing.js";
import { enqueueForPhone } from "../lib/whatsapp-queue.js";
import { isDuplicateWebhookMessage } from "../lib/whatsapp-dedup.js";
import { canonicalBrazilWhatsApp } from "../utils/phone.js";

export const whatsappRouter = Router();

const HANDLER_TIMEOUT_MS = 55_000;

function isMarketingGenerateAction(
  incoming: Parameters<typeof handleWhatsAppMessage>[0]
): boolean {
  if (incoming.type !== "interactive" || !incoming.buttonId?.startsWith("lia_")) {
    return false;
  }
  if (incoming.buttonId === "open_divulgar") return false;
  return Boolean(marketingKindFromAction(incoming.buttonId));
}

function withHandlerTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("HANDLER_TIMEOUT")), ms);
    fn()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isForwardAuthorized(req: Request): boolean {
  if (!config.whatsapp.forwardSecret) return true;
  const header = req.headers["x-webhook-forward-secret"];
  return header === config.whatsapp.forwardSecret;
}

function isForThisPhoneNumber(value: Record<string, unknown> | undefined): boolean {
  const expectedId = config.whatsapp.phoneNumberId;
  if (!expectedId) return true;

  const metadata = value?.metadata as { phone_number_id?: string } | undefined;
  const incomingId = metadata?.phone_number_id;
  if (!incomingId) return true;

  return incomingId === expectedId;
}

whatsappRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsapp.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

whatsappRouter.post("/", async (req, res) => {
  res.sendStatus(200);

  if (!isForwardAuthorized(req)) {
    console.warn("[WhatsApp] POST rejeitado — forward secret inválido");
    return;
  }

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!isForThisPhoneNumber(value)) {
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    const messageId = message.id as string | undefined;
    if (isDuplicateWebhookMessage(messageId)) {
      console.log(`[WhatsApp] webhook duplicado ignorado: ${messageId}`);
      return;
    }

    const from = message.from as string;
    const canonical = canonicalBrazilWhatsApp(from);
    console.log(
      `[WhatsApp] from=${from} canonical=${canonical} id=${messageId ?? "?"} phone_number_id=${value?.metadata?.phone_number_id ?? "?"}`
    );
    let incoming: Parameters<typeof handleWhatsAppMessage>[0];

    if (message.type === "text") {
      incoming = { from, type: "text", text: message.text?.body };
    } else if (message.type === "image") {
      incoming = { from, type: "image", imageId: message.image?.id };
    } else if (message.type === "sticker") {
      incoming = { from, type: "image", imageId: message.sticker?.id };
    } else if (message.type === "document") {
      const mime = (message.document?.mime_type as string | undefined) ?? "";
      const filename = (message.document?.filename as string | undefined) ?? "";
      const isImageDoc =
        mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename);
      if (!isImageDoc) return;
      incoming = { from, type: "image", imageId: message.document?.id };
    } else if (message.type === "interactive") {
      const buttonId =
        message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
      incoming = { from, type: "interactive", buttonId };
    } else {
      return;
    }

    await enqueueForPhone(canonical, async () => {
      try {
        if (isMarketingGenerateAction(incoming) && isGeminiConfigured()) {
          await sendWhatsAppText(from, "⏳ Gerando seu texto com IA... só um instante!");
        }

        const replies = await withHandlerTimeout(
          () => handleWhatsAppMessage(incoming),
          HANDLER_TIMEOUT_MS
        );

        if (replies.length) {
          await deliverOutbound(from, replies);
        }
      } catch (error) {
        console.error("[WhatsApp handler]", error);
        try {
          const body =
            error instanceof Error && error.message === "HANDLER_TIMEOUT"
              ? "Demorei demais pra gerar o texto ⏳ Tenta de novo — se persistir, envie *menu*."
              : "Algo deu errado por aqui 😅 Envie *menu* para tentar de novo.";
          await deliverOutbound(from, [textMessage(body)]);
        } catch (sendError) {
          console.error("[WhatsApp] falha ao enviar mensagem de erro", sendError);
        }
      }
    });
  } catch (error) {
    console.error("[WhatsApp webhook]", error);
  }
});
