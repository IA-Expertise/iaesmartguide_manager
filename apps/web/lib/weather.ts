import { unstable_cache } from "next/cache";

export interface WeatherSnapshot {
  city: string;
  temperature: number;
  icon: string;
  label: string;
}

const UF_PATTERN =
  /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i;

function weatherFromCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Céu limpo" };
  if (code <= 3) return { icon: "⛅", label: "Parcialmente nublado" };
  if (code <= 48) return { icon: "🌫️", label: "Neblina" };
  if (code <= 57) return { icon: "🌦️", label: "Garoa" };
  if (code <= 67) return { icon: "🌧️", label: "Chuva" };
  if (code <= 77) return { icon: "🌨️", label: "Neve" };
  if (code <= 82) return { icon: "🌧️", label: "Chuva forte" };
  if (code <= 86) return { icon: "🌨️", label: "Neve forte" };
  if (code <= 99) return { icon: "⛈️", label: "Tempestade" };
  return { icon: "🌡️", label: "Tempo variável" };
}

/** Extrai cidade do endereço cadastrado (ex.: "... | Louveira SP | ..."). */
export function extractCityFromAddress(address: string): string | null {
  const withoutContact = address.split(/whatsapp/i)[0]?.trim() ?? address;
  const parts = withoutContact
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const segment = parts[i]!;
    if (/^\d/.test(segment) || segment.length < 3) continue;
    const city = segment.replace(UF_PATTERN, "").replace(/[-,]/g, " ").trim();
    if (city.length >= 3 && !/^\d+$/.test(city)) return city;
  }

  const match = withoutContact.match(/([A-Za-zÀ-ú][A-Za-zÀ-ú\s]{2,28})\s*[-|]?\s*SP\b/i);
  return match?.[1]?.trim() ?? null;
}

async function fetchWeatherUncached(city: string): Promise<WeatherSnapshot | null> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&countryCode=BR`,
    { next: { revalidate: 86400 } }
  );
  if (!geoRes.ok) return null;

  const geo = (await geoRes.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string }>;
  };
  const place = geo.results?.[0];
  if (!place) return null;

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=America%2FSao_Paulo`,
    { next: { revalidate: 1800 } }
  );
  if (!wxRes.ok) return null;

  const wx = (await wxRes.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const temp = wx.current?.temperature_2m;
  const code = wx.current?.weather_code ?? 0;
  if (temp === undefined) return null;

  const { icon, label } = weatherFromCode(code);
  return {
    city: place.name,
    temperature: temp,
    icon,
    label,
  };
}

export async function getWeatherForAddress(
  address: string | null | undefined
): Promise<WeatherSnapshot | null> {
  if (!address?.trim()) return null;
  const city = extractCityFromAddress(address);
  if (!city) return null;

  return unstable_cache(() => fetchWeatherUncached(city), [`weather-${city.toLowerCase()}`], {
    revalidate: 1800,
  })();
}
