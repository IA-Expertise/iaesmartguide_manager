import { prisma } from "@iaesmartguide/db";

async function seed() {
  const existing = await prisma.tenant.findUnique({ where: { slug: "adegatoninho" } });
  if (existing) {
    console.log("Seed já aplicado (adegatoninho existe).");
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      ownerName: "Toninho",
      whatsappNumber: "5511999990001",
      businessName: "Adega do Toninho",
      slug: "adegatoninho",
      description: "Vinhos e queijos artesanais da serra.",
      address: "Estrada Rural, km 12 — Serra da Mantiqueira",
      isPublished: true,
      paymentStatus: "paid",
      photos: {
        create: [],
      },
      products: {
        create: [
          { title: "Queijo Artesanal", price: "R$ 45,00" },
          { title: "Vinho Tinto Reserva", price: "R$ 89,00" },
        ],
      },
    },
  });

  console.log(`Seed OK: tenant id=${tenant.id} slug=${tenant.slug}`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
