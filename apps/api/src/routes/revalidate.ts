import { Router } from "express";
import { config } from "../config.js";

export const revalidateRouter = Router();

revalidateRouter.post("/", async (req, res) => {
  const secret = req.headers["x-revalidate-secret"] ?? req.body?.secret;
  if (secret !== config.revalidateSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const slug = req.body?.slug as string | undefined;
  if (!slug) {
    res.status(400).json({ error: "slug is required" });
    return;
  }

  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  const path = `/sites/${slug}`;

  try {
    const response = await fetch(`${webUrl}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: config.revalidateSecret, path }),
    });

    if (!response.ok) {
      res.status(502).json({ error: "Revalidation failed" });
      return;
    }

    res.json({ revalidated: true, slug });
  } catch {
    res.status(502).json({ error: "Could not reach web app" });
  }
});
