import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchTenant } from "@/lib/api";
import styles from "./site.module.css";

interface PageProps {
  params: Promise<{ site: string }>;
}

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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {tenant.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.businessName} className={styles.logo} />
        )}
        <h1>{tenant.businessName}</h1>
        {tenant.description && <p className={styles.description}>{tenant.description}</p>}
        {tenant.address && <p className={styles.address}>{tenant.address}</p>}
      </header>

      {tenant.photos.length > 0 && (
        <section className={styles.gallery}>
          <h2>Galeria</h2>
          <div className={styles.photoGrid}>
            {tenant.photos.map((url, i) => (
              <img key={i} src={url} alt={`Foto ${i + 1}`} className={styles.photo} />
            ))}
          </div>
        </section>
      )}

      {tenant.products.length > 0 && (
        <section className={styles.products}>
          <h2>Produtos e ofertas</h2>
          <ul className={styles.productList}>
            {tenant.products.map((product) => (
              <li key={product.id} className={styles.productCard}>
                {product.imageUrl && (
                  <img src={product.imageUrl} alt={product.title} className={styles.productImage} />
                )}
                <div>
                  <strong>{product.title}</strong>
                  {product.price && <span className={styles.price}>{product.price}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tenant.youtubeUrl && (
        <section className={styles.youtube}>
          <h2>Vídeo</h2>
          <a href={tenant.youtubeUrl} target="_blank" rel="noopener noreferrer">
            Assistir no YouTube
          </a>
        </section>
      )}

      {!tenant.isPublished && (
        <p className={styles.draft}>Rascunho — visível apenas para preview.</p>
      )}

      <footer className={styles.footer}>
        <small>IAE Smart Guide</small>
      </footer>
    </main>
  );
}
