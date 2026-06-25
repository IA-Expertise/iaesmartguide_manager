import type { Tenant, TenantPhoto, TenantProduct } from "@prisma/client";
import { runGeminiPrompt, isGeminiConfigured } from "./gemini.js";
import type { ListRow, WhatsAppOutbound } from "./whatsapp-send.js";
import { imageMessage, listMessage, textMessage } from "./whatsapp-send.js";

export type MarketingKind = "post" | "share" | "tagline";

const WHATSAPP_CAPTION_MAX = 1024;
const WHATSAPP_TEXT_SAFE = 1500;

const LIA_SYSTEM = `Você é a Lia, assistente de marketing do IAE Smart Guide para turismo rural e gastronomia no Brasil.

Tom de voz: informal e acolhedor, como uma amiga que manja de divulgação local — nunca corporativa.
Emojis: use com moderação (2 ou 3 por bloco).
Idioma: português do Brasil.
Regras:
- Entregue APENAS o texto final, pronto para copiar e colar.
- NUNCA comece com "Aqui está", "Segue", "Legenda:" ou explicações sobre o que você fez.
- Não invente preços, produtos ou informações que não estejam no contexto.
- WhatsApp aceita *negrito* com asteriscos.`;

export interface TenantWithMedia extends Tenant {
  products: TenantProduct[];
  photos: TenantPhoto[];
}

export interface MarketingFocus {
  topicKey: string;
  topicLabel: string;
  imageUrl?: string;
  imageLabel?: string;
  productTitle?: string;
  productPrice?: string;
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
  };
}

function focusBlock(focus: MarketingFocus): string {
  const lines = [
    `Assunto escolhido: *${focus.topicLabel}*. O texto inteiro deve ser sobre isso.`,
  ];
  if (focus.imageLabel) {
    lines.push(
      `Imagem do post: ${focus.imageLabel}. Escreva uma legenda que combine com essa foto (sem descrever pixels).`
    );
  }
  if (focus.productTitle) {
    lines.push(
      `Destaque principal: *${focus.productTitle}*${focus.productPrice ? ` (${focus.productPrice})` : ""}.`
    );
  }
  if (focus.topicKey === "weekend") {
    lines.push("Tom de convite para o fim de semana.");
  }
  if (focus.topicKey === "place") {
    lines.push("Destaque a experiência de visitar o local.");
  }
  return lines.join("\n");
}

function promptForKind(
  kind: MarketingKind,
  ctx: ReturnType<typeof buildMarketingContext>,
  focus: MarketingFocus
): string {
  const base = `Negócio: ${ctx.businessName}
Site: ${ctx.siteUrl}
Gancho atual: ${ctx.tagline}
Sobre: ${ctx.description}
Endereço: ${ctx.address}
Instagram: ${ctx.instagram}
Ofertas cadastradas:
${ctx.products}

${focusBlock(focus)}`;

  switch (kind) {
    case "post":
      return `${base}

Crie a LEGENDA de um post para WhatsApp/Instagram:
1. Título chamativo com emoji (use *negrito*)
2. Uma ou duas frases ligadas ao assunto escolhido
3. Se for oferta específica, destaque só ela; senão cite até 3 ofertas do contexto
4. CTA com link ${ctx.siteUrl}

Entre 400 e 850 caracteres. Só a legenda.`;
    case "share":
      return `${base}

Crie UM texto para Status do WhatsApp ou grupos de turismo.
Tom de dica entre amigos, focado no assunto escolhido.
Entre 200 e 450 caracteres. Termine com ${ctx.siteUrl}. Só o texto.`;
    case "tagline":
      return `${base}

Crie UM gancho de atração para o topo do site, inspirado no assunto escolhido.
Entre 60 e 120 caracteres. Deve fazer o turista querer desviar a rota. Só o gancho.`;
  }
}

function geminiOptionsForKind(kind: MarketingKind) {
  switch (kind) {
    case "post":
      return { maxOutputTokens: 2048 };
    case "share":
      return { maxOutputTokens: 768 };
    case "tagline":
      return { maxOutputTokens: 256 };
  }
}

export function cleanMarketingCopy(text: string, kind: MarketingKind): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[\w]*\n?/, "").replace(/\n?```$/g, "");
  cleaned = cleaned.replace(/^(aqui está[^\n]+)\n+/i, "");
  cleaned = cleaned.replace(/^(segue[^\n]+)\n+/i, "");
  cleaned = cleaned.replace(/^(legenda|gancho|texto):\s*/i, "");

  if (/^["'].+["']$/s.test(cleaned)) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (kind === "tagline" && cleaned.length > 140) {
    const cut = cleaned.lastIndexOf(" ", 120);
    cleaned = cleaned.slice(0, cut > 40 ? cut : 120).trim();
  }

  return cleaned.trim();
}

export async function generateMarketingCopy(
  kind: MarketingKind,
  tenant: TenantWithMedia,
  rootDomain: string,
  focus: MarketingFocus
): Promise<string> {
  const ctx = buildMarketingContext(tenant, rootDomain);
  const raw = await runGeminiPrompt(
    LIA_SYSTEM,
    promptForKind(kind, ctx, focus),
    geminiOptionsForKind(kind)
  );
  return cleanMarketingCopy(raw, kind);
}

export function listMarketingTopics(products: TenantProduct[]): ListRow[] {
  const rows: ListRow[] = [
    { id: "mkt_topic_place", title: "O lugar", description: "Experiência e ambiente" },
    { id: "mkt_topic_weekend", title: "Fim de semana", description: "Convite pra visitar" },
  ];

  for (const product of products.slice(0, 8)) {
    if (rows.length >= 10) break;
    rows.push({
      id: `mkt_topic_prod_${product.id}`,
      title: product.title.slice(0, 24),
      description: (product.price ?? "Destaque da oferta").slice(0, 72),
    });
  }

  return rows;
}

const LIST_ROWS_MAX = 10;

function buildMarketingImageRows(tenant: TenantWithMedia): ListRow[] {
  const rows: ListRow[] = [];

  if (tenant.logoUrl?.startsWith("http")) {
    rows.push({ id: "mkt_img_logo", title: "Logo", description: "Marca do negócio" });
  }

  tenant.photos.forEach((photo, index) => {
    if (!photo.photoUrl.startsWith("http")) return;
    rows.push({
      id: `mkt_img_${photo.id}`,
      title: `Foto ${index + 1}`,
      description: "Galeria do site",
    });
  });

  for (const product of tenant.products) {
    if (!product.imageUrl?.startsWith("http")) continue;
    rows.push({
      id: `mkt_img_prod_${product.id}`,
      title: product.title.slice(0, 24),
      description: (product.price ? `Oferta · ${product.price}` : "Foto da oferta").slice(0, 72),
    });
  }

  return rows;
}

function paginateImageRows(rows: ListRow[], page: number): {
  pageRows: ListRow[];
  hasNext: boolean;
  hasPrev: boolean;
  total: number;
} {
  const total = rows.length;
  const slots = LIST_ROWS_MAX - 1;
  const offset = page * slots;
  const chunk = rows.slice(offset, offset + slots);
  const hasNext = offset + slots < total;
  const hasPrev = page > 0;

  const pageRows = [...chunk];
  if (hasNext) {
    pageRows.push({
      id: "mkt_img_next",
      title: "Ver mais imagens",
      description: `${total - offset - slots} restante(s)`,
    });
  } else if (hasPrev) {
    pageRows.push({
      id: "mkt_img_prev",
      title: "Imagens anteriores",
      description: "Voltar na lista",
    });
  }

  return { pageRows, hasNext, hasPrev, total };
}

export function marketingPhotoPickerMessage(
  tenant: TenantWithMedia,
  page = 0
): WhatsAppOutbound | null {
  const allRows = buildMarketingImageRows(tenant);
  if (!allRows.length) return null;

  const { pageRows, total } = paginateImageRows(allRows, page);
  const galleryCount = tenant.photos.filter((p) => p.photoUrl.startsWith("http")).length;
  const offerCount = tenant.products.filter((p) => p.imageUrl?.startsWith("http")).length;
  const hasLogo = tenant.logoUrl?.startsWith("http") ? 1 : 0;

  const body =
    total <= LIST_ROWS_MAX
      ? `Qual imagem usar? 📷\n${galleryCount} foto(s) da galeria · ${offerCount} oferta(s) com foto${hasLogo ? " · logo" : ""}`
      : `Qual imagem usar? 📷 (${page + 1}/${Math.ceil(total / (LIST_ROWS_MAX - 1))}) — ${total} opções no total`;

  const galleryRows = pageRows.filter(
    (row) => row.id === "mkt_img_logo" || /^mkt_img_\d+$/.test(row.id)
  );
  const offerRows = pageRows.filter((row) => row.id.startsWith("mkt_img_prod_"));
  const navRows = pageRows.filter(
    (row) => row.id === "mkt_img_next" || row.id === "mkt_img_prev"
  );

  const sections: Array<{ title: string; rows: ListRow[] }> = [];
  if (galleryRows.length) sections.push({ title: "Galeria", rows: galleryRows });
  if (offerRows.length) sections.push({ title: "Ofertas", rows: offerRows });
  if (navRows.length) sections.push({ title: "Mais", rows: navRows });
  if (!sections.length) sections.push({ title: "Imagens", rows: pageRows });

  return listMessage(body, "Ver imagens", sections);
}

export function marketingTopicPickerMessage(
  kind: MarketingKind,
  products: TenantProduct[]
): WhatsAppOutbound {
  const intro =
    kind === "post"
      ? "Sobre o que é o post? A IA monta o texto em cima disso ✨"
      : kind === "share"
        ? "Sobre o que divulgar? Escolha o assunto:"
        : "Qual ângulo pro gancho do site?";

  return listMessage(intro, "Ver assuntos", [
    { title: "Assunto", rows: listMarketingTopics(products) },
  ]);
}

export function resolveMarketingImage(
  actionId: string,
  tenant: TenantWithMedia
): { url: string; label: string } | null {
  if (actionId === "mkt_img_logo" && tenant.logoUrl?.startsWith("http")) {
    return { url: tenant.logoUrl, label: "Logo" };
  }

  const productMatch = actionId.match(/^mkt_img_prod_(\d+)$/);
  if (productMatch) {
    const product = tenant.products.find(
      (item) => item.id === Number.parseInt(productMatch[1], 10)
    );
    if (product?.imageUrl?.startsWith("http")) {
      return { url: product.imageUrl, label: product.title };
    }
    return null;
  }

  const match = actionId.match(/^mkt_img_(\d+)$/);
  if (!match) return null;

  const photo = tenant.photos.find((item) => item.id === Number.parseInt(match[1], 10));
  if (!photo?.photoUrl.startsWith("http")) return null;

  const index = tenant.photos.findIndex((item) => item.id === photo.id) + 1;
  return { url: photo.photoUrl, label: `Foto ${index}` };
}

export function resolveMarketingTopic(
  actionId: string,
  tenant: TenantWithMedia
): Omit<MarketingFocus, "imageUrl" | "imageLabel"> | null {
  if (actionId === "mkt_topic_place") {
    return { topicKey: "place", topicLabel: "O lugar" };
  }
  if (actionId === "mkt_topic_weekend") {
    return { topicKey: "weekend", topicLabel: "Fim de semana" };
  }

  const match = actionId.match(/^mkt_topic_prod_(\d+)$/);
  if (!match) return null;

  const product = tenant.products.find(
    (item) => item.id === Number.parseInt(match[1], 10)
  );
  if (!product) return null;

  return {
    topicKey: `prod_${product.id}`,
    topicLabel: product.title,
    productTitle: product.title,
    productPrice: product.price ?? undefined,
  };
}

export function captionForWhatsApp(caption: string): string {
  if (caption.length <= WHATSAPP_CAPTION_MAX) return caption;
  const cut = caption.lastIndexOf("\n", WHATSAPP_CAPTION_MAX - 20);
  const at = cut > WHATSAPP_CAPTION_MAX * 0.5 ? cut : WHATSAPP_CAPTION_MAX - 20;
  return `${caption.slice(0, at).trim()}…`;
}

export function splitWhatsAppMessages(text: string, maxLen = WHATSAPP_TEXT_SAFE): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.4) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.4) cut = remaining.lastIndexOf(" ", maxLen);
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
            description: "Escolhe foto + assunto + legenda",
          },
          {
            id: "lia_share",
            title: "Texto pra compartilhar",
            description: "Escolhe assunto e gera o texto",
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

export function isMarketingPickerAction(actionId: string): boolean {
  return (
    actionId.startsWith("mkt_img_") ||
    actionId.startsWith("mkt_topic_")
  );
}

export function isMarketingImageNavAction(actionId: string): boolean {
  return actionId === "mkt_img_next" || actionId === "mkt_img_prev";
}

export function isMarketingGenerateAction(actionId: string | undefined): boolean {
  return Boolean(actionId?.startsWith("mkt_topic_"));
}

export function marketingKindFromAction(actionId: string): MarketingKind | null {
  const map: Record<string, MarketingKind> = {
    lia_post: "post",
    lia_share: "share",
    lia_tagline: "tagline",
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
  copy: string,
  focus: MarketingFocus
): WhatsAppOutbound[] {
  const siteUrl = `https://${tenant.slug}.${rootDomain}`;

  if (kind === "post") {
    const imageUrl = focus.imageUrl;
    if (!imageUrl) {
      return [
        textMessage(
          "Para montar o *post com foto*, cadastre imagens no menu:\n*Imagens → Fotos*"
        ),
      ];
    }

    const caption = captionForWhatsApp(copy);
    return [
      textMessage(
        `✨ *Post pronto!* (${focus.imageLabel ?? "foto"} · ${focus.topicLabel})\nEncaminhe a imagem abaixo.\n\n📎 ${siteUrl}`
      ),
      imageMessage(imageUrl, caption),
      textMessage("Gostou? Envie *divulgar* para gerar outro."),
    ];
  }

  if (kind === "tagline") {
    return [textMessage(copy)];
  }

  const chunks = splitWhatsAppMessages(copy);
  return [
    textMessage(`✨ Texto sobre *${focus.topicLabel}* — copie abaixo:`),
    ...chunks.map((chunk) => textMessage(chunk)),
    textMessage("Gostou? Envie *divulgar* para gerar outro."),
  ];
}

export function focusFromTempData(tempData: {
  marketingTopicKey?: string;
  marketingTopicLabel?: string;
  marketingImageUrl?: string;
  marketingImageLabel?: string;
  marketingProductTitle?: string;
  marketingProductPrice?: string;
}): MarketingFocus | null {
  if (!tempData.marketingTopicKey || !tempData.marketingTopicLabel) return null;
  return {
    topicKey: tempData.marketingTopicKey,
    topicLabel: tempData.marketingTopicLabel,
    imageUrl: tempData.marketingImageUrl,
    imageLabel: tempData.marketingImageLabel,
    productTitle: tempData.marketingProductTitle,
    productPrice: tempData.marketingProductPrice,
  };
}

export { isGeminiConfigured };
