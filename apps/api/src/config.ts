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
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
  apiUrl: optional("API_URL", "http://localhost:3001"),
  jwtSecret: optional("JWT_SECRET", "dev-secret"),
  revalidateSecret: optional("REVALIDATE_SECRET", "dev-revalidate"),
  rootDomain: optional("NEXT_PUBLIC_ROOT_DOMAIN", "iaesmartguide.com.br"),
  whatsapp: {
    token: optional("WHATSAPP_TOKEN"),
    phoneNumberId: optional("PHONE_NUMBER_ID"),
    verifyToken: optional("VERIFY_TOKEN"),
    wabaId: optional("WABA_ID"),
    /** Quando o webhook Meta fica no Replit, exija este header no POST encaminhado */
    forwardSecret: optional("WHATSAPP_FORWARD_SECRET"),
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
  seedSecret: optional("SEED_SECRET"),
};

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  required("JWT_SECRET");
  required("REVALIDATE_SECRET");

  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
    throw new Error(
      "DATABASE_URL aponta para localhost. No Railway, use Add Reference → PostgreSQL → DATABASE_URL"
    );
  }
}
