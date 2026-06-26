import { whatsAppContactUrl } from "@/lib/links";
import { IconWhatsApp } from "./icons";
import styles from "./site.module.css";

interface WhatsAppCtaProps {
  businessName: string;
  whatsappNumber: string;
}

export function WhatsAppCta({ businessName, whatsappNumber }: WhatsAppCtaProps) {
  const message = `Olá! Vi o site da ${businessName} e gostaria de mais informações.`;

  return (
    <a
      href={whatsAppContactUrl(whatsappNumber, message)}
      className={styles.primaryCta}
      target="_blank"
      rel="noopener noreferrer"
    >
      <IconWhatsApp size={22} />
      <span>Falar no WhatsApp</span>
    </a>
  );
}
