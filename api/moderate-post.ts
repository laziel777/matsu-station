import { GoogleGenAI, Type } from '@google/genai';

function getGeminiAI() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();

  console.log("Gemini key loaded:", {
    exists: Boolean(apiKey),
    length: apiKey.length,
    prefix: apiKey.slice(0, 4),
  });

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 沒有讀到");
  }

  return new GoogleGenAI({ apiKey });
}

const fallbackResult = {
  safe: false,
  risk: 9,
  tag: '#系統忙碌',
  summary: 'AI 審核服務尚未設定，請確認 Vercel/Firebase 的 GEMINI_API_KEY 環境變數。',
  action: 'block',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json(fallbackResult);
    }

    const { content, category } = req.body || {};
    const text = String(content || '').trim();

    if (!text) {
      return res.status(400).json({
        safe: false,
        risk: 9,
        tag: '#空白',
        summary: '文章內容不能是空白。',
        action: 'block',
      });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        safe: false,
        risk: 7,
        tag: '#過長',
        summary: '文章太長，請縮短到 2000 字以內。',
        action: 'block',
      });
    }

    const prompt = `
你是「馬祖小站」的 AI 發文守門員。這是一個地方性匿名討論網站。
你的目標不是壓制正常討論，而是降低站長法律風險與保護真實人物。

請判斷貼文是否可以發布。

允許：打招呼、生活分享、交通船班、天氣、店家普通心得、地方閒聊、非具名抱怨。
提高風險：真實姓名、電話、地址、學校班級、工作單位加具體指控、外遇/犯罪/貪污/吸毒等未證實指控、肉搜、威脅、煽動霸凌、色情交易、違法交易。

處理原則：
- 低風險：action = "publish"
- 中風險但可討論：action = "review"，summary 提醒站長要人工看
- 高法律/個資風險：action = "block"

分類 tag 只能從這些選：#閒聊、#在地生活、#交通、#美食、#求助、#抱怨、#公告、#高風險

使用者原本選的分類：${category || '未選'}
貼文：${text}
`;

    const ai = getGeminiAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            risk: { type: Type.NUMBER },
            tag: { type: Type.STRING },
            summary: { type: Type.STRING },
            action: { type: Type.STRING },
          },
          required: ['safe', 'risk', 'tag', 'summary', 'action'],
        },
      },
    });

    const raw = response.text || '{}';
    const result = JSON.parse(raw);

    return res.status(200).json({
      safe: Boolean(result.safe),
      risk: Number(result.risk ?? 0),
      tag: String(result.tag || '#閒聊'),
      summary: String(result.summary || '已完成 AI 審核。'),
      action: ['publish', 'review', 'block'].includes(result.action) ? result.action : 'review',
    });
  } catch (error: any) {
    console.error('moderate-post error:', error);
    return res.status(500).json({
      safe: false,
      risk: 9,
      tag: '#系統忙碌',
      summary: error?.message || 'AI 審核失敗。',
      action: 'block',
    });
  }
}
