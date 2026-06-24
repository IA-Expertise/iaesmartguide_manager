import { Router } from "express";
import { runSeed } from "@iaesmartguide/db";
import { config } from "../config.js";

export const adminRouter = Router();

adminRouter.get("/seed", async (req, res) => {
  const secret = req.query.secret as string | undefined;
  if (!config.seedSecret || secret !== config.seedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await runSeed();
    res.json({
      ok: true,
      message: result.created ? "Tenant criado" : "Tenant já existia",
      slug: result.slug,
    });
  } catch (error) {
    console.error("[admin/seed]", error);
    res.status(500).json({ error: "Seed failed" });
  }
});
