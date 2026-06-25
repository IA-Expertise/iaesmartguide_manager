export interface SiteTheme {
  accent: string;
  accentLight: string;
  accentDark: string;
  accentMuted: string;
  gradient: string;
  heroGlow: string;
}

/** Paleta única e estável por slug — sem config extra no banco */
export function themeFromSlug(slug: string): SiteTheme {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Tons quentes/agro (25–95°): terracota, oliva, âmbar, musgo
  const hue = 25 + (Math.abs(hash) % 70);

  return {
    accent: `hsl(${hue}, 48%, 40%)`,
    accentLight: `hsl(${hue}, 42%, 95%)`,
    accentDark: `hsl(${hue}, 52%, 24%)`,
    accentMuted: `hsl(${hue}, 30%, 88%)`,
    gradient: `linear-gradient(145deg, hsl(${hue}, 52%, 36%) 0%, hsl(${hue + 18}, 48%, 26%) 50%, hsl(${hue + 8}, 55%, 20%) 100%)`,
    heroGlow: `hsl(${hue}, 60%, 50%)`,
  };
}

export function themeToCssVars(theme: SiteTheme): Record<string, string> {
  return {
    "--accent": theme.accent,
    "--accent-light": theme.accentLight,
    "--accent-dark": theme.accentDark,
    "--accent-muted": theme.accentMuted,
    "--gradient": theme.gradient,
    "--hero-glow": theme.heroGlow,
  };
}

export function youtubeEmbedId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}
