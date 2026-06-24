export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function isPlaceholderSlug(slug: string | null | undefined): boolean {
  return !slug || slug.startsWith("pending-");
}
