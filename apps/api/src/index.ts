import dotenv from "dotenv";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config();
import { config } from "./config.js";
import { asaasRouter } from "./routes/asaas.js";
import { revalidateRouter } from "./routes/revalidate.js";
import { tenantsRouter } from "./routes/tenants.js";
import { whatsappRouter } from "./routes/whatsapp.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "iaesmartguide-api" });
});

app.use("/webhooks/whatsapp", whatsappRouter);
app.use("/webhooks/asaas", asaasRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/revalidate", revalidateRouter);

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
