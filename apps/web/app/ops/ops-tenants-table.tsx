"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OpsTenant } from "@/lib/ops-types";
import styles from "./ops.module.css";

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

function DeleteTenantButton({
  tenant,
  onDeleted,
}: {
  tenant: OpsTenant;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    const label = tenant.businessName === "Pendente" ? tenant.slug : tenant.businessName;
    const ok = window.confirm(
      `Remover "${label}" do sistema?\n\nO site e o histórico da Lia serão apagados. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/ops/tenants/${tenant.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível remover");
        return;
      }
      onDeleted();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className={styles.deleteWrap}>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={loading}
        title="Remover do sistema"
      >
        {loading ? "…" : "Remover"}
      </button>
      {error && <span className={styles.deleteError}>{error}</span>}
    </span>
  );
}

export function OpsTenantsTable({ tenants }: { tenants: OpsTenant[] }) {
  const router = useRouter();

  if (tenants.length === 0) {
    return <p className={styles.empty}>Nenhum cliente ainda. Envie os convites pela Lia.</p>;
  }

  return (
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
              <DeleteTenantButton tenant={t} onDeleted={() => router.refresh()} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
