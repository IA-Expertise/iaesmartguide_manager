"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OpsContact } from "@/lib/ops-types";
import styles from "./ops.module.css";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function planClass(plan: string): string {
  if (plan === "premium") return styles.planPremium;
  if (plan === "trial") return styles.planTrial;
  return styles.planFree;
}

function statusClass(status: string): string {
  switch (status) {
    case "live":
      return styles.badgeLive;
    case "onboarding":
      return styles.badgeOnboarding;
    case "blocked":
      return styles.badgeBlocked;
    case "contact":
      return styles.badgeContact;
    default:
      return styles.badgeRegistered;
  }
}

function DeleteTenantButton({
  contact,
  onDeleted,
}: {
  contact: OpsContact;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (contact.id == null) return;

    const ok = window.confirm(
      `Remover "${contact.displayName}" do sistema?\n\nO site e o histórico da Lia serão apagados. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/ops/tenants/${contact.id}`, { method: "DELETE" });
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

  if (contact.id == null) return null;

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

export function OpsTenantsTable({ contacts }: { contacts: OpsContact[] }) {
  const router = useRouter();

  if (contacts.length === 0) {
    return <p className={styles.empty}>Nenhum contato ainda. Envie os convites pela Lia.</p>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Nome</th>
          <th>WhatsApp</th>
          <th>Plano</th>
          <th>Status</th>
          <th>Lia</th>
          <th>Última interação</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {contacts.map((c) => (
          <tr key={c.whatsappNumber}>
            <td>
              <strong>{c.displayName}</strong>
              {c.slug ? <div className={styles.muted}>{c.slug}</div> : null}
              {c.hasTenant ? (
                <div className={styles.muted}>
                  {c.productCount} oferta(s) · {c.photoCount} foto(s)
                </div>
              ) : null}
            </td>
            <td>
              <a
                href={c.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.whatsappLink}
              >
                {c.whatsappDisplay}
              </a>
            </td>
            <td>
              {c.plan ? (
                <span className={planClass(c.plan)}>{c.plan}</span>
              ) : (
                <span className={styles.muted}>—</span>
              )}
            </td>
            <td>
              <span className={`${styles.badge} ${statusClass(c.status)}`}>
                {c.statusLabel}
              </span>
            </td>
            <td className={styles.chatState}>{c.chatStateLabel}</td>
            <td className={styles.dateCell}>{formatDate(c.lastActivityAt)}</td>
            <td className={styles.actions}>
              {c.siteUrl ? (
                <a href={c.siteUrl} target="_blank" rel="noopener noreferrer">
                  Site
                </a>
              ) : c.previewUrl ? (
                <a href={c.previewUrl} target="_blank" rel="noopener noreferrer">
                  Preview
                </a>
              ) : null}
              <a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">
                Abrir
              </a>
              <DeleteTenantButton contact={c} onDeleted={() => router.refresh()} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
