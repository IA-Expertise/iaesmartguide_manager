const TAGLINE_MAX = 200;

export function firstLine(text: string): string {
  const line = text.split(/\n/)[0]?.trim() ?? "";
  if (line.length <= TAGLINE_MAX) return line;
  return `${line.slice(0, TAGLINE_MAX - 1).trim()}…`;
}

export function resolveHeroTagline(
  tagline: string | null | undefined,
  description: string | null | undefined
): string | null {
  const explicit = tagline?.trim();
  if (explicit) return explicit;
  if (!description?.trim()) return null;
  return firstLine(description);
}

/** Texto do card “Sobre” — evita repetir o gancho já exibido no hero. */
export function introBody(
  description: string | null | undefined,
  hook: string | null
): string | null {
  if (!description?.trim()) return null;
  const full = description.trim();
  if (!hook) return full;
  if (full === hook) return null;
  if (full.startsWith(hook)) {
    const rest = full.slice(hook.length).replace(/^[\s.!—–-]+/, "").trim();
    return rest || null;
  }
  return full;
}
