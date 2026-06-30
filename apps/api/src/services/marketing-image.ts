import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { isR2Configured, uploadToR2 } from "./r2.js";

const MAX_DIM = 1080;
const STATUS_WIDTH = 1080;
const STATUS_HEIGHT = 1920;
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function logoOverlay(
  width: number,
  height: number,
  logoBuffer: Buffer,
  bottomReserve = 0
): Promise<Array<{ input: Buffer; left: number; top: number }>> {
  const logoMaxW = Math.round(width * 0.22);
  const logoMaxH = Math.round(height * 0.12);
  const logoResized = await sharp(logoBuffer)
    .ensureAlpha()
    .resize(logoMaxW, logoMaxH, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const logoMeta = await sharp(logoResized).metadata();
  const logoW = logoMeta.width ?? logoMaxW;
  const logoH = logoMeta.height ?? logoMaxH;

  const padding = Math.max(16, Math.round(Math.min(width, height) * 0.025));
  const left = Math.max(0, width - logoW - padding);
  const top = Math.max(0, height - logoH - padding - bottomReserve);

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

  return [
    {
      input: backdrop,
      left: Math.max(0, left - backdropPad),
      top: Math.max(0, top - backdropPad),
    },
    { input: logoResized, left, top },
  ];
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

  const overlays = await logoOverlay(w, h, logoBuffer);

  return sharp(baseBuffer)
    .composite(overlays)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/** Foto em 9:16 (Status/Stories) com gradiente, nome do negócio e logo opcional. */
export async function composeStatusImage(
  photoBuffer: Buffer,
  options: { logoBuffer?: Buffer; businessName?: string }
): Promise<Buffer> {
  const baseBuffer = await sharp(photoBuffer)
    .rotate()
    .resize(STATUS_WIDTH, STATUS_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();

  const nameBandHeight = options.businessName?.trim() ? 100 : 0;
  const gradientHeight = 280 + nameBandHeight;

  const gradientSvg = Buffer.from(
    `<svg width="${STATUS_WIDTH}" height="${gradientHeight}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
          <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`
  );

  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    {
      input: gradientSvg,
      left: 0,
      top: STATUS_HEIGHT - gradientHeight,
    },
  ];

  if (options.businessName?.trim()) {
    const name = escapeXml(options.businessName.trim().slice(0, 48));
    const nameSvg = Buffer.from(
      `<svg width="${STATUS_WIDTH}" height="${nameBandHeight}">
        <text x="40" y="62" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${name}</text>
      </svg>`
    );
    composites.push({
      input: nameSvg,
      left: 0,
      top: STATUS_HEIGHT - nameBandHeight - 20,
    });
  }

  if (options.logoBuffer) {
    const logoOverlays = await logoOverlay(
      STATUS_WIDTH,
      STATUS_HEIGHT,
      options.logoBuffer,
      nameBandHeight + 24
    );
    composites.push(...logoOverlays);
  }

  return sharp(baseBuffer)
    .composite(composites)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

async function uploadMarketingImage(
  tenantSlug: string,
  buffer: Buffer,
  prefix: string
): Promise<string> {
  const key = `tenants/${tenantSlug}/marketing/${prefix}-${Date.now()}-${randomUUID()}.jpg`;
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
    return await uploadMarketingImage(tenantSlug, composed, "post");
  } catch (error) {
    console.error("[marketing-image]", error);
    return imageUrl;
  }
}

export async function prepareMarketingStatusImageUrl(
  tenantSlug: string,
  imageUrl: string,
  logoUrl: string | null | undefined,
  businessName: string
): Promise<{ url: string; composed: boolean }> {
  if (imageUrl === logoUrl || !isR2Configured()) {
    return { url: imageUrl, composed: false };
  }

  try {
    const photoBuffer = await fetchImageBuffer(imageUrl);
    let logoBuffer: Buffer | undefined;
    if (logoUrl?.startsWith("http")) {
      logoBuffer = await fetchImageBuffer(logoUrl);
    }
    const composed = await composeStatusImage(photoBuffer, {
      logoBuffer,
      businessName,
    });
    const url = await uploadMarketingImage(tenantSlug, composed, "status");
    return { url, composed: true };
  } catch (error) {
    console.error("[marketing-image status]", error);
    return { url: imageUrl, composed: false };
  }
}
