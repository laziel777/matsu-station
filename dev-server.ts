import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import { createServer as createViteServer } from "vite";
import moderatePostHandler from "./api/moderate-post.ts";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));

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
  console.log(`✅ 馬祖小站已啟動：http://localhost:${PORT}`);
  console.log("✅ 前端網站 + /api/moderate-post 已一起啟動");

  if (!process.env.GEMINI_API_KEY) {
    console.log("⚠️ 尚未設定 GEMINI_API_KEY，AI 審核會回傳系統忙碌。");
  } else {
    console.log("✅ GEMINI_API_KEY 已讀取，AI 審核可以使用。");
  }
});