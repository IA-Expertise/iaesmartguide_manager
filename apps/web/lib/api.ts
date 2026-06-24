export interface TenantPublic {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  youtubeUrl: string | null;
  description: string | null;
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

export async function fetchTenant(slug: string): Promise<TenantPublic | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const res = await fetch(`${apiUrl}/api/tenants/${slug}`, {
    next: { tags: [`tenant-${slug}`] },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch tenant: ${res.status}`);

  return res.json();
}
