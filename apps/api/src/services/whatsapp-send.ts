import { config } from "../config.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export type WhatsAppOutbound =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; body: string; buttonLabel: string; sections: ListSection[] };

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

export function listMessage(
  body: string,
  buttonLabel: string,
  sections: ListSection[]
): WhatsAppOutbound {
  const totalRows = sections.reduce((count, section) => count + section.rows.length, 0);
  if (totalRows > 10) {
    console.error(`[WhatsApp] lista com ${totalRows} linhas (máx. 10) — mensagem rejeitada`);
  }
  return { type: "list", body, buttonLabel, sections };
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

export async function sendWhatsAppList(
  to: string,
  body: string,
  buttonLabel: string,
  sections: ListSection[]
): Promise<void> {
  const normalized = sections.map((section) => ({
    title: section.title.slice(0, 24),
    rows: section.rows.map((row) => ({
      id: row.id,
      title: row.title.slice(0, 24),
      description: row.description?.slice(0, 72),
    })),
  }));

  const limited: ListSection[] = [];
  let rowCount = 0;
  for (const section of normalized) {
    if (rowCount >= 10) break;
    const rows = section.rows.slice(0, 10 - rowCount);
    if (rows.length > 0) {
      limited.push({ title: section.title, rows });
      rowCount += rows.length;
    }
  }

  if (rowCount < normalized.reduce((count, section) => count + section.rows.length, 0)) {
    console.warn(`[WhatsApp] lista truncada para ${rowCount} linhas (máx. 10)`);
  }

  await sendPayload(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: limited,
      },
    },
  });
}

const OUTBOUND_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverOutbound(to: string, messages: WhatsAppOutbound[]): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    try {
      if (message.type === "text") {
        await sendWhatsAppText(to, message.body);
      } else if (message.type === "buttons") {
        await sendWhatsAppButtons(to, message.body, message.buttons);
      } else {
        await sendWhatsAppList(to, message.body, message.buttonLabel, message.sections);
      }
    } catch (error) {
      console.error(`[WhatsApp] falha ao enviar mensagem ${i + 1}/${messages.length}`, error);
      throw error;
    }

    if (i < messages.length - 1) {
      await sleep(OUTBOUND_DELAY_MS);
    }
  }
}
