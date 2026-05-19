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
  summary: '內容安全服務尚未完成設定，請聯繫站長處理。',
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

    const { content, category, fightMode } = req.body || {};
    const isFightMode = Boolean(fightMode);
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
你是「馬祖小站」的內容安全審查員。請用繁體中文判斷一篇台灣在地社群貼文能否發布。
你的任務不是審查政治立場，而是降低平台與使用者的法律、安全、個資與騷擾風險。

審查目標：
- 讓使用者可以正常討論在地生活、交通、天氣、公共政策、政治議題、建議、抱怨與不同立場。
- 站長不應因平台內容承擔明顯的個資、誹謗、公然侮辱、騷擾、恐嚇、私密影像、詐騙或未查證爆料風險。
- 不要因為內容提到政治、政府、民代、公共工程、選舉、政策批評或地方建議就擋文。

使用者是否啟用 Fight 模式：${isFightMode ? '是' : '否'}
Fight 模式說明：
- Fight 代表使用者主動標記「我要挑戰觀點／進入高爭議討論」，不是檢舉，也不是自動違規。
- Fight 模式應提高對公共議題、政治討論、尖銳批評、反方觀點與情緒性反駁的容忍度。
- Fight 模式也會提高系統巡邏與站長覆核密度；請不要放寬個資、恐嚇、肉搜、持續騷擾、私密影像、詐騙、兒少性內容、仇恨煽動，或對特定自然人的未證實重大指控。
- 若 Fight 內容只是尖銳公共議題或立場反駁，優先 publish 或 review，不要只因語氣強烈就 block。
- 若未啟用 Fight，仍應保障一般政治討論與地方抱怨，但對高爭議、傳聞、影射與可能引戰內容可較保守地 review。
- Fight 不是違法內容通行證；不能暗示平台允許違法、個資、恐嚇、肉搜或未證實重大指控。

台灣法規風險參考：
- 個人資料保護法第 2 條：姓名、出生年月日、身分證號、聯絡方式、財務、病歷、健康、性生活、犯罪前科及其他可直接或間接識別自然人之資料，屬個人資料。
- 個資法第 19、20 條：非公務機關蒐集、處理、利用個資需有特定目的與合法依據；平台應避免用戶任意公開他人個資。
- 刑法第 305 條：以加害生命、身體、自由、名譽、財產之事恐嚇他人，可能構成恐嚇危害安全。
- 刑法第 309、310 條：公然侮辱、散布足以毀損他人名譽之具體事實，可能有名譽風險。
- 刑法第 311 條：善意自衛、自辯、保護合法利益、對可受公評之事作適當評論或記事，應保留言論空間。

可以發布 publish：
- 理性政治討論、政策建議、公共服務抱怨、交通船班航班意見。
- 沒有指名特定私人、沒有貼個資、沒有威脅的一般抱怨。
- 對公共人物、公家機關、公共工程、商家服務的評論，只要是意見、建議、消費經驗、提問或已公開議題的討論。
- 粗口或情緒字眼若只是發洩，不是對特定對象持續辱罵、騷擾或威脅，原則上 publish 或 review，不要 block。
- 使用「我覺得」「疑似」「有人說」「希望查清楚」「請主管機關說明」等不確定或評論語氣，且未公開個資，原則上不要 block。

需要留意但仍可發布 review：
- 語氣較重、有爭議或可能引戰，但未威脅、未公開個資、未要求圍剿。
- 對可受公評之事提出尖銳評論，或對公共人物/機關提出待查證質疑。
- 有影射或傳聞味道，但沒有明確指控特定自然人犯罪、外遇、疾病、財務困難、性私密事項。
- 對店家服務的負評若是個人經驗描述，應 review 或 publish；只有未證實重大違法指控才 block。

必須阻擋 block：
- 電話、地址、身分證、車牌、私人 LINE、私人照片、病歷、財務、家庭住址、工作地點等足以識別自然人的個資曝光、人肉搜尋或要求他人找出身份。
- 對特定自然人或可識別對象提出未證實犯罪、貪污、收賄、詐騙、吸毒、外遇、性病、精神疾病、財務危機等具體事實指控。
- 直接威脅、恐嚇、煽動攻擊、號召圍剿、持續騷擾、仇恨歧視、性私密影像、兒少性內容、詐騙或明顯垃圾洗版。
- 明顯要帶風向攻擊某人，或要求大家去檢舉、圍剿、騷擾特定對象。

輸出規則：
- action 只能是 "publish"、"review"、"block"。
- publish/review 時 safe 必須是 true；block 時 safe 必須是 false。
- risk 0-10；政治討論、政策批評、公共議題或政府批評本身不應超過 4，除非同時含有個資、恐嚇、明確未證實重大指控或騷擾。
- 沒有明確可識別受害者或具體違法事實時，不要因情緒、諷刺、政治立場或地方抱怨而 block。
- 若需要 review 或 block，summary 要用「保障用戶安全、個資、名譽、反騷擾或平台治理」的理由說明，不要寫成黑箱審查。
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
      summary: String(result.summary || '已完成內容安全檢查。'),
      action,
    });
  } catch (error: any) {
    console.error('moderate-post error:', error);
    return res.status(500).json({
      safe: false,
      risk: 9,
      tag: '#系統錯誤',
      summary: '內容安全檢查暫時失敗，請稍後再試。',
      action: 'block',
    });
  }
}
