export interface TenantPublic {
  slug: string;
  businessName: string;
  whatsappNumber: string;
  logoUrl: string | null;
  youtubeUrl: string | null;
  description: string | null;
  tagline: string | null;
  address: string | null;
  isPublished: boolean;
  photos: string[];
  products: Array<{
    id: number;
    title: string;
    price: string | null;
    imageUrl: string | null;
  }>;
}

function getApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

export async function fetchTenant(slug: string): Promise<TenantPublic | null> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/tenants/${slug}`, {
    cache: "no-store",
    next: { tags: [`tenant-${slug}`] },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch tenant: ${res.status}`);

  return res.json();
}
