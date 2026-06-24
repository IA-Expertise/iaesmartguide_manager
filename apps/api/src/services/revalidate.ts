import { config } from "../config.js";

export async function revalidateTenant(slug: string): Promise<void> {
  const webUrl = process.env.WEB_URL;
  if (!webUrl || !config.revalidateSecret) return;

  try {
    await fetch(`${webUrl}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: config.revalidateSecret,
        slug,
        path: `/sites/${slug}`,
      }),
    });
  } catch (error) {
    console.error("[revalidate]", error);
  }
}
