import { config } from "../config.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"] as const;
const GEMINI_TIMEOUT_MS = 25_000;

export interface GeminiPromptOptions {
  maxOutputTokens?: number;
}

export function isGeminiConfigured(): boolean {
  return Boolean(config.geminiApiKey?.trim());
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string; code?: number };
}

async function callGeminiModel(
  modelName: string,
  systemInstruction: string,
  userPrompt: string,
  maxOutputTokens: number
): Promise<string> {
  const url = `${API_BASE}/models/${modelName}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.85,
        },
      }),
    });

    const data = (await res.json()) as GeminiApiResponse;

    if (!res.ok) {
      const detail = data.error?.message ?? res.statusText;
      throw new Error(`GEMINI_HTTP_${res.status}:${detail}`);
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error("GEMINI_EMPTY");

    if (finishReason === "MAX_TOKENS") {
      console.warn(`[Gemini] model=${modelName} resposta truncada (MAX_TOKENS)`);
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GEMINI_TIMEOUT:${modelName}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runGeminiPrompt(
  systemInstruction: string,
  userPrompt: string,
  options: GeminiPromptOptions = {}
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  const maxOutputTokens = options.maxOutputTokens ?? 2048;
  let lastError: unknown;

  for (const modelName of MODELS) {
    try {
      const text = await callGeminiModel(
        modelName,
        systemInstruction,
        userPrompt,
        maxOutputTokens
      );
      console.log(`[Gemini] ok model=${modelName} chars=${text.length}`);
      return text;
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] model ${modelName} failed: ${errorDetail(error)}`);
    }
  }

  throw lastError ?? new Error("GEMINI_FAILED");
}
