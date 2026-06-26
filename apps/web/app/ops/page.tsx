import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOpsCookie } from "@/lib/ops-auth";
import { fetchOpsSummary, fetchOpsTenants } from "@/lib/ops-api";
import type { OpsSummary, OpsTenant } from "@/lib/ops-types";
import styles from "./ops.module.css";

export const metadata: Metadata = {
  title: "IAE Ops",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function statusClass(status: string): string {
  switch (status) {
    case "live":
      return styles.badgeLive;
    case "onboarding":
      return styles.badgeOnboarding;
    case "blocked":
      return styles.badgeBlocked;
    default:
      return styles.badgeRegistered;
  }
}

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
        {tenants.length === 0 ? (
          <p className={styles.empty}>Nenhum cliente ainda. Envie os convites pela Lia.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Negócio</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Lia</th>
                <th>Entrou em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.businessName}</strong>
                    {!t.businessName || t.businessName === "Pendente" ? (
                      <span className={styles.muted}> ({t.ownerName})</span>
                    ) : null}
                    <div className={styles.muted}>{t.slug}</div>
                    <div className={styles.muted}>
                      {t.productCount} oferta(s) · {t.photoCount} foto(s)
                    </div>
                  </td>
                  <td>
                    <span className={t.plan === "premium" ? styles.planPremium : styles.planFree}>
                      {t.plan}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusClass(t.status)}`}>
                      {t.statusLabel}
                    </span>
                  </td>
                  <td className={styles.chatState}>{t.chatStateLabel}</td>
                  <td className={styles.dateCell}>{formatDate(t.createdAt)}</td>
                  <td className={styles.actions}>
                    {t.siteUrl ? (
                      <a href={t.siteUrl} target="_blank" rel="noopener noreferrer">
                        Site
                      </a>
                    ) : t.previewUrl ? (
                      <a href={t.previewUrl} target="_blank" rel="noopener noreferrer">
                        Preview
                      </a>
                    ) : null}
                    <a href={t.whatsappUrl} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
