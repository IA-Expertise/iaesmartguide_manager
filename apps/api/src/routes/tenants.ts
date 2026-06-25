import { Router } from "express";
import { prisma } from "@iaesmartguide/db";

export const tenantsRouter = Router();

tenantsRouter.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: {
      photos: { orderBy: { createdAt: "asc" }, take: 5 },
      products: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    slug: tenant.slug,
    businessName: tenant.businessName,
    whatsappNumber: tenant.whatsappNumber,
    logoUrl: tenant.logoUrl,
    youtubeUrl: tenant.youtubeUrl,
    instagramUrl: tenant.instagramUrl,
    description: tenant.description,
    tagline: tenant.tagline,
    address: tenant.address,
    isPublished: tenant.isPublished,
    photos: tenant.photos.map((p) => p.photoUrl),
    products: tenant.products.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      imageUrl: p.imageUrl,
    })),
  });
});
