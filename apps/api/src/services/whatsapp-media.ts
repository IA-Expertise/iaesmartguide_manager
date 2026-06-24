import { config } from "../config.js";

interface WhatsAppMedia {
  buffer: Buffer;
  contentType: string;
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<WhatsAppMedia> {
  const token = config.whatsapp.token;
  if (!token) {
    throw new Error("WHATSAPP_TOKEN não configurado");
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Meta media metadata failed: ${metaRes.status}`);
  }

  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) {
    throw new Error("Meta media URL não retornada");
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    throw new Error(`Meta media download failed: ${fileRes.status}`);
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    contentType: meta.mime_type ?? "image/jpeg",
  };
}
