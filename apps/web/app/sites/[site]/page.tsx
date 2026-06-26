import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchTenant } from "@/lib/api";
import { introBody, resolveHeroTagline } from "@/lib/tagline";
import { themeFromSlug, themeToCssVars, youtubeEmbedId } from "@/lib/theme";
import { IconBag, IconMapPin, IconPlay } from "./icons";
import { PhotoGallery } from "./photo-gallery";
import { ProductList } from "./product-list";
import { StickyActions } from "./sticky-actions";
import { WeatherWidget } from "./weather-widget";
import { AcquisitionBanner } from "./acquisition-banner";
import { WhatsAppCta } from "./whatsapp-cta";
import styles from "./site.module.css";

interface PageProps {
  params: Promise<{ site: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { site } = await params;
  const tenant = await fetchTenant(site);
  if (!tenant) return { title: "Site não encontrado" };
  return {
    title: tenant.businessName,
    description: tenant.description ?? `Conheça ${tenant.businessName}`,
  };
}

export default async function TenantSitePage({ params }: PageProps) {
  const { site } = await params;
  const tenant = await fetchTenant(site);

  if (!tenant) notFound();

  const theme = themeFromSlug(tenant.slug);
  const cssVars = themeToCssVars(theme);
  const videoId = tenant.youtubeUrl ? youtubeEmbedId(tenant.youtubeUrl) : null;
  const hasGallery = tenant.photos.length > 0;
  const hasProducts = tenant.products.length > 0;
  const heroTagline = resolveHeroTagline(tenant.tagline, tenant.description);
  const aboutText = introBody(tenant.description, heroTagline);
  const hasWhatsApp = Boolean(tenant.whatsappNumber?.trim());
  const hasStickyActions = Boolean(tenant.address?.trim() || hasWhatsApp);

  return (
    <main
      className={`${styles.page}${hasStickyActions ? ` ${styles.pageWithSticky}` : ""}`}
      style={cssVars}
    >
      <header className={styles.brandHeader}>
        <div className={styles.brandWeather}>
          <WeatherWidget address={tenant.address} />
        </div>

        <div className={styles.brandCenter}>
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt=""
              className={styles.brandLogo}
            />
          ) : null}
          <h1 className={styles.brandName}>{tenant.businessName}</h1>
          {heroTagline && <p className={styles.brandTagline}>{heroTagline}</p>}
        </div>
      </header>

      <div className={styles.content}>
        {hasGallery && (
          <section className={styles.mediaSection} aria-label="Fotos">
            <PhotoGallery photos={tenant.photos} businessName={tenant.businessName} />
          </section>
        )}

        {aboutText && (
          <section className={styles.introCard} aria-label="Sobre">
            <p className={styles.introText}>{aboutText}</p>
          </section>
        )}

        {hasProducts && (
          <section className={styles.section} aria-labelledby="products-heading">
            <h2 id="products-heading" className={styles.sectionTitle}>
              <span className={styles.sectionIconWrap}>
                <IconBag size={18} />
              </span>
              Produtos e ofertas
            </h2>
            <ProductList products={tenant.products} />
          </section>
        )}

        {tenant.youtubeUrl && (
          <section className={styles.section} aria-labelledby="video-heading">
            <h2 id="video-heading" className={styles.sectionTitle}>
              <span className={styles.sectionIconWrap}>
                <IconPlay size={18} />
              </span>
              Vídeo
            </h2>
            {videoId ? (
              <div className={styles.videoWrap}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={`Vídeo de ${tenant.businessName}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className={styles.videoFrame}
                />
              </div>
            ) : (
              <a
                href={tenant.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.youtubeLink}
              >
                <IconPlay className={styles.youtubeLinkIcon} />
                Assistir no YouTube
              </a>
            )}
          </section>
        )}

        {!hasGallery && !hasProducts && !tenant.youtubeUrl && !aboutText && (
          <section className={styles.emptyState}>
            <p>Em breve mais conteúdo sobre {tenant.businessName}.</p>
          </section>
        )}

        {hasWhatsApp && (
          <WhatsAppCta
            businessName={tenant.businessName}
            whatsappNumber={tenant.whatsappNumber}
          />
        )}
      </div>

      {!tenant.isPublished && (
        <p className={styles.draft}>Rascunho — visível apenas para preview.</p>
      )}

      <footer className={styles.footer}>
        {tenant.address && (
          <p className={styles.footerAddress}>
            <IconMapPin className={styles.footerAddressIcon} aria-hidden />
            <span>{tenant.address}</span>
          </p>
        )}
        {tenant.plan === "free" && (
          <div className={styles.acquisitionWrap}>
            <AcquisitionBanner />
          </div>
        )}
        <div className={styles.footerLine} aria-hidden />
        <small>Mini-site criado por Eduardo Sona para IAE Smart Guide</small>
      </footer>

      <StickyActions
        businessName={tenant.businessName}
        address={tenant.address}
        whatsappNumber={tenant.whatsappNumber}
      />
    </main>
  );
}
