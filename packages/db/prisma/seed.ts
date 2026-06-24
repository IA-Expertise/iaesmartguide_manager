import { runSeed } from "../src/seed.js";
import { prisma } from "../src/client.js";

runSeed()
  .then((result) => {
    console.log(
      result.created ? `Seed OK: ${result.slug}` : `Seed já aplicado: ${result.slug}`
    );
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
