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

  if (!photos.length) return null;

  const hero = photos[0];
  const grid = photos.slice(1, 5);
  const extra = photos.slice(5);

  return (
    <>
      <figure className={styles.heroFigure}>
        <button
          type="button"
          className={styles.heroButton}
          onClick={() => setOpenIndex(0)}
          aria-label="Ampliar foto principal"
        >
          <img
            src={hero}
            alt={`${businessName} — foto principal`}
            className={styles.heroImage}
          />
        </button>
      </figure>

      {grid.length > 0 && (
        <div className={styles.featureGrid} aria-label="Galeria de fotos">
          {grid.map((url, i) => (
            <button
              key={url}
              type="button"
              className={styles.featureCell}
              onClick={() => setOpenIndex(i + 1)}
              aria-label={`Ampliar foto ${i + 2} de ${photos.length}`}
            >
              <img
                src={url}
                alt={`Foto ${i + 2} de ${businessName}`}
                className={styles.featureImage}
              />
            </button>
          ))}
        </div>
      )}

      {extra.length > 0 && (
        <>
          <p className={styles.scrollHint}>Mais fotos — deslize para ver</p>
          <div className={styles.photoStrip}>
            {extra.map((url, i) => (
              <figure key={url} className={styles.photoFrame}>
                <button
                  type="button"
                  className={styles.photoButton}
                  onClick={() => setOpenIndex(i + 5)}
                  aria-label={`Ampliar foto ${i + 6} de ${photos.length}`}
                >
                  <img
                    src={url}
                    alt={`Foto ${i + 6} de ${businessName}`}
                    className={styles.photo}
                  />
                </button>
              </figure>
            ))}
          </div>
        </>
      )}

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
