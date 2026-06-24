import { Router } from "express";
import { config } from "../config.js";
import { handleWhatsAppMessage } from "../fsm/handler.js";
import { deliverOutbound } from "../services/whatsapp-send.js";

export const whatsappRouter = Router();

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

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const from = message.from as string;
    let incoming: Parameters<typeof handleWhatsAppMessage>[0];

    if (message.type === "text") {
      incoming = { from, type: "text", text: message.text?.body };
    } else if (message.type === "image") {
      incoming = { from, type: "image", imageId: message.image?.id };
    } else if (message.type === "interactive") {
      const buttonId =
        message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
      incoming = { from, type: "interactive", buttonId };
    } else {
      return;
    }

    const replies = await handleWhatsAppMessage(incoming);
    if (replies.length) {
      await deliverOutbound(from, replies);
    }
  } catch (error) {
    console.error("[WhatsApp webhook]", error);
  }
});
