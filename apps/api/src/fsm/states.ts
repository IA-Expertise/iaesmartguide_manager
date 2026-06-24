export const ChatStates = {
  START: "START",
  WAITING_PAYMENT: "WAITING_PAYMENT",
  COLLECTING_NAME: "COLLECTING_NAME",
  COLLECTING_LOGO: "COLLECTING_LOGO",
  COLLECTING_PHOTOS: "COLLECTING_PHOTOS",
  COLLECTING_YOUTUBE: "COLLECTING_YOUTUBE",
  CONFIRMED: "CONFIRMED",
  EDITING: "EDITING",
} as const;

export type ChatState = (typeof ChatStates)[keyof typeof ChatStates];

export interface TempData {
  businessName?: string;
  slug?: string;
  logoUrl?: string;
  photos?: string[];
  youtubeUrl?: string | null;
  description?: string;
  address?: string;
}
