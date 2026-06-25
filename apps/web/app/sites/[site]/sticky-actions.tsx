import { googleMapsDirectionsUrl, whatsAppContactUrl, wazeNavigateUrl } from "@/lib/links";
import { IconMapPin, IconWhatsApp } from "./icons";
import styles from "./site.module.css";

interface StickyActionsProps {
  businessName: string;
  address: string | null;
  whatsappNumber: string | null;
}

export function StickyActions({ businessName, address, whatsappNumber }: StickyActionsProps) {
  const hasRoute = Boolean(address?.trim());
  const hasWhatsApp = Boolean(whatsappNumber?.trim());

  if (!hasRoute && !hasWhatsApp) return null;

  const waMessage = `Olá! Vi o site da ${businessName} e gostaria de mais informações.`;

  return (
    <div className={styles.stickyBar} role="navigation" aria-label="Ações rápidas">
      {hasRoute && (
        <div className={styles.stickyRouteGroup}>
          <a
            href={googleMapsDirectionsUrl(address!)}
            className={`${styles.stickyBtn} ${styles.stickyBtnMaps}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconMapPin size={18} />
            <span>Maps</span>
          </a>
          <a
            href={wazeNavigateUrl(address!)}
            className={`${styles.stickyBtn} ${styles.stickyBtnWaze}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.wazeMark} aria-hidden>
              W
            </span>
            <span>Waze</span>
          </a>
        </div>
      )}
      {hasWhatsApp && (
        <a
          href={whatsAppContactUrl(whatsappNumber!, waMessage)}
          className={`${styles.stickyBtn} ${styles.stickyBtnWhatsApp}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconWhatsApp size={20} />
          <span>WhatsApp</span>
        </a>
      )}
    </div>
  );
}
