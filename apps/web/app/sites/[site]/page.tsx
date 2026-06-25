import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchTenant } from "@/lib/api";
import { introBody, resolveHeroTagline } from "@/lib/tagline";
import { themeFromSlug, themeToCssVars, youtubeEmbedId } from "@/lib/theme";
import { IconBag, IconGallery, IconMapPin, IconPlay } from "./icons";
import { PhotoGallery } from "./photo-gallery";
import { ProductList } from "./product-list";
import { StickyActions } from "./sticky-actions";
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
  const hasStickyActions = Boolean(tenant.address?.trim() || tenant.whatsappNumber?.trim());
  const showHeroBand = Boolean(heroTagline);

  return (
    <main
      className={`${styles.page}${hasStickyActions ? ` ${styles.pageWithSticky}` : ""}`}
      style={cssVars}
    >
      <div className={styles.siteHeader}>
        {tenant.logoUrl ? (
          <>
            <img
              src={tenant.logoUrl}
              alt={tenant.businessName}
              className={styles.headerLogo}
            />
            <h1 className={styles.srOnly}>{tenant.businessName}</h1>
          </>
        ) : (
          <h1 className={styles.headerTitle}>{tenant.businessName}</h1>
        )}
      </div>

      {showHeroBand && (
        <header className={styles.hero}>
          <div className={styles.heroBg} aria-hidden />
          <p className={styles.tagline}>{heroTagline}</p>
        </header>
      )}

      {!showHeroBand && !tenant.logoUrl && (
        <h1 className={styles.srOnly}>{tenant.businessName}</h1>
      )}

      <div className={styles.content}>
        {aboutText && (
          <section className={styles.introCard} aria-label="Sobre">
            <p className={styles.introText}>{aboutText}</p>
          </section>
        )}

        {hasGallery && (
          <section className={styles.section} aria-labelledby="gallery-heading">
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon}>
                <IconGallery />
              </span>
              <h2 id="gallery-heading">Galeria</h2>
            </div>
            <PhotoGallery photos={tenant.photos} businessName={tenant.businessName} />
          </section>
        )}

        {hasProducts && (
          <section className={styles.section} aria-labelledby="products-heading">
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon}>
                <IconBag />
              </span>
              <h2 id="products-heading">Produtos e ofertas</h2>
            </div>
            <ProductList products={tenant.products} />
          </section>
        )}

        {tenant.youtubeUrl && (
          <section className={styles.section} aria-labelledby="video-heading">
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon}>
                <IconPlay />
              </span>
              <h2 id="video-heading">Vídeo</h2>
            </div>
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
        <div className={styles.footerLine} aria-hidden />
        <small>
          Mini-site por <strong>IAE Smart Guide</strong>
        </small>
      </footer>

      <StickyActions
        businessName={tenant.businessName}
        address={tenant.address}
        whatsappNumber={tenant.whatsappNumber}
      />
    </main>
  );
}
