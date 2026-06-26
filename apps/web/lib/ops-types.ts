export interface OpsSummary {
  total: number;
  free: number;
  premium: number;
  published: number;
  onboarding: number;
  registeredOnly: number;
}

export interface OpsTenant {
  id: number;
  businessName: string;
  ownerName: string;
  slug: string;
  whatsappNumber: string;
  plan: string;
  isPublished: boolean;
  paymentStatus: string;
  status: "live" | "onboarding" | "registered" | "blocked";
  statusLabel: string;
  chatState: string | null;
  chatStateLabel: string;
  productCount: number;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
  siteUrl: string | null;
  previewUrl: string | null;
  whatsappUrl: string;
}
