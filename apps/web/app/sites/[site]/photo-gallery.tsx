"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./site.module.css";

interface PhotoGalleryProps {
  photos: string[];
  businessName: string;
}

export function PhotoGallery({ photos, businessName }: PhotoGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);

  const goPrev = useCallback(() => {
    setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setOpenIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i));
  }, [photos.length]);

  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openIndex, close, goPrev, goNext]);

  return (
    <>
      <div className={styles.photoGrid}>
        {photos.map((url, i) => (
          <figure
            key={url}
            className={`${styles.photoFrame} ${i === 0 ? styles.photoFeatured : ""}`}
          >
            <button
              type="button"
              className={styles.photoButton}
              onClick={() => setOpenIndex(i)}
              aria-label={`Ampliar foto ${i + 1} de ${photos.length}`}
            >
              <img
                src={url}
                alt={`Foto ${i + 1} de ${businessName}`}
                className={styles.photo}
              />
            </button>
          </figure>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`Galeria — foto ${openIndex + 1} de ${photos.length}`}
          onClick={close}
        >
          <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.lightboxClose}
              onClick={close}
              aria-label="Fechar"
            >
              ×
            </button>

            {openIndex > 0 && (
              <button
                type="button"
                className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
                onClick={goPrev}
                aria-label="Foto anterior"
              >
                ‹
              </button>
            )}

            <img
              src={photos[openIndex]}
              alt={`Foto ${openIndex + 1} de ${businessName}`}
              className={styles.lightboxImage}
            />

            {openIndex < photos.length - 1 && (
              <button
                type="button"
                className={`${styles.lightboxNav} ${styles.lightboxNext}`}
                onClick={goNext}
                aria-label="Próxima foto"
              >
                ›
              </button>
            )}

            <span className={styles.lightboxCounter}>
              {openIndex + 1} / {photos.length}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
