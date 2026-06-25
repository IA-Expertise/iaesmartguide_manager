import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";

const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"] as const;

export function isGeminiConfigured(): boolean {
  return Boolean(config.geminiApiKey?.trim());
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
      const result = await model.generateContent(userPrompt);
      const text = result.response.text()?.trim();
      if (!text) throw new Error("GEMINI_EMPTY");
      return text;
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] model ${modelName} failed`, error);
    }
  }

  throw lastError ?? new Error("GEMINI_FAILED");
}
