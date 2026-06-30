import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { isR2Configured, uploadToR2 } from "./r2.js";

const MAX_DIM = 1080;
const FETCH_TIMEOUT_MS = 20_000;

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`FETCH_IMAGE_${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** Logo no canto inferior direito, sobre foto redimensionada para WhatsApp. */
export async function composeMarketingImage(
  photoBuffer: Buffer,
  logoBuffer: Buffer
): Promise<Buffer> {
  const photoMeta = await sharp(photoBuffer).rotate().metadata();
  const width = photoMeta.width ?? MAX_DIM;
  const height = photoMeta.height ?? MAX_DIM;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const baseBuffer = await sharp(photoBuffer)
    .rotate()
    .resize(targetW, targetH, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const baseMeta = await sharp(baseBuffer).metadata();
  const w = baseMeta.width ?? targetW;
  const h = baseMeta.height ?? targetH;

  const logoMaxW = Math.round(w * 0.22);
  const logoMaxH = Math.round(h * 0.18);
  const logoResized = await sharp(logoBuffer)
    .ensureAlpha()
    .resize(logoMaxW, logoMaxH, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const logoMeta = await sharp(logoResized).metadata();
  const logoW = logoMeta.width ?? logoMaxW;
  const logoH = logoMeta.height ?? logoMaxH;

  const padding = Math.max(12, Math.round(Math.min(w, h) * 0.03));
  const left = Math.max(0, w - logoW - padding);
  const top = Math.max(0, h - logoH - padding);

  const backdropPad = Math.round(padding * 0.6);
  const backdrop = await sharp({
    create: {
      width: logoW + backdropPad * 2,
      height: logoH + backdropPad * 2,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.72 },
    },
  })
    .png()
    .toBuffer();

  return sharp(baseBuffer)
    .composite([
      { input: backdrop, left: Math.max(0, left - backdropPad), top: Math.max(0, top - backdropPad) },
      { input: logoResized, left, top },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export async function uploadMarketingPostImage(
  tenantSlug: string,
  buffer: Buffer
): Promise<string> {
  const key = `tenants/${tenantSlug}/marketing/${Date.now()}-${randomUUID()}.jpg`;
  return uploadToR2(key, buffer, "image/jpeg");
}

export async function prepareMarketingPostImageUrl(
  tenantSlug: string,
  imageUrl: string,
  logoUrl: string | null | undefined
): Promise<string> {
  if (!logoUrl?.startsWith("http") || imageUrl === logoUrl || !isR2Configured()) {
    return imageUrl;
  }

  try {
    const [photoBuffer, logoBuffer] = await Promise.all([
      fetchImageBuffer(imageUrl),
      fetchImageBuffer(logoUrl),
    ]);
    const composed = await composeMarketingImage(photoBuffer, logoBuffer);
    return await uploadMarketingPostImage(tenantSlug, composed);
  } catch (error) {
    console.error("[marketing-image]", error);
    return imageUrl;
  }
}
