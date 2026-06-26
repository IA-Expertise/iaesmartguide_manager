import styles from "./site.module.css";

const DEFAULT_LIA = "5519936196154";

function liaWhatsappNumber(): string {
  return (process.env.NEXT_PUBLIC_LIA_WHATSAPP ?? DEFAULT_LIA).replace(/\D/g, "");
}

export function AcquisitionBanner() {
  const number = liaWhatsappNumber();
  const text = encodeURIComponent("Oi Lia! Quero um mini-site para o meu negócio");
  const href = `https://wa.me/${number}?text=${text}`;

  return (
    <p className={styles.acquisition}>
      Quer um mini-site assim pro seu negócio?{" "}
      <a href={href} target="_blank" rel="noopener noreferrer">
        Fale com a Lia no WhatsApp
      </a>
    </p>
  );
}
