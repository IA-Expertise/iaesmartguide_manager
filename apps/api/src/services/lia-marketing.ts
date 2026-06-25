import type { Tenant, TenantProduct } from "@prisma/client";
import { runGeminiPrompt, isGeminiConfigured } from "./gemini.js";
import type { WhatsAppOutbound } from "./whatsapp-send.js";
import { listMessage, textMessage } from "./whatsapp-send.js";

export type MarketingKind = "kit" | "status" | "instagram" | "grupo" | "bio" | "tagline";

const LIA_SYSTEM = `Você é a Lia, assistente de marketing do IAE Smart Guide para turismo rural e gastronomia no Brasil.

Tom de voz: informal e acolhedor, como uma amiga que manja de divulgação local — nunca corporativa.
Emojis: use com moderação (no máximo 2 ou 3 por bloco de texto).
Idioma: português do Brasil.
Regras:
- Escreva textos curtos, prontos para copiar e colar no WhatsApp ou Instagram.
- Não invente preços, produtos ou informações que não estejam no contexto.
- Inclua o link do site quando fizer sentido.
- Não use markdown complexo; WhatsApp aceita *negrito* com asteriscos.`;

export interface TenantWithProducts extends Tenant {
  products: TenantProduct[];
}

export function buildMarketingContext(tenant: TenantWithProducts, rootDomain: string) {
  const siteUrl = `https://${tenant.slug}.${rootDomain}`;
  const latestProducts = tenant.products.slice(0, 5).map((p) => {
    const price = p.price ? ` (${p.price})` : "";
    return `${p.title}${price}`;
  });

  return {
    businessName: tenant.businessName,
    siteUrl,
    tagline: tenant.tagline ?? "(não definido)",
    description: tenant.description ?? "(não definido)",
    address: tenant.address ?? "(não informado)",
    instagram: tenant.instagramUrl ?? "(não informado)",
    products:
      latestProducts.length > 0 ? latestProducts.join("; ") : "(nenhum produto cadastrado)",
  };
}

function promptForKind(
  kind: MarketingKind,
  ctx: ReturnType<typeof buildMarketingContext>
): string {
  const base = `Negócio: ${ctx.businessName}
Site: ${ctx.siteUrl}
Gancho atual: ${ctx.tagline}
Sobre: ${ctx.description}
Endereço: ${ctx.address}
Instagram: ${ctx.instagram}
Ofertas recentes: ${ctx.products}`;

  switch (kind) {
    case "status":
      return `${base}

Crie UM texto para Status do WhatsApp (máx. 280 caracteres) anunciando o lugar ou a oferta mais recente. Termine com o link do site.`;
    case "instagram":
      return `${base}

Crie UMA legenda para post no Instagram (máx. 400 caracteres) com gancho emocional, CTA e 4 a 6 hashtags locais/turismo no final.`;
    case "grupo":
      return `${base}

Crie UM texto para grupo de WhatsApp de turismo/ciclismo (máx. 350 caracteres) como dica de parada no fim de semana — tom de recomendação entre amigos.`;
    case "bio":
      return `${base}

Crie UM texto curto para bio do Instagram (máx. 150 caracteres) com o essencial e o link ${ctx.siteUrl}.`;
    case "tagline":
      return `${base}

Crie UM gancho de atração (máx. 120 caracteres) para o topo do site — deve fazer o turista querer desviar a rota. Apenas o texto do gancho, sem aspas.`;
    case "kit":
      return `${base}

Monte um KIT DE DIVULGAÇÃO com 4 blocos separados por linha em branco, nesta ordem, com título em negrito WhatsApp (*título*):

*1. Status WhatsApp*
(texto)

*2. Grupo de turismo*
(texto)

*3. Legenda Instagram*
(texto)

*4. Bio Instagram*
(texto)`;
  }
}

export async function generateMarketingCopy(
  kind: MarketingKind,
  tenant: TenantWithProducts,
  rootDomain: string
): Promise<string> {
  const ctx = buildMarketingContext(tenant, rootDomain);
  return runGeminiPrompt(LIA_SYSTEM, promptForKind(kind, ctx));
}

export function splitWhatsAppMessages(text: string, maxLen = 3800): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

export function marketingMenuMessage(): WhatsAppOutbound {
  return listMessage(
    "Bora divulgar? Eu monto o texto com IA — é só copiar e colar 📣",
    "Ver opções",
    [
      {
        title: "Divulgar com Lia",
        rows: [
          { id: "lia_kit", title: "Kit completo", description: "Status, grupo, Insta e bio" },
          { id: "lia_status", title: "Status WhatsApp", description: "Texto pro Status" },
          { id: "lia_instagram", title: "Legenda Instagram", description: "Post com hashtags" },
          { id: "lia_grupo", title: "Grupo de turismo", description: "Dica de parada" },
          { id: "lia_bio", title: "Bio Instagram", description: "Texto curto + link" },
          { id: "lia_tagline", title: "Gancho do site", description: "Frase de impacto" },
        ],
      },
    ]
  );
}

export function geminiUnavailableMessage(): WhatsAppOutbound {
  return textMessage(
    "A Lia com IA ainda não está ligada 🤖\n\nPeça para configurar *GEMINI_API_KEY* no servidor e tente de novo."
  );
}

export function marketingErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes("GEMINI_NOT_CONFIGURED")) {
    return "A Lia com IA ainda não está ligada 🤖\n\nPeça para configurar *GEMINI_API_KEY* no Railway.";
  }
  if (msg.includes("GEMINI_TIMEOUT") || msg.includes("HANDLER_TIMEOUT") || msg.includes("AbortError")) {
    return "Demorou mais que o esperado ⏳ Tenta de novo — às vezes a IA fica sobrecarregada.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "Limite da IA atingido por agora 🙈 Espera uns minutinhos e tenta de novo.";
  }
  if (msg.includes("404") || msg.includes("NOT_FOUND")) {
    return "Serviço de IA temporariamente indisponível. Tenta de novo em instantes.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("403")) {
    return "Chave da IA inválida 🔑 Peça para revisar *GEMINI_API_KEY* no Railway.";
  }

  return "Ops, não consegui gerar agora 😅 Tenta de novo em alguns segundos.";
}

export function isMarketingAction(actionId: string): boolean {
  return actionId.startsWith("lia_");
}

export function marketingKindFromAction(actionId: string): MarketingKind | null {
  const map: Record<string, MarketingKind> = {
    lia_kit: "kit",
    lia_status: "status",
    lia_instagram: "instagram",
    lia_grupo: "grupo",
    lia_bio: "bio",
    lia_tagline: "tagline",
  };
  return map[actionId] ?? null;
}

export { isGeminiConfigured };
