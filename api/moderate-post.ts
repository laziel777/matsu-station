import { GoogleGenAI, Type } from '@google/genai';

const MAX_POST_LENGTH = 500;
const ALLOWED_ACTIONS = ['publish', 'review', 'block'] as const;

function getGeminiAI() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 沒有讀到');
  }

  return new GoogleGenAI({ apiKey });
}

const fallbackResult = {
  safe: false,
  risk: 9,
  tag: '#系統設定',
  summary: 'AI 審核服務尚未設定，請確認 Vercel 的 GEMINI_API_KEY 環境變數。',
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
        tag: '#空白內容',
        summary: '請輸入內容後再發布。',
        action: 'block',
      });
    }

    if (text.length > MAX_POST_LENGTH) {
      return res.status(400).json({
        safe: false,
        risk: 7,
        tag: '#字數過長',
        summary: `發文最多 ${MAX_POST_LENGTH} 字，請縮短內容後再發。`,
        action: 'block',
      });
    }

    const prompt = `
你是「馬祖小站」的內容安全審查員。請用繁體中文判斷一篇社群貼文能否發布。

審查目標：
- 讓使用者可以正常討論在地生活、交通、天氣、公共政策、政治議題、建議、抱怨與不同立場。
- 站長不應因平台內容承擔明顯的個資、誹謗、騷擾、威脅、仇恨或未查證爆料風險。
- 不要因為內容提到政治、政府、民代、公共工程、選舉、政策批評或地方建議就擋文。

可以發布 publish：
- 理性政治討論、政策建議、公共服務抱怨、交通船班航班意見。
- 沒有指名道姓攻擊私人的一般抱怨。
- 對公共人物或公家機關的評論，只要是意見、建議、提問或已公開議題的討論。

需要留意但仍可發布 review：
- 語氣較重但未辱罵、未威脅、未揭露個資。
- 有影射或傳聞味道，但沒有明確指控特定個人犯罪、外遇、貪污、疾病、財務問題。

必須阻擋 block：
- 電話、地址、身分證、車牌、私人 LINE、私人照片等個資曝光或人肉搜尋。
- 對特定私人、店家或公共人物提出未證實犯罪、貪污、外遇、詐騙、收賄、吸毒等具體指控。
- 威脅、恐嚇、煽動攻擊、騷擾、仇恨歧視、色情暴力、詐騙或明顯垃圾洗版。
- 明顯要帶風向攻擊某人，或要求大家去檢舉、圍剿、騷擾特定對象。

輸出規則：
- action 只能是 "publish"、"review"、"block"。
- publish/review 時 safe 必須是 true；block 時 safe 必須是 false。
- risk 0-10，政治討論本身不應超過 4，除非含有上面的法律或人身風險。
- tag 請給一個繁體中文 hashtag，例如 #政治討論、#在地建議、#個資風險、#未證實指控。
- summary 用 70 字以內說明原因；若 block，請明確告訴使用者怎麼改寫比較安全。

使用者選擇的分類：${category || '未分類'}
貼文內容：
${text}
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
    const action = ALLOWED_ACTIONS.includes(result.action) ? result.action : 'review';

    return res.status(200).json({
      safe: action === 'block' ? false : true,
      risk: Number(result.risk ?? 0),
      tag: String(result.tag || '#內容審查'),
      summary: String(result.summary || 'AI 已完成內容安全檢查。'),
      action,
    });
  } catch (error: any) {
    console.error('moderate-post error:', error);
    return res.status(500).json({
      safe: false,
      risk: 9,
      tag: '#系統錯誤',
      summary: error?.message || 'AI 審核暫時失敗，請稍後再試。',
      action: 'block',
    });
  }
}
