import type { Metadata } from "next";
import styles from "./page.module.css";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "iaesmartguide.com.br";

export const metadata: Metadata = {
  title: "IAE Smart Guide",
  description: "Mini-sites institucionais para produtores rurais",
};

export default function HomePage() {
  const exampleUrl = `https://adegatoninho.${ROOT_DOMAIN}`;

  return (
    <main className={styles.page}>
      <h1>IAE Smart Guide</h1>
      <p>Crie e gerencie seu mini-site pelo WhatsApp ou painel web.</p>
      <p className={styles.hint}>
        Exemplo de mini-site:{" "}
        <a href={exampleUrl} className={styles.exampleLink}>
          adegatoninho.{ROOT_DOMAIN}
        </a>
      </p>
    </main>
  );
}
