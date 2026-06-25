/** Normaliza @usuario, usuario ou URL para link público do Instagram. */
export function normalizeInstagramUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!url.hostname.includes("instagram.com")) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  const handle = raw.replace(/^@/, "").replace(/\//g, "").trim();
  if (!handle || !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
  return `https://www.instagram.com/${handle}/`;
}
