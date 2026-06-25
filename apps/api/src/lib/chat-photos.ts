import { prisma } from "@iaesmartguide/db";
import type { TempData } from "../fsm/states.js";

const MAX_GALLERY_PHOTOS = 5;

export async function appendPhotoToChatState(
  phone: string,
  photoUrl: string
): Promise<{ photos: string[]; added: boolean; atCapacity: boolean }> {
  const state = await prisma.chatState.findUnique({ where: { whatsappNumber: phone } });
  if (!state) {
    throw new Error(`chat state ausente para ${phone}`);
  }

  const tempData = { ...((state.tempData ?? {}) as TempData) };
  const existing = tempData.photos ?? [];

  if (existing.includes(photoUrl)) {
    return { photos: existing, added: false, atCapacity: existing.length >= MAX_GALLERY_PHOTOS };
  }

  if (existing.length >= MAX_GALLERY_PHOTOS) {
    return { photos: existing, added: false, atCapacity: true };
  }

  const photos = [...existing, photoUrl];
  await prisma.chatState.update({
    where: { whatsappNumber: phone },
    data: { tempData: { ...tempData, photos } },
  });

  return {
    photos,
    added: true,
    atCapacity: photos.length >= MAX_GALLERY_PHOTOS,
  };
}

export { MAX_GALLERY_PHOTOS };
