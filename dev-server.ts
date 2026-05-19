import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import { existsSync } from "fs";
import { resolve } from "path";
import { createServer as createViteServer } from "vite";
import moderatePostHandler from "./api/moderate-post.ts";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RANGER_LAB_PORT = Number(process.env.RANGER_LAB_PORT || 4321);
const startedAt = new Date();
const projectRoot = process.cwd();

app.use(express.json({ limit: "2mb" }));

app.get("/api/local-health", (_req, res) => {
  res.json({
    ok: true,
    service: "matsu-station-local",
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    projectRoot,
    nodeVersion: process.version,
    port: PORT,
    rangerLabPort: RANGER_LAB_PORT,
    hasContentSafetyKey: Boolean(process.env.GEMINI_API_KEY),
    envFileLoaded: existsSync(resolve(projectRoot, ".env.local")),
    links: {
      site: `http://localhost:${PORT}`,
      rangerLab: `http://localhost:${RANGER_LAB_PORT}`,
      contentSafety: `http://localhost:${PORT}/api/moderate-post`,
    },
  });
});

app.all("/api/moderate-post", async (req, res) => {
  try {
    await moderatePostHandler(req, res);
  } catch (error) {
    console.error("local api error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        safe: false,
        risk: 9,
        tag: "#系統忙碌",
        summary: "本機 API 發生錯誤，請看 VS Code Terminal。",
        action: "block",
      });
    }
  }
});

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});

app.use(vite.middlewares);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`馬祖小站已啟動：http://localhost:${PORT}`);
  console.log(`本機健康檢查：http://localhost:${PORT}/api/local-health`);
  console.log("前端網站 + /api/moderate-post 已一起啟動");

  if (!process.env.GEMINI_API_KEY) {
    console.log("尚未設定內容安全金鑰，AI 審查會回傳系統忙碌。");
  } else {
    console.log("內容安全金鑰已讀取，AI 審查可以使用。");
  }
});
