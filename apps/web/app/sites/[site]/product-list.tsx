"use client";

import { useState } from "react";
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
}

export function ProductList({ products }: ProductListProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = products.length > INITIAL_VISIBLE;
  const visible = expanded ? products : products.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <ul className={styles.productGrid}>
        {visible.map((product) => (
          <li key={product.id} className={styles.productCard}>
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
              {!product.price && <span className={styles.priceInline}>Consulte</span>}
            </div>
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
