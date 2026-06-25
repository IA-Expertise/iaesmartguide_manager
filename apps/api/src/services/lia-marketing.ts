import type { Tenant, TenantPhoto, TenantProduct } from "@prisma/client";
import { runGeminiPrompt, isGeminiConfigured } from "./gemini.js";
import type { WhatsAppOutbound } from "./whatsapp-send.js";
import { imageMessage, listMessage, textMessage } from "./whatsapp-send.js";

/** Três ferramentas: post com foto, texto versátil, gancho do site */
export type MarketingKind = "post" | "share" | "tagline";

const WHATSAPP_CAPTION_MAX = 1024;

const LIA_SYSTEM = `Você é a Lia, assistente de marketing do IAE Smart Guide para turismo rural e gastronomia no Brasil.

Tom de voz: informal e acolhedor, como uma amiga que manja de divulgação local — nunca corporativa.
Emojis: use com moderação (2 ou 3 por bloco).
Idioma: português do Brasil.
Regras:
- Entregue APENAS o texto final, pronto para copiar e colar.
- NUNCA comece com "Aqui está", "Segue" ou explicações sobre o que você fez.
- Não invente preços, produtos ou informações que não estejam no contexto.
- WhatsApp aceita *negrito* com asteriscos.`;

export interface TenantWithMedia extends Tenant {
  products: TenantProduct[];
  photos: TenantPhoto[];
}

export function buildMarketingContext(tenant: TenantWithMedia, rootDomain: string) {
  const siteUrl = `https://${tenant.slug}.${rootDomain}`;
  const latestProducts = tenant.products.slice(0, 5).map((p) => {
    const price = p.price ? ` — ${p.price}` : "";
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
      latestProducts.length > 0 ? latestProducts.join("\n") : "(nenhuma oferta cadastrada)",
    hasPhotos: tenant.photos.length > 0,
    hasLogo: Boolean(tenant.logoUrl),
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
Ofertas:
${ctx.products}`;

  switch (kind) {
    case "post":
      return `${base}

Crie a LEGENDA de um post para WhatsApp/Instagram anunciando o lugar, neste formato:
1. Título chamativo com emoji (use *negrito*)
2. Uma ou duas frases convidando para visitar no fim de semana
3. Se houver ofertas no contexto, liste até 3 com emoji, *nome* e preço
4. CTA final com o link ${ctx.siteUrl}

Máximo 900 caracteres. Apenas a legenda, sem aspas.`;
    case "share":
      return `${base}

Crie UM texto curto para Status do WhatsApp ou grupos de turismo/ciclismo.
Tom de dica entre amigos recomendando uma parada. Máximo 380 caracteres.
Termine com o link ${ctx.siteUrl}. Apenas o texto.`;
    case "tagline":
      return `${base}

Crie UM gancho de atração (máx. 120 caracteres) para o topo do site — deve fazer o turista querer desviar a rota. Apenas o texto, sem aspas.`;
  }
}

function geminiOptionsForKind(kind: MarketingKind) {
  switch (kind) {
    case "post":
      return { maxOutputTokens: 1536 };
    case "share":
      return { maxOutputTokens: 512 };
    case "tagline":
      return { maxOutputTokens: 128 };
  }
}

export function cleanMarketingCopy(text: string): string {
  return text
    .replace(/^(aqui está[^\n]*\n+)/i, "")
    .replace(/^(segue[^\n]*\n+)/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

export async function generateMarketingCopy(
  kind: MarketingKind,
  tenant: TenantWithMedia,
  rootDomain: string
): Promise<string> {
  const ctx = buildMarketingContext(tenant, rootDomain);
  const raw = await runGeminiPrompt(
    LIA_SYSTEM,
    promptForKind(kind, ctx),
    geminiOptionsForKind(kind)
  );
  return cleanMarketingCopy(raw);
}

export function pickPostImageUrl(tenant: TenantWithMedia): string | null {
  const gallery = tenant.photos
    .map((photo) => photo.photoUrl)
    .find((url) => url.startsWith("http"));
  if (gallery) return gallery;

  if (tenant.logoUrl?.startsWith("http")) return tenant.logoUrl;
  return null;
}

export function captionForWhatsApp(caption: string): string {
  if (caption.length <= WHATSAPP_CAPTION_MAX) return caption;
  const cut = caption.lastIndexOf("\n", WHATSAPP_CAPTION_MAX - 20);
  const at = cut > WHATSAPP_CAPTION_MAX * 0.5 ? cut : WHATSAPP_CAPTION_MAX - 20;
  return `${caption.slice(0, at).trim()}…`;
}

export function splitWhatsAppMessages(text: string, maxLen = 3500): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.4) {
      cut = remaining.lastIndexOf("\n", maxLen);
    }
    if (cut < maxLen * 0.4) cut = maxLen;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

export function marketingMenuMessage(): WhatsAppOutbound {
  return listMessage(
    "Bora divulgar? Escolha uma ferramenta — eu monto com IA 📣",
    "Ver opções",
    [
      {
        title: "Divulgar com Lia",
        rows: [
          {
            id: "lia_post",
            title: "Post com foto",
            description: "Imagem do site + legenda + link",
          },
          {
            id: "lia_share",
            title: "Texto pra compartilhar",
            description: "Status, grupos e WhatsApp",
          },
          {
            id: "lia_tagline",
            title: "Gancho do site",
            description: "Frase de impacto no topo",
          },
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
  return actionId.startsWith("lia_") || actionId === "open_divulgar";
}

export function marketingKindFromAction(actionId: string): MarketingKind | null {
  const map: Record<string, MarketingKind> = {
    lia_post: "post",
    lia_share: "share",
    lia_tagline: "tagline",
    // compatibilidade com menu antigo
    lia_kit: "share",
    lia_status: "share",
    lia_instagram: "post",
    lia_grupo: "share",
    lia_bio: "share",
  };
  return map[actionId] ?? null;
}

export function buildMarketingReplies(
  kind: MarketingKind,
  tenant: TenantWithMedia,
  rootDomain: string,
  copy: string
): WhatsAppOutbound[] {
  if (kind === "post") {
    const imageUrl = pickPostImageUrl(tenant);
    if (!imageUrl) {
      return [
        textMessage(
          "Para montar o *post com foto*, cadastre imagens no menu:\n*Imagens → Fotos*\n\nPor enquanto, use *Texto pra compartilhar*."
        ),
      ];
    }

    const caption = captionForWhatsApp(copy);
    const siteUrl = `https://${tenant.slug}.${rootDomain}`;
    return [
      textMessage(
        `✨ *Post pronto!* Encaminhe a imagem abaixo pros grupos e redes.\n\n📎 Site: ${siteUrl}`
      ),
      imageMessage(imageUrl, caption),
      textMessage("Gostou? Envie *divulgar* para gerar outro."),
    ];
  }

  if (kind === "tagline") {
    return [textMessage(`✨ *Sugestão de gancho:*\n\n${copy}`)];
  }

  const chunks = splitWhatsAppMessages(copy);
  return [
    textMessage("✨ *Texto pra compartilhar* — copie e cole:"),
    ...chunks.map((chunk) => textMessage(chunk)),
    textMessage("Gostou? Envie *divulgar* para gerar outro."),
  ];
}

export { isGeminiConfigured };
