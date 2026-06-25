const TAGLINE_MAX = 200;

/** Primeira linha ou frase curta — gancho de atração no hero. */
export function taglineFromDescription(description: string): string {
  const first = description.split(/\n/)[0]?.trim() ?? "";
  if (first.length <= TAGLINE_MAX) return first;
  return `${first.slice(0, TAGLINE_MAX - 1).trim()}…`;
}
