import { googleMapsDirectionsUrl, whatsAppContactUrl } from "@/lib/links";
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
  const singleAction = (hasRoute && !hasWhatsApp) || (!hasRoute && hasWhatsApp);

  return (
    <div
      className={`${styles.stickyBar}${singleAction ? ` ${styles.stickyBarSingle}` : ""}`}
      role="navigation"
      aria-label="Ações rápidas"
    >
      {hasRoute && (
        <a
          href={googleMapsDirectionsUrl(address!)}
          className={`${styles.stickyBtn} ${styles.stickyBtnRoute}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconMapPin size={18} />
          <span>Como chegar</span>
        </a>
      )}
      {hasWhatsApp && (
        <a
          href={whatsAppContactUrl(whatsappNumber!, waMessage)}
          className={`${styles.stickyBtn} ${styles.stickyBtnWhatsApp}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconWhatsApp size={18} />
          <span>Falar no WhatsApp</span>
        </a>
      )}
    </div>
  );
}
