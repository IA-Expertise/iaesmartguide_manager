import sharp from "sharp";

const BLACK_THRESHOLD = 40;

function isJpeg(contentType: string, format: string | undefined): boolean {
  if (format === "jpeg" || format === "jpg") return true;
  return contentType.includes("jpeg") || contentType.includes("jpg");
}

/** Garante PNG com alpha para logos — remove fundo preto típico de JPEG do WhatsApp. */
export async function processLogoForWeb(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const hasAlpha = meta.hasAlpha === true;
  const jpeg = isJpeg(contentType, meta.format);

  if (hasAlpha && !jpeg && meta.format === "png") {
    return { buffer, contentType: "image/png" };
  }

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (jpeg || !hasAlpha) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
        data[i + 3] = 0;
      }
    }
  }

  const out = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  return { buffer: out, contentType: "image/png" };
}
