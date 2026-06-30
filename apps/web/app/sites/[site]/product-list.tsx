"use client";

import { useState } from "react";
import { productWhatsAppMessage, whatsAppContactUrl } from "@/lib/links";
import { IconBag } from "./icons";
import styles from "./site.module.css";

const INITIAL_VISIBLE = 4;

interface Product {
  id: number;
  title: string;
  price: string | null;
  imageUrl: string | null;
}

interface ProductListProps {
  products: Product[];
  whatsappNumber?: string | null;
}

function ProductCard({
  product,
  whatsappNumber,
}: {
  product: Product;
  whatsappNumber?: string | null;
}) {
  const hasWhatsApp = Boolean(whatsappNumber?.trim());
  const content = (
    <>
      <div className={styles.productMedia}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} className={styles.productImage} />
        ) : (
          <div className={styles.productImageFallback}>
            <IconBag size={28} />
          </div>
        )}
        {product.price && <span className={styles.priceBadge}>{product.price}</span>}
      </div>
      <div className={styles.productBody}>
        <strong className={styles.productTitle}>{product.title}</strong>
        {!product.price && !hasWhatsApp && (
          <span className={styles.priceInline}>Consulte</span>
        )}
        {hasWhatsApp && <span className={styles.productCta}>Eu quero !</span>}
      </div>
    </>
  );

  if (!hasWhatsApp) {
    return <div className={styles.productCard}>{content}</div>;
  }

  return (
    <a
      href={whatsAppContactUrl(whatsappNumber!, productWhatsAppMessage(product.title))}
      className={`${styles.productCard} ${styles.productCardLink}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Eu quero ${product.title} — pedir pelo WhatsApp`}
    >
      {content}
    </a>
  );
}

export function ProductList({ products, whatsappNumber }: ProductListProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = products.length > INITIAL_VISIBLE;
  const visible = expanded ? products : products.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <ul className={styles.productGrid}>
        {visible.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} whatsappNumber={whatsappNumber} />
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          className={styles.expandButton}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Ver menos"
            : `Ver todas as ofertas (${products.length})`}
        </button>
      )}
    </>
  );
}
