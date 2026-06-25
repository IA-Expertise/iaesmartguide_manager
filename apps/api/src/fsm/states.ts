export const ChatStates = {
  START: "START",
  WAITING_PAYMENT: "WAITING_PAYMENT",
  COLLECTING_NAME: "COLLECTING_NAME",
  COLLECTING_LOGO: "COLLECTING_LOGO",
  COLLECTING_PHOTOS: "COLLECTING_PHOTOS",
  COLLECTING_YOUTUBE: "COLLECTING_YOUTUBE",
  CONFIRMED: "CONFIRMED",
  EDITING_DESCRIPTION: "EDITING_DESCRIPTION",
  EDITING_ADDRESS: "EDITING_ADDRESS",
  EDITING_LOGO: "EDITING_LOGO",
  EDITING_PHOTOS: "EDITING_PHOTOS",
  EDITING_PRODUCT_TITLE: "EDITING_PRODUCT_TITLE",
  EDITING_PRODUCT_PRICE: "EDITING_PRODUCT_PRICE",
  EDITING_PRODUCT_IMAGE: "EDITING_PRODUCT_IMAGE",
  EDITING_DELETE_PRODUCT: "EDITING_DELETE_PRODUCT",
  EDITING_DELETE_PRODUCT_CONFIRM: "EDITING_DELETE_PRODUCT_CONFIRM",
  EDITING_YOUTUBE: "EDITING_YOUTUBE",
  /** @deprecated use EDITING_* states */
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
  productTitle?: string;
  productPrice?: string | null;
  productImageUrl?: string;
  productIdToDelete?: number;
}
