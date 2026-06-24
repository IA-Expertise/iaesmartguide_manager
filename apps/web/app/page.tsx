import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "IAE Smart Guide",
  description: "Mini-sites institucionais para produtores rurais",
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <h1>IAE Smart Guide</h1>
      <p>Crie e gerencie seu mini-site pelo WhatsApp ou painel web.</p>
      <p className={styles.hint}>
        Em desenvolvimento local: acesse um tenant com{" "}
        <code>?site=seu-slug</code> em localhost:3000
      </p>
    </main>
  );
}
