/** Formato canônico BR: 55 + DDD(2) + 9 + 8 dígitos (13 chars) */
export function canonicalBrazilWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  // Celular sem o 9 após o DDD: 55 11 87654321 → 55 11 987654321
  if (digits.length === 12) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits;
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return canonicalBrazilWhatsApp(digits.startsWith("55") ? digits : `55${digits}`);
}

/** Variantes com/sem 9 — Meta e cadastros manuais podem divergir */
export function brazilPhoneVariants(phone: string): string[] {
  const canonical = canonicalBrazilWhatsApp(phone);
  const variants = new Set<string>([canonical, phone.replace(/\D/g, "")]);

  if (canonical.length === 13 && canonical[4] === "9") {
    variants.add(`${canonical.slice(0, 4)}${canonical.slice(5)}`);
  }
  if (canonical.startsWith("55") && !canonical.startsWith("55", 1)) {
    variants.add(canonical);
  }

  return [...variants];
}

export function isPlaceholderSlug(slug: string | null | undefined): boolean {
  return !slug || slug.startsWith("pending-");
}
