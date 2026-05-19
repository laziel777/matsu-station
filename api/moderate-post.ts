import { GoogleGenAI, Type } from '@google/genai';

const MAX_POST_LENGTH = 500;
const ALLOWED_ACTIONS = ['publish', 'review', 'block'] as const;
type ModerationAction = typeof ALLOWED_ACTIONS[number];

function clampRisk(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(10, numberValue));
}

function hasIdentifiableTarget(text: string) {
  return /(@\S+|[一-龥A-Za-z0-9]{2,}(先生|小姐|議員|鄉長|村長|校長|主任|老闆|店長|店|公司|民宿|餐廳)|測試人物|測試店|某店|某人)/i.test(text);
}

function getLocalRiskSignals(text: string, fightMode: boolean) {
  const normalized = text.replace(/\s+/g, ' ');
  const target = hasIdentifiableTarget(normalized);
  const personalData = /(身分證|護照|電話|手機|地址|住址|個資|肉搜|車牌|私人LINE|病歷|銀行帳戶|薪資|家裡|住哪裡|住址是|0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4})/i.test(normalized);
  const threat = /(殺|打死|弄死|放火|砸店|堵你|找你算帳|讓你出事|威脅|恐嚇|去你家|讓他不能營業)/.test(normalized);
  const seriousClaim = /(貪污|收賄|收回扣|收錢辦事|詐騙|偷竊|偷了|性侵|強姦|販毒|吸毒|洗錢|黑道|外遇|性病|精神病|偽造|侵占公款|拿好處)/.test(normalized);
  const rumor = /(聽說|有人說|大家都知道|疑似|好像|爆料|未證實|沒證據|查一下|看起來很怪)/.test(normalized);
  const harassment = /(大家去|一起去|抵制他|圍剿|出征|肉搜|公布他|讓他紅|不要讓他混|去找他)/.test(normalized);
  const insult = target && /(垃圾|爛人|騙子|王八|白癡|智障|不要臉|噁心)/.test(normalized);
  const heated = /(爛|很扯|太誇張|黑箱|有問題|不合理|氣死|離譜|靠北|幹)/.test(normalized);

  let floor = 0;
  let action: ModerationAction | null = null;
  let summary = '';
  let tag = '';

  if (personalData || threat) {
    floor = 9;
    action = 'block';
    tag = personalData ? '#個資風險' : '#安全威脅';
    summary = personalData
      ? '內容可能包含可識別個資，請移除電話、住址、車牌或私人識別資訊後再發。'
      : '內容含有威脅或號召攻擊風險，請改成陳述事實或提出申訴。';
  } else if (target && seriousClaim) {
    floor = 8;
    action = 'block';
    tag = '#未證實指控';
    summary = '內容對可識別對象提出重大指控，請改成「希望主管機關查明」並避免指名定罪。';
  } else if (target && harassment) {
    floor = 7;
    action = 'review';
    tag = '#騷擾風險';
    summary = '內容可能引導他人針對特定對象行動，已提高站長覆核。';
  } else if (target && rumor) {
    floor = fightMode ? 5 : 6;
    action = 'review';
    tag = '#傳聞風險';
    summary = '內容帶有傳聞或影射，雖可討論但需要提高觀察，避免變成未證實指控。';
  } else if (insult) {
    floor = 5;
    action = 'review';
    tag = '#名譽風險';
    summary = '內容有針對可識別對象的辱罵風險，建議改成具體事件與意見。';
  } else if (heated || fightMode) {
    floor = fightMode ? 4 : 3;
    action = floor >= 4 ? 'review' : null;
    tag = fightMode ? '#Fight討論' : '#情緒討論';
    summary = fightMode
      ? 'Fight 內容可提高討論容忍度，但會進入較密集觀察。'
      : '內容語氣較強，但未偵測到明顯個資、威脅或重大指控。';
  }

  return { floor, action, summary, tag, target };
}

function isMeaningfulChineseText(text: string) {
  const normalized = text.replace(/\s+/g, '');
  const chineseCount = (normalized.match(/[\p{Script=Han}]/gu) || []).length;
  return normalized.length >= 4 && chineseCount >= 2;
}

function isGenericAiFalsePositive(result: any) {
  const combined = `${result?.tag || ''} ${result?.summary || ''}`;
  return /(內容不明|垃圾訊息|亂碼|無效|無法辨識|不符合平台發文規範)/.test(combined);
}

function normalizeModerationResult(result: any, text: string, fightMode: boolean) {
  const local = getLocalRiskSignals(text, fightMode);
  const aiAction = ALLOWED_ACTIONS.includes(result.action) ? result.action as ModerationAction : 'review';
  let action = local.action || aiAction;
  let risk = Math.max(clampRisk(result.risk), local.floor);
  const meaningfulNormalText = isMeaningfulChineseText(text) && local.floor === 0 && !local.target;
  const aiLooksGeneric = isGenericAiFalsePositive(result);

  if (meaningfulNormalText && (aiLooksGeneric || aiAction === 'block')) {
    action = 'publish';
    risk = Math.min(risk, 2);
    return {
      action,
      risk,
      tag: '#一般討論',
      summary: '未偵測到個資、威脅、騷擾或重大未證實指控，可正常發布。',
    };
  }

  if (local.floor > 0 && local.floor < 4 && aiLooksGeneric) {
    action = 'publish';
    risk = local.floor;
    return {
      action,
      risk,
      tag: local.tag || '#一般討論',
      summary: local.summary || '內容語氣較強，但未偵測到明顯個資、威脅或重大指控。',
    };
  }

  if (action === 'publish' && risk >= 4) action = 'review';
  if (action === 'review' && risk < 4) risk = 4;
  if (action === 'block' && risk < 7) risk = 7;

  return {
    action,
    risk,
    tag: String(local.tag || result.tag || '#內容審查'),
    summary: String(local.summary || result.summary || '已完成內容安全檢查。'),
  };
}

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

  const requestText = String(req.body?.content || '').trim();
  const requestFightMode = Boolean(req.body?.fightMode);

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json(fallbackResult);
    }

    const { content, category, fightMode } = req.body || {};
    const isFightMode = Boolean(fightMode);
    const text = requestText;

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
    const normalized = normalizeModerationResult(result, text, isFightMode);

    return res.status(200).json({
      safe: normalized.action === 'block' ? false : true,
      risk: normalized.risk,
      tag: normalized.tag,
      summary: normalized.summary,
      action: normalized.action,
    });
  } catch (error: any) {
    console.error('moderate-post error:', error);
    const fallback = normalizeModerationResult({
      action: 'publish',
      risk: 0,
      tag: '#本地規則',
      summary: 'AI 審查暫時忙碌，已用本地規則完成初步安全檢查。',
    }, requestText, requestFightMode);

    return res.status(200).json({
      safe: fallback.action === 'block' ? false : true,
      risk: fallback.risk,
      tag: fallback.tag,
      summary: fallback.summary,
      action: fallback.action,
    });
  }
}
