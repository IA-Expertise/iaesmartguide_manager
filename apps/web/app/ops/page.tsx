import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOpsCookie } from "@/lib/ops-auth";
import { fetchOpsSummary, fetchOpsTenants } from "@/lib/ops-api";
import type { OpsSummary, OpsTenant } from "@/lib/ops-types";
import { OpsTenantsTable } from "./ops-tenants-table";
import styles from "./ops.module.css";

export const metadata: Metadata = {
  title: "IAE Ops",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const cookieStore = await cookies();
  if (!verifyOpsCookie(cookieStore.get("ops_session")?.value)) {
    redirect("/ops/login");
  }

  let summary: OpsSummary;
  let tenants: OpsTenant[];
  let loadError: string | null = null;

  try {
    const data = await Promise.all([fetchOpsSummary(), fetchOpsTenants()]);
    summary = data[0];
    tenants = data[1].tenants;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Erro ao carregar dados";
    summary = { total: 0, free: 0, premium: 0, published: 0, onboarding: 0, registeredOnly: 0 };
    tenants = [];
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>IAE Ops</h1>
          <p className={styles.subtitle}>Acompanhamento de clientes e convites</p>
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
          <span className={styles.statValue}>{summary.total}</span>
          <span className={styles.statLabel}>Total</span>
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

      <section className={styles.tableWrap} aria-label="Clientes">
        <OpsTenantsTable tenants={tenants} />
      </section>
    </main>
  );
}
