import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function findSchemaPath(): string {
  const candidates = [
    resolve(process.cwd(), "packages/db/prisma/schema.prisma"),
    resolve(process.cwd(), "../../packages/db/prisma/schema.prisma"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error("schema.prisma não encontrado");
}

export function runDbPush(): void {
  const schema = findSchemaPath();
  execSync(`npx prisma db push --schema="${schema}" --skip-generate`, {
    env: process.env,
    stdio: "pipe",
  });
}
