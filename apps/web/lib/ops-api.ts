import type { OpsSummary, OpsTenant } from "./ops-types";

function getApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

async function opsFetch<T>(path: string): Promise<T> {
  const password = process.env.OPS_PASSWORD;
  if (!password) {
    throw new Error("OPS_PASSWORD não configurado");
  }

  const res = await fetch(`${getApiUrl()}/api/ops${path}`, {
    headers: { Authorization: `Bearer ${password}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Ops API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchOpsSummary(): Promise<OpsSummary> {
  return opsFetch<OpsSummary>("/summary");
}

export async function fetchOpsTenants(): Promise<{ tenants: OpsTenant[] }> {
  return opsFetch<{ tenants: OpsTenant[] }>("/tenants");
}
