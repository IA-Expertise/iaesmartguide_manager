import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyOpsCookie } from "@/lib/ops-auth";

function getApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  if (!verifyOpsCookie(cookieStore.get("ops_session")?.value)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const password = process.env.OPS_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "OPS_PASSWORD não configurado" }, { status: 503 });
  }

  const { id } = await context.params;
  const res = await fetch(`${getApiUrl()}/api/ops/tenants/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${password}` },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
