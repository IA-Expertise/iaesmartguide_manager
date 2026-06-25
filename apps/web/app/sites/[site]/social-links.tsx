import { normalizeInstagramUrl } from "@/lib/instagram";
import { whatsAppContactUrl } from "@/lib/links";
import { IconInstagram, IconWhatsApp } from "./icons";
import styles from "./site.module.css";

interface SocialLinksProps {
  businessName: string;
  whatsappNumber: string | null;
  instagramUrl: string | null;
}

export function SocialLinks({ businessName, whatsappNumber, instagramUrl }: SocialLinksProps) {
  const instagram = normalizeInstagramUrl(instagramUrl);
  const hasWhatsApp = Boolean(whatsappNumber?.trim());
  const hasInstagram = Boolean(instagram);

  if (!hasWhatsApp && !hasInstagram) return null;

  const waMessage = `Olá! Vi o site da ${businessName} e gostaria de mais informações.`;
  const single = (hasWhatsApp && !hasInstagram) || (!hasWhatsApp && hasInstagram);

  return (
    <section className={styles.socialSection} aria-label="Contato e redes sociais">
      <h2 className={styles.socialHeading}>Fale com a gente</h2>
      <div className={`${styles.socialGrid}${single ? ` ${styles.socialGridSingle}` : ""}`}>
        {hasWhatsApp && (
          <a
            href={whatsAppContactUrl(whatsappNumber!, waMessage)}
            className={`${styles.socialBtn} ${styles.socialBtnWhatsApp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconWhatsApp size={22} />
            <span>WhatsApp</span>
          </a>
        )}
        {hasInstagram && (
          <a
            href={instagram!}
            className={`${styles.socialBtn} ${styles.socialBtnInstagram}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconInstagram size={22} />
            <span>Instagram</span>
          </a>
        )}
      </div>
    </section>
  );
}
