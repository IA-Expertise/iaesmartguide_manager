import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOpsCookie } from "@/lib/ops-auth";
import { fetchOpsContacts, fetchOpsSummary } from "@/lib/ops-api";
import type { OpsContact, OpsSummary } from "@/lib/ops-types";
import { OpsTenantsTable } from "./ops-tenants-table";
import styles from "./ops.module.css";

export const metadata: Metadata = {
  title: "IAE Ops",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const emptySummary: OpsSummary = {
  total: 0,
  free: 0,
  premium: 0,
  published: 0,
  onboarding: 0,
  registeredOnly: 0,
  whatsappContacts: 0,
  contactsWithoutTenant: 0,
};

export default async function OpsPage() {
  const cookieStore = await cookies();
  if (!verifyOpsCookie(cookieStore.get("ops_session")?.value)) {
    redirect("/ops/login");
  }

  let summary: OpsSummary;
  let contacts: OpsContact[];
  let loadError: string | null = null;

  try {
    const data = await Promise.all([fetchOpsSummary(), fetchOpsContacts()]);
    summary = data[0];
    contacts = data[1].contacts;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Erro ao carregar dados";
    summary = emptySummary;
    contacts = [];
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>IAE Ops</h1>
          <p className={styles.subtitle}>Contatos WhatsApp e clientes cadastrados</p>
        </div>
        <form action="/api/ops/logout" method="POST">
          <button type="submit" className={styles.logoutBtn}>
            Sair
          </button>
        </form>
      </header>

      {loadError && <p className={styles.errorBanner}>{loadError}</p>}

      <section className={styles.stats} aria-label="Resumo">
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.whatsappContacts}</span>
          <span className={styles.statLabel}>Falaram com Lia</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.contactsWithoutTenant}</span>
          <span className={styles.statLabel}>Sem cadastro</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.total}</span>
          <span className={styles.statLabel}>Clientes</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.published}</span>
          <span className={styles.statLabel}>No ar</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.onboarding}</span>
          <span className={styles.statLabel}>Em cadastro</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.free}</span>
          <span className={styles.statLabel}>Free</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{summary.premium}</span>
          <span className={styles.statLabel}>Premium</span>
        </div>
      </section>

      <section className={styles.tableWrap} aria-label="Contatos WhatsApp">
        <OpsTenantsTable contacts={contacts} />
      </section>
    </main>
  );
}
