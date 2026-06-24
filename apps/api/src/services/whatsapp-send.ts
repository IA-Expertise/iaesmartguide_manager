import { config } from "../config.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export type WhatsAppOutbound =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Array<{ id: string; title: string }> };

export function isWhatsAppConfigured(): boolean {
  return Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
}

export function textMessage(body: string): WhatsAppOutbound {
  return { type: "text", body };
}

export function buttonsMessage(
  body: string,
  buttons: Array<{ id: string; title: string }>
): WhatsAppOutbound {
  return { type: "buttons", body, buttons };
}

async function sendPayload(to: string, message: Record<string, unknown>): Promise<void> {
  const phoneNumberId = config.whatsapp.phoneNumberId;
  const token = config.whatsapp.token;

  if (!phoneNumberId || !token) {
    console.warn("[WhatsApp] credenciais ausentes — mensagem não enviada");
    return;
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...message,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }
}

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  await sendPayload(to, { type: "text", text: { body } });
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  await sendPayload(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title.slice(0, 20),
          },
        })),
      },
    },
  });
}

export async function deliverOutbound(to: string, messages: WhatsAppOutbound[]): Promise<void> {
  for (const message of messages) {
    if (message.type === "text") {
      await sendWhatsAppText(to, message.body);
    } else {
      await sendWhatsAppButtons(to, message.body, message.buttons);
    }
  }
}
