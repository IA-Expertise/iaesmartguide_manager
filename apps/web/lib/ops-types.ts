export interface OpsSummary {
  total: number;
  free: number;
  premium: number;
  published: number;
  onboarding: number;
  registeredOnly: number;
  whatsappContacts: number;
  contactsWithoutTenant: number;
}

export interface OpsContact {
  id: number | null;
  displayName: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  slug: string | null;
  plan: string | null;
  isPublished: boolean;
  hasTenant: boolean;
  status: "live" | "onboarding" | "registered" | "blocked" | "contact";
  statusLabel: string;
  chatState: string | null;
  chatStateLabel: string;
  productCount: number;
  photoCount: number;
  lastActivityAt: string;
  createdAt: string | null;
  siteUrl: string | null;
  previewUrl: string | null;
  whatsappUrl: string;
}

/** @deprecated Use OpsContact */
export type OpsTenant = OpsContact;
