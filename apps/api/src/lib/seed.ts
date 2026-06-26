import { PrismaClient } from "@prisma/client";

export async function runSeed(): Promise<{ created: boolean; slug: string }> {
  const prisma = new PrismaClient();
  const slug = "adegatoninho";

  try {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return { created: false, slug };
    }

    await prisma.tenant.create({
      data: {
        ownerName: "Toninho",
        whatsappNumber: "5511999990001",
        businessName: "Adega do Toninho",
        slug,
        description: "Vinhos e queijos artesanais da serra.",
        address: "Estrada Rural, km 12 — Serra da Mantiqueira",
        isPublished: true,
        plan: "premium",
        paymentStatus: "paid",
        products: {
          create: [
            { title: "Queijo Artesanal", price: "R$ 45,00" },
            { title: "Vinho Tinto Reserva", price: "R$ 89,00" },
          ],
        },
      },
    });

    return { created: true, slug };
  } finally {
    await prisma.$disconnect();
  }
}
