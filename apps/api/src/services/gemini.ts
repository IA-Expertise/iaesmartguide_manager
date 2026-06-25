import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";

/** Modelos ativos na API Gemini (2.0/1.5 foram desligados em 2026) */
const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash"] as const;
const GEMINI_TIMEOUT_MS = 25_000;

export function isGeminiConfigured(): boolean {
  return Boolean(config.geminiApiKey?.trim());
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`GEMINI_TIMEOUT:${label}`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runGeminiPrompt(
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  let lastError: unknown;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });
      const result = await withTimeout(
        model.generateContent(userPrompt),
        GEMINI_TIMEOUT_MS,
        modelName
      );
      const text = result.response.text()?.trim();
      if (!text) throw new Error("GEMINI_EMPTY");
      console.log(`[Gemini] ok model=${modelName} chars=${text.length}`);
      return text;
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] model ${modelName} failed: ${errorDetail(error)}`);
    }
  }

  throw lastError ?? new Error("GEMINI_FAILED");
}
