import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  apiUrl: optional("API_URL", "http://localhost:3001"),
  jwtSecret: optional("JWT_SECRET", "dev-secret"),
  revalidateSecret: optional("REVALIDATE_SECRET", "dev-revalidate"),
  rootDomain: optional("NEXT_PUBLIC_ROOT_DOMAIN", "iaesmartguide.com.br"),
  whatsapp: {
    token: optional("WHATSAPP_TOKEN"),
    phoneNumberId: optional("PHONE_NUMBER_ID"),
    verifyToken: optional("VERIFY_TOKEN"),
  },
  asaas: {
    apiKey: optional("ASAAS_API_KEY"),
    webhookToken: optional("ASAAS_WEBHOOK_TOKEN"),
    env: optional("ASAAS_ENV", "sandbox") as "sandbox" | "production",
  },
  r2: {
    accountId: optional("R2_ACCOUNT_ID"),
    accessKeyId: optional("R2_ACCESS_KEY_ID"),
    secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
    bucketName: optional("R2_BUCKET_NAME", "iaesmartguide-media"),
    publicUrl: optional("R2_PUBLIC_URL"),
  },
  geminiApiKey: optional("GEMINI_API_KEY"),
};

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV === "production") {
    required("JWT_SECRET");
    required("REVALIDATE_SECRET");
    required("DATABASE_URL");
  }
}
