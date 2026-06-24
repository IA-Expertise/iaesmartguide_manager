import { randomUUID } from "node:crypto";
import { isR2Configured, uploadToR2 } from "./r2.js";
import { downloadWhatsAppMedia } from "./whatsapp-media.js";

const PENDING_PREFIX = "pending://";

function extensionFromMime(contentType: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

export function isPendingMediaUrl(url: string): boolean {
  return url.startsWith(PENDING_PREFIX);
}

export async function persistWhatsAppImage(
  mediaId: string,
  tenantSlug: string,
  kind: "logo" | "photo"
): Promise<string> {
  if (!isR2Configured()) {
    return `${PENDING_PREFIX}${mediaId}`;
  }

  const { buffer, contentType } = await downloadWhatsAppMedia(mediaId);
  const ext = extensionFromMime(contentType);
  const folder = kind === "logo" ? "logo" : "photos";
  const key = `tenants/${tenantSlug}/${folder}/${Date.now()}-${randomUUID()}${ext}`;

  return uploadToR2(key, buffer, contentType);
}

export async function resolveMediaUrl(
  url: string,
  tenantSlug: string,
  kind: "logo" | "photo"
): Promise<string> {
  if (!isPendingMediaUrl(url)) {
    return url;
  }
  const mediaId = url.slice(PENDING_PREFIX.length);
  return persistWhatsAppImage(mediaId, tenantSlug, kind);
}

export async function resolveMediaUrls(
  urls: string[],
  tenantSlug: string
): Promise<string[]> {
  return Promise.all(urls.map((url) => resolveMediaUrl(url, tenantSlug, "photo")));
}
