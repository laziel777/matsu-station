const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const line = require("@line/bot-sdk");
const { GoogleGenAI } = require("@google/genai");
const crypto = require("crypto");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const REGION = "asia-east1";
const STATION_MASTER_UID = "gHHxF8p1DnbMkoeVmU5XpB18Elz2";
const DEFAULT_ISLANDER_PHOTO = "__DEFAULT_ISLANDER__";
const GEMINI_MODEL = "gemini-2.5-flash";
const SITE_URL = "https://www.matsustation.com/";
const LINE_OFFICIAL_URL = "https://lin.ee/nn0RaOc";
const FALLBACK_REPLY = "馬祖小站智能客服暫時忙碌中，請稍後再試。";
const MAX_USER_MESSAGE_LENGTH = 500;
const MAX_REPLY_LENGTH = 1800;
const MAX_CONTEXT_MESSAGES = 6;
const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_COMMENT_LIMIT = 120;
const DAILY_FIGHT_COMMENT_LIMIT = 30;
const POLICY_VERSION = "2026-05-19";
const ASSISTANT_IDENTITY = "馬祖小站智能客服（系統輔助，非真人客服）";
const AI_NOTICE = "注意事項：小站智能客服僅提供輔助回覆，不提供互動功能，回覆可能會出錯。";
const SUPPORT_FOOTER = "如果需要站長處理，請按下方對應按鈕。";

const HANDOFF_OPTIONS = {
  issue: {
    label: "問題回報",
    receipt:
      "智能客服輔助已關閉，您的問題回報已留在聊天室。\n\n請直接在這裡補充截圖、手機型號或瀏覽器、操作步驟與大約發生時間。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  contact: {
    label: "聯絡站長",
    receipt:
      "智能客服輔助已關閉，您的訊息已留在聊天室等待站長查看。\n\n請直接在這裡補充要聯絡站長的內容。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  business: {
    label: "商業合作",
    receipt:
      "智能客服輔助已關閉，您的商業合作訊息已留在聊天室。\n\n請直接在這裡補充合作內容、希望合作時間、需求與方便回覆的方式。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  report: {
    label: "檢舉內容",
    receipt:
      "智能客服輔助已關閉，您的檢舉訊息已留在聊天室。\n\n請直接在這裡補充截圖、文章或留言位置、發生時間與簡短原因。站長看到後會檢查處理。",
  },
  suggestion: {
    label: "提供建議",
    receipt:
      "智能客服輔助已關閉，您的建議已留在聊天室。\n\n感謝您協助馬祖小站變得更好。您可以直接在這裡補充更多細節，站長會集中整理大家的回饋。",
  },
};

const quickReply = {
  items: [
    { type: "action", action: { type: "message", label: "開啟網站", text: "網站" } },
    { type: "action", action: { type: "message", label: "如何發文", text: "如何發文" } },
    { type: "action", action: { type: "postback", label: "問題回報", data: "handoff=issue", displayText: "問題回報" } },
    { type: "action", action: { type: "postback", label: "聯絡站長", data: "handoff=contact", displayText: "聯絡站長" } },
    { type: "action", action: { type: "postback", label: "商業合作", data: "handoff=business", displayText: "商業合作" } },
    { type: "action", action: { type: "postback", label: "檢舉內容", data: "handoff=report", displayText: "檢舉內容" } },
    { type: "action", action: { type: "postback", label: "提供建議", data: "handoff=suggestion", displayText: "提供建議" } },
  ],
};

const commonReplies = [
  {
    patterns: [/^(選單|功能|客服|幫助|help|menu)$/i, /^(你好|您好|哈囉|嗨|hi|hello)$/i],
    text:
      `哈囉，這裡是馬祖小站官方帳號。\n\n我可以協助說明網站使用、發文方式、登入、通知、航班船班與氣象入口。\n\n${AI_NOTICE}`,
  },
  {
    patterns: [/網站|網址|連結|打開|進去/],
    text: `馬祖小站網站在這裡：\n${SITE_URL}\n\n目前是 Beta 測試版，歡迎馬祖鄉親協助測試。`,
  },
  {
    patterns: [/發文|發布|貼文|po文|PO文|投稿|動態/],
    text:
      "發文方式：\n1. 打開馬祖小站網站\n2. 使用 Google 登入\n3. 選擇分類後輸入內容\n4. 發布前請避免個資、未查證爆料與攻擊性內容\n\n網站會限制發文頻率，是為了防止惡意攻擊、複製垃圾文與洗文。",
  },
  {
    patterns: [/規範|規則|禁止|隱私|名譽|提告|投訴/],
    text:
      "馬祖小站目前為 Beta 測試版。\n\n請勿發布個資、未查證爆料、攻擊性內容、騷擾內容，或可能造成他人名譽受損的指控。看到不適合的內容，請按「檢舉內容」按鈕交給站長查看。",
  },
  {
    patterns: [/登入|登錄|google|帳號|註冊|無法登入/],
    text:
      "馬祖小站目前使用 Google 登入。\n\n如果無法登入，請先確認：\n1. 瀏覽器沒有阻擋彈出視窗\n2. Google 帳號可以正常登入\n3. 手機瀏覽器可以開啟第三方登入頁\n\n仍然失敗的話，請按「問題回報」按鈕。",
  },
  {
    patterns: [/航班|船班|氣象|天氣|飛機|船|交通|霧|大霧/],
    text:
      "航班、船班與馬祖氣象可以在馬祖小站首頁查看入口。\n\n提醒：即時交通與天氣可能快速變動，出發前仍建議以官方公告、航空公司、船公司或氣象單位為準。",
  },
  {
    patterns: [/島內ID|島民ID|暱稱|好友|追蹤|個人頁|主頁|個人資料/],
    text:
      "個人頁可以查看自己的歷史發文與按讚內容，也可以用島內 ID 加好友、追蹤其他用戶。\n\n暱稱與島內 ID 有鎖定時間，設定前請先確認拼字。",
  },
  {
    patterns: [/通知|留言|標註|@|被提到|提醒/],
    text:
      "通知會顯示留言、按讚、標註與檢舉相關提醒。\n\n如果通知指向的文章或留言已被刪除，網站會標示該文章或留言已被刪除。",
  },
];

function getLineClient() {
  const channelAccessToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN secret is missing");
  }

  return new line.messagingApi.MessagingApiClient({ channelAccessToken });
}

function getGeminiAI() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY secret is missing");
  }

  return new GoogleGenAI({ apiKey });
}

function createTextMessage(text, includeQuickReply = false) {
  const replyText = withAssistantIdentity(text);
  const message = {
    type: "text",
    text: replyText.slice(0, 4900),
  };

  if (includeQuickReply) {
    message.quickReply = quickReply;
  }

  return message;
}

function withAssistantIdentity(text) {
  const rawText = trimMessage(text);

  if (!rawText) {
    return ASSISTANT_IDENTITY;
  }

  if (rawText.startsWith(ASSISTANT_IDENTITY)) {
    return rawText;
  }

  return `${ASSISTANT_IDENTITY}\n\n${rawText}`;
}

function getSessionId(event) {
  const source = event.source || {};
  return source.userId || source.groupId || source.roomId || "";
}

function trimMessage(text) {
  return String(text || "").trim().slice(0, MAX_REPLY_LENGTH);
}

function withSupportFooter(text, includeAiNotice = false) {
  const parts = [trimMessage(text)];

  if (includeAiNotice) {
    parts.push(AI_NOTICE);
  }

  parts.push(SUPPORT_FOOTER);
  return parts.filter(Boolean).join("\n\n");
}

function compactText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[！!。.,，、\s]/g, "");
}

function isClosingMessage(userMessage) {
  const compact = compactText(userMessage);

  return [
    "無",
    "沒有",
    "沒有了",
    "沒了",
    "不用",
    "不用了",
    "沒事",
    "沒問題",
    "好",
    "好的",
    "ok",
    "謝謝",
    "感謝",
    "謝啦",
    "暫時沒有",
  ].includes(compact) || compact.includes("沒有其他問題");
}

function findCommonReply(userMessage) {
  const normalized = userMessage.trim();
  return commonReplies.find((reply) =>
    reply.patterns.some((pattern) => pattern.test(normalized))
  ) || null;
}

function getExactHandoffType(userMessage) {
  const compact = compactText(userMessage);
  const exactCommands = {
    問題回報: "issue",
    回報問題: "issue",
    聯絡站長: "contact",
    聯繫站長: "contact",
    人工客服: "contact",
    真人客服: "contact",
    商業合作: "business",
    合作提案: "business",
    檢舉: "report",
    檢舉內容: "report",
    提供建議: "suggestion",
    建議: "suggestion",
  };

  return exactCommands[compact] || "";
}

function getHandoffIntent(userMessage) {
  const normalized = userMessage.trim();
  const intentRules = [
    { type: "issue", pattern: /問題回報|回報問題|bug|BUG|錯誤|故障|壞掉|不能用|無法使用|異常|閃退/ },
    { type: "contact", pattern: /聯絡站長|聯繫站長|找站長|站長|人工客服|真人客服|負責人|私訊/ },
    { type: "business", pattern: /商業合作|合作提案|廣告|贊助|業配|行銷合作|店家合作|活動宣傳/ },
    { type: "report", pattern: /檢舉|違規|攻擊|辱罵|個資|未查證|爆料|垃圾文|洗文|洗版|騷擾|冒用/ },
    { type: "suggestion", pattern: /建議|意見|改善|功能建議|希望新增|可以新增|想要新增|使用心得/ },
  ];

  return intentRules.find((rule) => rule.pattern.test(normalized))?.type || "";
}

function getButtonGuidance(intentType = "") {
  const selected = HANDOFF_OPTIONS[intentType]?.label;
  const buttonText = selected
    ? `請按下方「${selected}」按鈕。`
    : "請按下方「問題回報」、「聯絡站長」、「商業合作」、「檢舉內容」或「提供建議」按鈕。";

  return `${buttonText}\n\n按下按鈕後，智能客服輔助會關閉，訊息會留在聊天室等待站長查看。站長通常會在假日或空檔時段集中回覆。`;
}

function formatConversationHistory(messages) {
  if (!messages.length) return "無";

  return messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => {
      const role = message.role === "assistant" ? "客服" : "使用者";
      return `${role}：${trimMessage(message.text).slice(0, 500)}`;
    })
    .join("\n");
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function getNextMondayTaipeiTimestamp() {
  const now = Date.now();
  const taipeiNow = new Date(now + TAIPEI_UTC_OFFSET_MS);
  const day = taipeiNow.getUTCDay();
  const daysUntilNextMonday = ((1 - day + 7) % 7) || 7;

  return Date.UTC(
    taipeiNow.getUTCFullYear(),
    taipeiNow.getUTCMonth(),
    taipeiNow.getUTCDate() + daysUntilNextMonday,
    0,
    0,
    0,
    0
  ) - TAIPEI_UTC_OFFSET_MS;
}

async function loadConversationState(sessionId) {
  if (!sessionId) {
    return {
      messages: [],
      aiPausedUntilMillis: 0,
    };
  }

  try {
    const snapshot = await db.collection("lineConversations").doc(sessionId).get();
    const data = snapshot.exists ? snapshot.data() : {};
    return {
      messages: Array.isArray(data.messages) ? data.messages.slice(-MAX_CONTEXT_MESSAGES) : [],
      aiPausedUntilMillis: toMillis(data.aiPausedUntil),
    };
  } catch (error) {
    console.error("Load LINE conversation failed:", error?.message || error);
    return {
      messages: [],
      aiPausedUntilMillis: 0,
    };
  }
}

function isHumanHandoffActive(conversationState) {
  return conversationState.aiPausedUntilMillis > Date.now();
}

async function saveConversation(sessionId, history, userMessage, assistantReply) {
  if (!sessionId) return;

  const messages = [
    ...history,
    { role: "user", text: trimMessage(userMessage), at: Date.now() },
    { role: "assistant", text: trimMessage(assistantReply), at: Date.now() },
  ].slice(-MAX_CONTEXT_MESSAGES);

  try {
    await db.collection("lineConversations").doc(sessionId).set(
      {
        messages,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Save LINE conversation failed:", error?.message || error);
  }
}

async function saveUserMessageOnly(sessionId, history, userMessage) {
  if (!sessionId) return;

  const messages = [
    ...history,
    { role: "user", text: trimMessage(userMessage), at: Date.now() },
  ].slice(-MAX_CONTEXT_MESSAGES);

  try {
    await db.collection("lineConversations").doc(sessionId).set(
      {
        messages,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Save LINE user message failed:", error?.message || error);
  }
}

async function pauseAiUntilNextMonday(sessionId, reason) {
  if (!sessionId) return;

  try {
    await db.collection("lineConversations").doc(sessionId).set(
      {
        aiPausedUntil: admin.firestore.Timestamp.fromMillis(getNextMondayTaipeiTimestamp()),
        aiPausedReason: reason,
        aiPausedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Pause LINE AI failed:", error?.message || error);
  }
}

function buildPrompt(userMessage, history) {
  return `
你是「馬祖小站 Matsu Station」LINE 官方帳號的小站智能客服輔助系統，不是自由聊天角色，也不提供互動功能。

重要事實：
- 官方聯絡與回報管道就是這個 LINE 官方帳號。
- 不要說網站頁面最下方有「聯絡站長」連結。
- 不要說網站有聯絡表單，除非站長未來明確新增。
- 小站智能客服僅提供輔助回覆，不提供互動功能，回覆可能會出錯；重要資訊以站長回覆、網站內容或官方公告為準。
- 需要真人站長處理時，請使用者按 LINE 下方按鈕，不要自行說已轉交。

客服方式：
- 優先用提示與引導，不要像聊天機器人一樣無限制延伸話題。
- 如果使用者想找站長、問題回報、商業合作、檢舉或建議，請提示他按下方對應按鈕。
- 不要主動問一堆追問問題；需要補資料時，只列出可補充項目。
- 不要在回覆裡說自己記得很多長期資訊，只能使用最近 6 句對話。
- 如果使用者說沒有、無、不用、謝謝，應禮貌結束，不要再追問。
- 結尾不要自行加「還有其他問題嗎」，系統會統一加。

回覆規則：
- 使用繁體中文
- 口吻親切、簡潔、像地方網站客服
- 回覆以 1 到 3 段為主，不要長篇大論
- 不要亂編網站沒有的功能
- 不要提供法律、醫療、金融保證
- 不要要求使用者提供身分證、住址、完整生日等敏感個資
- 不要暴露 API key、Secret、部署細節或內部程式碼

網站：${SITE_URL}
LINE 官方帳號：${LINE_OFFICIAL_URL}

最近 6 句對話：
${formatConversationHistory(history)}

使用者最新訊息：
${userMessage}
`;
}

async function generateGeminiReply(userMessage, history) {
  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(userMessage, history) }],
      },
    ],
    config: {
      temperature: 0.2,
      maxOutputTokens: 520,
    },
  });

  return (response.text || FALLBACK_REPLY).trim().slice(0, MAX_REPLY_LENGTH);
}

async function replyAndRemember(client, event, sessionId, history, userMessage, replyText, includeQuickReply = true) {
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [createTextMessage(replyText, includeQuickReply)],
  });

  await saveConversation(sessionId, history, userMessage, replyText);
}

async function handleHandoff(event, client, handoffType, userMessage = "") {
  const sessionId = getSessionId(event);
  const conversationState = await loadConversationState(sessionId);
  const history = conversationState.messages;
  const option = HANDOFF_OPTIONS[handoffType] || HANDOFF_OPTIONS.contact;
  const replyText = `${option.receipt}\n\n智能客服輔助狀態會在下週一自動刷新。`;

  await replyAndRemember(
    client,
    event,
    sessionId,
    history,
    userMessage || option.label,
    replyText,
    false
  );
  await pauseAiUntilNextMonday(sessionId, handoffType);
}

async function handleTextMessage(event, client) {
  const userMessage = String(event.message.text || "").trim();
  if (!userMessage) return;

  const sessionId = getSessionId(event);
  const conversationState = await loadConversationState(sessionId);
  const history = conversationState.messages;

  if (isHumanHandoffActive(conversationState)) {
    await saveUserMessageOnly(sessionId, history, userMessage);
    return;
  }

  const exactHandoffType = getExactHandoffType(userMessage);
  if (exactHandoffType) {
    await handleHandoff(event, client, exactHandoffType, userMessage);
    return;
  }

  if (isClosingMessage(userMessage)) {
    await replyAndRemember(
      client,
      event,
      sessionId,
      history,
      userMessage,
      "好的，感謝您的訊息。\n\n如果之後還有需要，直接在這個 LINE 官方帳號傳訊息即可。",
      false
    );
    return;
  }

  if (userMessage.length > MAX_USER_MESSAGE_LENGTH) {
    await replyAndRemember(
      client,
      event,
      sessionId,
      history,
      userMessage,
      withSupportFooter(
        "這段訊息有點長，我怕客服判讀不準。\n\n請先用 500 字內描述重點；如果是問題回報，請按下方「問題回報」按鈕後再補充截圖、裝置、瀏覽器與操作步驟。"
      )
    );
    return;
  }

  const handoffIntent = getHandoffIntent(userMessage);
  if (handoffIntent) {
    await replyAndRemember(
      client,
      event,
      sessionId,
      history,
      userMessage,
      getButtonGuidance(handoffIntent)
    );
    return;
  }

  const commonReply = findCommonReply(userMessage);
  if (commonReply) {
    await replyAndRemember(
      client,
      event,
      sessionId,
      history,
      userMessage,
      withSupportFooter(commonReply.text)
    );
    return;
  }

  let replyText = FALLBACK_REPLY;

  try {
    replyText = await generateGeminiReply(userMessage, history);
  } catch (error) {
    console.error("Gemini reply failed:", {
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
      error: error?.error,
    });
  }

  await replyAndRemember(
    client,
    event,
    sessionId,
    history,
    userMessage,
    withSupportFooter(replyText, true)
  );
}

async function handlePostback(event, client) {
  const params = new URLSearchParams(event.postback?.data || "");
  const handoffType = params.get("handoff");

  if (handoffType && HANDOFF_OPTIONS[handoffType]) {
    await handleHandoff(event, client, handoffType, HANDOFF_OPTIONS[handoffType].label);
    return;
  }

  if (!event.replyToken) return;

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [createTextMessage(withSupportFooter("我收到你的操作了，但目前無法判斷要處理的類型。請按下方對應按鈕。"), true)],
  });
}

async function handleNonTextMessage(event, client) {
  if (!event.replyToken) return;

  const sessionId = getSessionId(event);
  const conversationState = await loadConversationState(sessionId);

  if (isHumanHandoffActive(conversationState)) {
    await saveUserMessageOnly(sessionId, conversationState.messages, `[非文字訊息：${event.message?.type || "unknown"}]`);
    return;
  }

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      createTextMessage(
        withSupportFooter(
          "我收到你的訊息了。\n\n如果這是問題回報或要給站長查看，請先按下方「問題回報」或「聯絡站長」按鈕，智能客服輔助關閉後再補充圖片或文字。"
        ),
        true
      ),
    ],
  });
}

exports.webhook = onRequest(
  {
    region: REGION,
    invoker: "public",
    secrets: ["GEMINI_API_KEY", "LINE_CHANNEL_ACCESS_TOKEN"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const events = Array.isArray(req.body?.events) ? req.body.events : [];
      const client = getLineClient();

      await Promise.all(
        events.map(async (event) => {
          if (!event.replyToken) return;

          if (event.type === "postback") {
            await handlePostback(event, client);
            return;
          }

          if (event.type !== "message") return;

          if (event.message?.type === "text") {
            await handleTextMessage(event, client);
            return;
          }

          await handleNonTextMessage(event, client);
        })
      );

      return res.status(200).send("OK");
    } catch (error) {
      console.error("LINE webhook failed:", {
        message: error?.message,
        stack: error?.stack,
      });
      return res.status(500).send("ERROR");
    }
  }
);

function clampNumber(value, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.max(min, Math.min(max, numberValue));
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function compactPreview(text, maxLength = 160) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getSourceKey(sourcePath) {
  return sourcePath.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function getPublicCaseId(sourcePath) {
  const hash = crypto.createHash("sha1").update(sourcePath).digest("hex").toUpperCase();
  return `MZ-${hash.slice(0, 4)}-${hash.slice(4, 11)}`;
}

function hasIdentifiableTarget(text) {
  return /(@\S+|[一-龥A-Za-z0-9]{2,}(先生|小姐|議員|鄉長|村長|校長|主任|老闆|店長|店|公司|民宿|餐廳)|測試人物|測試店|某店|某人)/i.test(text);
}

function getDeterministicRiskSignals(content, payload = {}) {
  const text = String(content || "").replace(/\s+/g, " ");
  const target = hasIdentifiableTarget(text);
  const personalData = /(身分證|護照|電話|手機|地址|住址|個資|肉搜|車牌|私人LINE|病歷|銀行帳戶|薪資|家裡|住哪裡|住址是|0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4})/i.test(text);
  const threat = /(殺|打死|弄死|放火|砸店|堵你|找你算帳|讓你出事|威脅|恐嚇|去你家|讓他不能營業)/.test(text);
  const seriousClaim = /(貪污|收賄|收回扣|收錢辦事|詐騙|偷竊|偷了|性侵|強姦|販毒|吸毒|洗錢|黑道|外遇|性病|精神病|偽造|侵占公款|拿好處)/.test(text);
  const rumor = /(聽說|有人說|大家都知道|疑似|好像|爆料|未證實|沒證據|查一下|看起來很怪)/.test(text);
  const harassment = /(大家去|一起去|抵制他|圍剿|出征|肉搜|公布他|讓他紅|不要讓他混|去找他)/.test(text);
  const insult = target && /(垃圾|爛人|騙子|王八|白癡|智障|不要臉|噁心)/.test(text);
  const heated = /(爛|很扯|太誇張|黑箱|有問題|不合理|氣死|離譜|靠北|幹)/.test(text);
  const preRisk = clampNumber(Number(payload.preModerationRisk || 0) * 10, 0, 100);
  const preAction = String(payload.preModerationAction || "");

  let scoreFloor = 0;
  const categories = [];
  let summary = "";
  let legalRisk = "";
  let recommendedAction = "";

  if (personalData || threat) {
    scoreFloor = 92;
    categories.push(personalData ? "personal_data" : "threat");
    summary = personalData ? "疑似公開可識別個資。" : "疑似威脅或攻擊性安全風險。";
    legalRisk = personalData ? "可能涉及個資揭露與肉搜風險。" : "可能涉及恐嚇、騷擾或人身安全風險。";
    recommendedAction = "urgent_review";
  } else if (target && seriousClaim) {
    scoreFloor = 76;
    categories.push("unverified_accusation", "defamation");
    summary = "對可識別對象提出重大未證實指控。";
    legalRisk = "可能涉及名譽侵害或未證實重大事實指控。";
    recommendedAction = "quarantine";
  } else if (target && harassment) {
    scoreFloor = 72;
    categories.push("harassment");
    summary = "內容可能引導他人針對特定對象行動。";
    legalRisk = "可能涉及騷擾、圍剿或平台安全風險。";
    recommendedAction = "quarantine";
  } else if (target && rumor) {
    scoreFloor = payload.fightMode ? 48 : 55;
    categories.push("unverified_accusation");
    summary = "內容帶有傳聞或影射，需要站長觀察。";
    legalRisk = "若後續演變成具體指控，可能提高名譽風險。";
    recommendedAction = "monitor";
  } else if (insult) {
    scoreFloor = 45;
    categories.push("insult");
    summary = "內容有針對可識別對象的辱罵風險。";
    legalRisk = "可能涉及公然侮辱或人身攻擊爭議。";
    recommendedAction = "monitor";
  } else if (heated || payload.fightMode) {
    scoreFloor = payload.fightMode ? 38 : 28;
    categories.push(payload.fightMode ? "public_issue" : "insult");
    summary = payload.fightMode ? "Fight 討論已提高觀察密度。" : "語氣較強但未達高風險。";
    legalRisk = "目前以言論脈絡觀察，未偵測到明確個資、威脅或重大指控。";
    recommendedAction = payload.fightMode ? "monitor" : "allow";
  }

  if (preAction === "review") {
    scoreFloor = Math.max(scoreFloor, preRisk || 40);
    if (!categories.includes("public_issue")) categories.push("public_issue");
    summary ||= "前台內容安全檢查建議站長觀察。";
    legalRisk ||= "可發布但需要保留治理紀錄與後續觀察。";
    recommendedAction ||= "monitor";
  }

  return {
    scoreFloor,
    categories,
    summary,
    legalRisk,
    recommendedAction,
  };
}

function normalizeRiskLevel(value, score) {
  const normalized = String(value || "").toLowerCase();
  if (["low", "medium", "high", "critical"].includes(normalized)) return normalized;
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function getRecommendedAction(riskLevel) {
  if (riskLevel === "critical") return "urgent_review";
  if (riskLevel === "high") return "quarantine";
  if (riskLevel === "medium") return "monitor";
  return "allow";
}

function getAiGovernanceMode(payload, analysis) {
  const fightMode = Boolean(payload.fightMode);
  const riskLevel = analysis?.riskLevel || "low";
  const elevated = ["medium", "high", "critical"].includes(riskLevel);

  if (fightMode && !elevated) return "downgraded";
  if (fightMode) return "fight";
  if (elevated) return "escalated";
  return "normal";
}

function addPolicyRef(refs, code, label) {
  if (!refs.some((ref) => ref.code === code)) {
    refs.push({ code, label });
  }
}

function getPolicyRefsForAnalysis(payload, analysis) {
  const refs = [];
  const categories = new Set((analysis.categories || []).map((category) => String(category)));
  const riskLevel = analysis.riskLevel || "low";

  addPolicyRef(refs, "使用者條款第2條", "內容責任與平台治理");

  if (categories.has("personal_data") || categories.has("privacy")) {
    addPolicyRef(refs, "隱私權政策第3條", "禁止公開他人個資與非公開識別資訊");
  }

  if (categories.has("threat") || categories.has("harassment")) {
    addPolicyRef(refs, "社群守則第4條", "禁止威脅、騷擾、肉搜與煽動圍剿");
  }

  if (categories.has("unverified_accusation") || categories.has("defamation") || categories.has("insult")) {
    addPolicyRef(refs, "社群守則第4條", "禁止未證實重大指控與高風險名譽侵害");
  }

  if (categories.has("spam") || payload.moderationRemovalReason === "daily_comment_limit_exceeded") {
    addPolicyRef(refs, "社群守則第4條", "禁止洗版、複製垃圾文與惡意干擾");
  }

  if (categories.has("sexual_image") || categories.has("scam")) {
    addPolicyRef(refs, "社群守則第4條", "禁止私密影像、詐騙與重大安全風險內容");
  }

  if (payload.fightMode) {
    addPolicyRef(refs, "社群守則第4條", "Fight 模式提高討論容忍度，但不放寬違法或安全底線");
  }

  if (["high", "critical"].includes(riskLevel)) {
    addPolicyRef(refs, "使用者條款第5條", "平台可審核、隔離、移除並保留必要治理紀錄");
  }

  return refs;
}

function stripJsonFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function fallbackPatrolAnalysis(content) {
  const signals = getDeterministicRiskSignals(content);
  const score = signals.scoreFloor || 18;
  const riskLevel = normalizeRiskLevel("", score);

  return {
    riskLevel,
    riskScore: score,
    categories: signals.categories,
    summary: "內容安全分析暫時無法完整判讀，已使用保守規則巡邏。",
    legalRisk: signals.legalRisk || "保守規則未偵測到明顯法律風險。",
    publicInterest: "unknown",
    recommendedAction: signals.recommendedAction || getRecommendedAction(riskLevel),
    rationale: "Fallback keyword-based analysis with Taiwan local forum safety thresholds.",
  };
}

function normalizePatrolAnalysis(rawAnalysis, content, payload = {}) {
  const fallback = fallbackPatrolAnalysis(content);
  const signals = getDeterministicRiskSignals(content, payload);
  const riskScore = Math.max(
    clampNumber(rawAnalysis?.riskScore ?? rawAnalysis?.score ?? fallback.riskScore, 0, 100),
    signals.scoreFloor,
  );
  const riskLevel = normalizeRiskLevel(rawAnalysis?.riskLevel, riskScore);
  const categories = [
    ...new Set([
      ...sanitizeArray(rawAnalysis?.categories || rawAnalysis?.labels || fallback.categories),
      ...signals.categories,
    ]),
  ].slice(0, 8);

  return {
    riskLevel,
    riskScore,
    categories,
    summary: String(signals.summary || rawAnalysis?.summary || fallback.summary).slice(0, 500),
    legalRisk: String(signals.legalRisk || rawAnalysis?.legalRisk || fallback.legalRisk).slice(0, 500),
    publicInterest: String(rawAnalysis?.publicInterest || fallback.publicInterest).slice(0, 80),
    recommendedAction: String(signals.recommendedAction || rawAnalysis?.recommendedAction || getRecommendedAction(riskLevel)).slice(0, 80),
    rationale: String(rawAnalysis?.rationale || fallback.rationale).slice(0, 700),
  };
}

function buildPatrolPrompt({ sourceType, content, category, fightMode, userRiskLabel }) {
  const fightEnabled = Boolean(fightMode);

  return `
You are AI Rangers for Matsu Station, a Taiwan local community forum.
Your job is not censorship. Your job is legal/safety risk triage for a human station master.
Protect lawful speech under Taiwan's democratic free-expression norms while reducing risks to users and the platform.

Analyze this ${sourceType} in Traditional Chinese context.
Return JSON only. No markdown.

User-selected mode:
- fightMode: ${fightEnabled ? "true" : "false"}
- userRiskLabel: ${userRiskLabel || (fightEnabled ? "fight" : "normal")}

Fight mode policy:
- Fight means the user voluntarily labels the content as a sharper public-issue challenge or rebuttal. It is not a violation by itself.
- Fight should increase tolerance for political discussion, public-interest disputes, strong criticism, sarcasm, profanity, and heated counterarguments.
- Fight also increases monitoring density. It must never lower the bottom line for personal data, doxxing, direct threats, targeted harassment, private sexual images, scams, child sexual content, hate incitement, or concrete unverified serious accusations against identifiable natural persons.
- Never frame Fight as permission for illegal content. It is only a higher-tolerance discussion label with stricter monitoring.
- If fightMode is true but the content is actually low-risk, classify riskLevel as low and explain that it can be downgraded to normal governance.
- If fightMode is false but the content still carries real legal or safety risk, classify it normally and recommend monitoring/quarantine as needed.

Taiwan legal reference points:
- Personal Data Protection Act Art. 2: personal data includes name, date of birth, national ID, contact details, medical/health, financial, social activity, criminal record and other data that can identify a natural person.
- PDPA Arts. 19-20: non-government actors need a specific purpose and lawful basis to collect/process/use personal data.
- Criminal Code Art. 305: threats to life, body, freedom, reputation or property may create safety risk.
- Criminal Code Arts. 309-310: public insult and spreading specific reputation-damaging facts can create defamation/insult risk.
- Criminal Code Art. 311: good-faith self-defense, protection of lawful interest, proper criticism of public matters, and fair reports should preserve room for public discussion.

Risk levels:
- low: normal criticism, jokes, public policy/political discussion, emotional but lawful local discussion
- medium: heated conflict, sharp criticism, rumor-like wording, possible dispute but no clear private data or direct threat
- high: identifiable target plus unverified serious factual accusation, serious defamation risk, doxxing hints, coordinated harassment
- critical: personal data exposure, direct threat, targeted harassment, malicious doxxing, sexual/private images, child sexual content, scam or violence instruction

Freedom-preserving rules:
- Do not raise risk merely because the content discusses politics, elections, public officials, government agencies, local policy, public works, transport, business service quality, or criticism of public matters.
- Strong opinions, sarcasm, profanity, and local complaints are allowed unless they identify a target and include threats, doxxing, harassment, or concrete unverified illegal/private-life allegations.
- Public-interest criticism and questions should be allow or monitor, especially when phrased as opinion, question, request for clarification, personal experience, or call for official investigation.
- Quarantine should be reserved for clear, concrete risk. If uncertain between medium and high, choose medium and monitor for station-master review.
- Governance must be transparent: if recommending monitor/quarantine/urgent_review, explain which safety reason applies instead of using vague censorship language.

JSON schema:
{
  "riskLevel": "low|medium|high|critical",
  "riskScore": 0,
  "categories": ["public_issue", "politics", "personal_data", "threat", "harassment", "unverified_accusation", "insult", "defamation", "privacy", "spam", "sexual_image", "scam"],
  "summary": "short Traditional Chinese summary",
  "legalRisk": "short Traditional Chinese legal risk note",
  "publicInterest": "low|medium|high",
  "recommendedAction": "allow|monitor|quarantine|urgent_review",
  "rationale": "short Traditional Chinese explanation"
}

Category: ${category || "unknown"}
Content:
${String(content || "").slice(0, 1200)}
`;
}

async function analyzeWithGeminiForPatrol(payload) {
  const content = String(payload.content || "").trim();
  if (!content) {
    return normalizePatrolAnalysis({
      riskLevel: "low",
      riskScore: 0,
      categories: [],
      summary: "空白內容。",
      legalRisk: "無可分析內容。",
      publicInterest: "low",
      recommendedAction: "allow",
      rationale: "Content is empty.",
    }, content, payload);
  }

  try {
    const ai = getGeminiAI();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPatrolPrompt(payload),
      config: {
        temperature: 0.1,
        maxOutputTokens: 700,
      },
    });
    const parsed = JSON.parse(stripJsonFence(response.text));
    return normalizePatrolAnalysis(parsed, content, payload);
  } catch (error) {
    console.error("AI Rangers Gemini analysis failed:", {
      message: error?.message,
      status: error?.status,
    });
    return fallbackPatrolAnalysis(content);
  }
}

function buildSourcePatchForQuarantine(sourceType, sourceData, publicCaseId, riskLevel, riskScore) {
  const basePatch = {
    moderationStatus: "quarantined",
    moderationPublicCaseId: publicCaseId,
    moderationRiskLevel: riskLevel,
    moderationRiskScore: riskScore,
    moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (sourceType === "post") {
    return {
      ...basePatch,
      content: "",
      imageUrls: [],
      quarantinedContentPreview: compactPreview(sourceData.content),
    };
  }

  return {
    ...basePatch,
    content: "",
    quarantinedContentPreview: compactPreview(sourceData.content),
  };
}

async function writePatrolArtifacts(payload, analysis) {
  const sourceKey = getSourceKey(payload.sourcePath);
  const publicCaseId = getPublicCaseId(payload.sourcePath);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const aiGovernanceMode = getAiGovernanceMode(payload, analysis);
  const fightMode = Boolean(payload.fightMode);
  const userRiskLabel = payload.userRiskLabel || (fightMode ? "fight" : "normal");
  const shouldCreateCase = fightMode || ["medium", "high", "critical"].includes(analysis.riskLevel);
  const shouldQuarantine = ["high", "critical"].includes(analysis.riskLevel);
  const policyRefs = getPolicyRefsForAnalysis(payload, analysis);
  const sourceGovernancePatch = {
    fightMode,
    userRiskLabel,
    aiGovernanceMode,
    moderationRiskLevel: analysis.riskLevel,
    moderationRiskScore: analysis.riskScore,
    moderationUpdatedAt: now,
  };

  const baseRecord = {
    sourceType: payload.sourceType,
    sourcePath: payload.sourcePath,
    postId: payload.postId || null,
    commentId: payload.commentId || null,
    replyId: payload.replyId || null,
    authorId: payload.authorId || null,
    authorName: payload.authorName || null,
    category: payload.category || null,
    contentPreview: compactPreview(payload.content),
    fightMode,
    userRiskLabel,
    aiGovernanceMode,
    policyVersion: POLICY_VERSION,
    policyRefs,
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    categories: analysis.categories,
    summary: analysis.summary,
    legalRisk: analysis.legalRisk,
    publicInterest: analysis.publicInterest,
    recommendedAction: analysis.recommendedAction,
    rationale: analysis.rationale,
    publicCaseId,
  };

  await db.collection("aiPatrolLogs").doc(sourceKey).set({
    ...baseRecord,
    createdAt: now,
    updatedAt: now,
    caseCreated: shouldCreateCase,
  }, { merge: true });

  if (!shouldCreateCase) {
    await db.doc(payload.sourcePath).set(sourceGovernancePatch, { merge: true });
    return;
  }

  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const existingCase = await caseRef.get();
  if (!existingCase.exists) {
    await caseRef.set({
      ...baseRecord,
      contentSnapshot: String(payload.content || "").slice(0, 4000),
      imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
      status: shouldQuarantine ? "quarantined" : aiGovernanceMode === "downgraded" ? "downgraded" : "pending",
      createdAt: now,
      updatedAt: now,
      sourceCreatedAt: payload.createdAt || null,
    });
  } else {
    await caseRef.set({
      ...baseRecord,
      updatedAt: now,
    }, { merge: true });
  }

  if (shouldQuarantine) {
    await db.doc(payload.sourcePath).set(
      {
        ...sourceGovernancePatch,
        ...buildSourcePatchForQuarantine(payload.sourceType, payload.sourceData, publicCaseId, analysis.riskLevel, analysis.riskScore),
      },
      { merge: true }
    );

    await db.collection("notifications").add({
      recipientId: STATION_MASTER_UID,
      senderId: "ai-rangers",
      senderName: "小站巡邏系統",
      type: "report",
      title: "小站巡邏系統隔離了高風險內容",
      content: `案件 ${publicCaseId} 已進入人工審核。`,
      read: false,
      createdAt: now,
      moderationCaseId: sourceKey,
    });
  } else {
    await db.doc(payload.sourcePath).set(sourceGovernancePatch, { merge: true });
  }
}

async function runPatrolForSource(payload) {
  if (!payload.content || !String(payload.content).trim()) return;
  if (payload.authorId === "system") return;

  const analysis = await analyzeWithGeminiForPatrol(payload);
  await writePatrolArtifacts(payload, analysis);
}

function requireSignedIn(request) {
  const uid = request.auth?.uid || "";
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  return uid;
}

function publicUserPayload(userDoc) {
  const data = userDoc.data() || {};
  const uid = data.uid || userDoc.id;
  return {
    uid,
    islanderId: typeof data.islanderId === "string" ? data.islanderId : "",
    displayName: typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : (typeof data.islanderId === "string" && data.islanderId.trim() ? data.islanderId.trim() : "匿名島民"),
    photoURL: typeof data.photoURL === "string" ? data.photoURL : DEFAULT_ISLANDER_PHOTO,
    role: uid === STATION_MASTER_UID ? "admin" : "user",
  };
}

async function loadPublicUsersForSearch(limit = 300) {
  const snapshot = await db.collection("users").orderBy("displayName").limit(limit).get();
  return snapshot.docs.map(publicUserPayload);
}

exports.searchMentionUsers = onCall(
  {
    region: REGION,
  },
  async (request) => {
    requireSignedIn(request);
    const queryText = String(request.data?.query || "").trim().toLowerCase().slice(0, 30);
    const users = await loadPublicUsersForSearch();

    return {
      users: users
        .filter((item) => {
          if (!queryText) return true;
          return String(item.displayName || "").toLowerCase().includes(queryText)
            || String(item.islanderId || "").toLowerCase().includes(queryText);
        })
        .slice(0, 6),
    };
  }
);

exports.resolveMentionRecipients = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const senderId = requireSignedIn(request);
    const names = Array.isArray(request.data?.names) ? request.data.names : [];
    const normalizedNames = [...new Set(
      names
        .map((name) => String(name || "").trim())
        .filter((name) => name.length >= 2 && name.length <= 20)
    )].slice(0, 10);

    if (normalizedNames.length === 0) {
      return { users: [] };
    }

    const found = [];
    for (const displayName of normalizedNames) {
      const snapshot = await db.collection("users")
        .where("displayName", "==", displayName)
        .limit(5)
        .get();

      snapshot.docs.forEach((userDoc) => {
        const userData = publicUserPayload(userDoc);
        if (userData.uid && userData.uid !== senderId) {
          found.push(userData);
        }
      });
    }

    const byUid = new Map();
    found.forEach((item) => byUid.set(item.uid, item));

    return {
      users: [...byUid.values()].slice(0, 10),
    };
  }
);

exports.checkDisplayNameAvailability = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const uid = requireSignedIn(request);
    const displayName = String(request.data?.displayName || "").trim();

    if (displayName.length < 2 || displayName.length > 12) {
      throw new HttpsError("invalid-argument", "Invalid display name length.");
    }

    const snapshot = await db.collection("users")
      .where("displayName", "==", displayName)
      .limit(5)
      .get();

    const isTaken = snapshot.docs.some((userDoc) => userDoc.id !== uid);
    return {
      available: !isTaken,
    };
  }
);

async function incrementField(path, field, delta) {
  try {
    await db.doc(path).update({
      [field]: admin.firestore.FieldValue.increment(delta),
    });
  } catch (error) {
    if (error?.code !== 5 && error?.code !== "not-found") {
      console.error("Counter update failed", { path, field, delta, error });
    }
  }
}

function getTaipeiDayKey(date = new Date()) {
  return new Date(date.getTime() + TAIPEI_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

async function recordDailyCommentUsage(authorId, fightMode) {
  const uid = String(authorId || "").trim();
  if (!uid || uid === STATION_MASTER_UID) {
    return { overLimit: false, count: 0, limit: Number.POSITIVE_INFINITY };
  }

  const dayKey = getTaipeiDayKey();
  const field = fightMode ? "fightCommentCount" : "commentCount";
  const limit = fightMode ? DAILY_FIGHT_COMMENT_LIMIT : DAILY_COMMENT_LIMIT;
  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let nextCount = 1;

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const currentCount = usageSnap.exists ? Math.max(0, Number(usageSnap.get(field) || 0)) : 0;
    nextCount = currentCount + 1;
    const patch = {
      uid,
      dayKey,
      updatedAt: now,
      [field]: admin.firestore.FieldValue.increment(1),
    };

    if (!usageSnap.exists) {
      patch.createdAt = now;
    }

    transaction.set(usageRef, patch, { merge: true });
  });

  return {
    overLimit: nextCount > limit,
    count: nextCount,
    limit,
    field,
    dayKey,
  };
}

async function hideContentForDailyLimit(sourcePath, sourceData, usage) {
  const sourceKey = getSourceKey(sourcePath);
  const publicCaseId = getPublicCaseId(sourcePath);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const policyRefs = [
    { code: "社群守則第4條", label: "禁止洗版、複製垃圾文與惡意干擾" },
    { code: "使用者條款第5條", label: "平台可審核、隔離、移除並保留必要治理紀錄" },
  ];
  const segments = sourcePath.split("/");
  const sourceType = segments.includes("replies") ? "reply" : "comment";

  await db.doc(sourcePath).set({
    content: "",
    moderationStatus: "removed",
    moderationPublicCaseId: publicCaseId,
    moderationRiskLevel: "medium",
    moderationRiskScore: 45,
    moderationUpdatedAt: now,
    moderationRemovalReason: "daily_comment_limit_exceeded",
    moderationRemovalNote: `每日留言/回覆上限 ${usage.limit}，目前第 ${usage.count} 則。`,
    policyVersion: POLICY_VERSION,
    policyRefs,
    fightMode: Boolean(sourceData.fightMode),
    userRiskLabel: sourceData.userRiskLabel || (sourceData.fightMode ? "fight" : "normal"),
    aiGovernanceMode: sourceData.fightMode ? "fight" : "escalated",
    quarantinedContentPreview: compactPreview(sourceData.content),
  }, { merge: true });

  await db.collection("moderationCases").doc(sourceKey).set({
    sourceType,
    sourcePath,
    postId: segments[1] || null,
    commentId: sourceType === "comment" ? segments[3] || null : segments[3] || null,
    replyId: sourceType === "reply" ? segments[5] || null : null,
    authorId: sourceData.authorId || null,
    authorName: sourceData.authorName || null,
    contentPreview: compactPreview(sourceData.content),
    contentSnapshot: String(sourceData.content || "").slice(0, 4000),
    fightMode: Boolean(sourceData.fightMode),
    userRiskLabel: sourceData.userRiskLabel || (sourceData.fightMode ? "fight" : "normal"),
    aiGovernanceMode: sourceData.fightMode ? "fight" : "escalated",
    policyVersion: POLICY_VERSION,
    policyRefs,
    riskLevel: "medium",
    riskScore: 45,
    categories: ["spam", "rate_limit"],
    summary: `每日留言/回覆次數已超過上限 ${usage.limit}。`,
    legalRisk: "疑似洗版或惡意干擾，平台依社群守則移除超量內容並保留紀錄。",
    publicInterest: "low",
    recommendedAction: "remove",
    rationale: "Server-side daily comment usage limit enforcement.",
    publicCaseId,
    status: "removed",
    createdAt: now,
    updatedAt: now,
    sourceCreatedAt: sourceData.createdAt || null,
  }, { merge: true });
}

exports.postLikeCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(`posts/${event.params.postId}`, "likesCount", 1);
  }
);

exports.postLikeDeleted = onDocumentDeleted(
  {
    region: REGION,
    document: "posts/{postId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(`posts/${event.params.postId}`, "likesCount", -1);
  }
);

exports.commentCreatedCounter = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}",
  },
  async (event) => {
    const data = event.data?.data() || {};
    const usage = await recordDailyCommentUsage(data.authorId, Boolean(data.fightMode));
    await incrementField(`posts/${event.params.postId}`, "commentsCount", 1);

    if (usage.overLimit) {
      await hideContentForDailyLimit(
        `posts/${event.params.postId}/comments/${event.params.commentId}`,
        data,
        usage
      );
    }
  }
);

exports.commentDeletedCounter = onDocumentDeleted(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}",
  },
  async (event) => {
    const data = event.data?.data() || {};
    const repliesCount = Math.max(0, Number(data.repliesCount || 0));
    await incrementField(`posts/${event.params.postId}`, "commentsCount", -(1 + repliesCount));
  }
);

exports.commentLikeCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "likesCount", 1);
  }
);

exports.commentLikeDeleted = onDocumentDeleted(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "likesCount", -1);
  }
);

exports.replyCreatedCounter = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/replies/{replyId}",
  },
  async (event) => {
    const data = event.data?.data() || {};
    const usage = await recordDailyCommentUsage(data.authorId, Boolean(data.fightMode));
    await Promise.all([
      incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "repliesCount", 1),
      incrementField(`posts/${event.params.postId}`, "commentsCount", 1),
    ]);

    if (usage.overLimit) {
      await hideContentForDailyLimit(
        `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
        data,
        usage
      );
    }
  }
);

exports.replyDeletedCounter = onDocumentDeleted(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/replies/{replyId}",
  },
  async (event) => {
    await Promise.all([
      incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "repliesCount", -1),
      incrementField(`posts/${event.params.postId}`, "commentsCount", -1),
    ]);
  }
);

exports.replyLikeCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/replies/{replyId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(
      `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
      "likesCount",
      1
    );
  }
);

exports.replyLikeDeleted = onDocumentDeleted(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/replies/{replyId}/likes/{userId}",
  },
  async (event) => {
    await incrementField(
      `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
      "likesCount",
      -1
    );
  }
);

exports.patrolPostCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}",
    secrets: ["GEMINI_API_KEY"],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    await runPatrolForSource({
      sourceType: "post",
      sourcePath: `posts/${event.params.postId}`,
      postId: event.params.postId,
      authorId: data.authorId,
      authorName: data.authorName,
      category: data.category || data.aiTag,
      content: data.content,
      fightMode: Boolean(data.fightMode),
      userRiskLabel: data.userRiskLabel || (data.fightMode ? "fight" : "normal"),
      preModerationRisk: data.aiRisk || 0,
      preModerationAction: data.aiAction || "",
      imageUrls: data.imageUrls,
      createdAt: data.createdAt || null,
      sourceData: data,
    });
  }
);

exports.patrolCommentCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}",
    secrets: ["GEMINI_API_KEY"],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    await runPatrolForSource({
      sourceType: "comment",
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}`,
      postId: event.params.postId,
      commentId: event.params.commentId,
      authorId: data.authorId,
      authorName: data.authorName,
      content: data.content,
      fightMode: Boolean(data.fightMode),
      userRiskLabel: data.userRiskLabel || (data.fightMode ? "fight" : "normal"),
      createdAt: data.createdAt || null,
      sourceData: data,
    });
  }
);

exports.patrolReplyCreated = onDocumentCreated(
  {
    region: REGION,
    document: "posts/{postId}/comments/{commentId}/replies/{replyId}",
    secrets: ["GEMINI_API_KEY"],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    await runPatrolForSource({
      sourceType: "reply",
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
      postId: event.params.postId,
      commentId: event.params.commentId,
      replyId: event.params.replyId,
      authorId: data.authorId,
      authorName: data.authorName,
      content: data.content,
      fightMode: Boolean(data.fightMode),
      userRiskLabel: data.userRiskLabel || (data.fightMode ? "fight" : "normal"),
      createdAt: data.createdAt || null,
      sourceData: data,
    });
  }
);

async function assertStationMasterCallable(request) {
  const uid = request.auth?.uid || "";
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }

  if (uid === STATION_MASTER_UID) return uid;

  throw new HttpsError("permission-denied", "Only the station master can perform moderation actions.");
}

async function updateSourceByAction(caseData, action) {
  const sourceRef = db.doc(caseData.sourcePath);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (action === "release") {
    const patch = {
      content: caseData.contentSnapshot || "",
      moderationStatus: "released",
      moderationUpdatedAt: now,
    };

    if (caseData.sourceType === "post") {
      patch.imageUrls = Array.isArray(caseData.imageUrlsSnapshot) ? caseData.imageUrlsSnapshot : [];
    }

    await sourceRef.set(patch, { merge: true });
    return "released";
  }

  if (action === "quarantine") {
    await sourceRef.set({
      moderationStatus: "quarantined",
      content: "",
      ...(caseData.sourceType === "post" ? { imageUrls: [] } : {}),
      moderationUpdatedAt: now,
    }, { merge: true });
    return "quarantined";
  }

  if (action === "remove") {
    await sourceRef.set({
      moderationStatus: "removed",
      content: "",
      ...(caseData.sourceType === "post" ? { imageUrls: [] } : {}),
      moderationUpdatedAt: now,
    }, { merge: true });
    return "removed";
  }

  return "reviewed";
}

exports.rangerModerationAction = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const caseId = String(request.data?.caseId || "").trim();
    const action = String(request.data?.action || "").trim();
    const allowedActions = ["mark_reviewed", "dismiss", "release", "quarantine", "remove"];

    if (!caseId || !allowedActions.includes(action)) {
      throw new HttpsError("invalid-argument", "Invalid moderation action.");
    }

    const caseRef = db.collection("moderationCases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      throw new HttpsError("not-found", "Moderation case was not found.");
    }

    const caseData = caseSnap.data();
    const sourceStatus = await updateSourceByAction(caseData, action);
    const nextStatus = action === "dismiss" ? "dismissed" : sourceStatus;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await caseRef.set({
      status: nextStatus,
      lastAction: action,
      reviewedBy: reviewerId,
      reviewedAt: now,
      updatedAt: now,
    }, { merge: true });

    return {
      ok: true,
      caseId,
      status: nextStatus,
    };
  }
);

function parseManagedSourcePath(sourcePath) {
  const segments = String(sourcePath || "").split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "posts") {
    return {
      sourceType: "post",
      postId: segments[1],
    };
  }

  if (segments.length === 4 && segments[0] === "posts" && segments[2] === "comments") {
    return {
      sourceType: "comment",
      postId: segments[1],
      commentId: segments[3],
    };
  }

  if (
    segments.length === 6 &&
    segments[0] === "posts" &&
    segments[2] === "comments" &&
    segments[4] === "replies"
  ) {
    return {
      sourceType: "reply",
      postId: segments[1],
      commentId: segments[3],
      replyId: segments[5],
    };
  }

  throw new HttpsError("invalid-argument", "Unsupported content path.");
}

async function applyDirectContentAction({ sourcePath, action, reviewerId, reason }) {
  const sourceMeta = parseManagedSourcePath(sourcePath);
  const sourceRef = db.doc(sourcePath);
  const sourceSnap = await sourceRef.get();

  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Content was not found.");
  }

  const sourceData = sourceSnap.data() || {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const sourceKey = getSourceKey(sourcePath);
  const publicCaseId = sourceData.moderationPublicCaseId || getPublicCaseId(sourcePath);
  const moderationReason = String(reason || "").trim().slice(0, 240);
  const contentSnapshot = String(
    sourceData.content ||
    sourceData.contentSnapshot ||
    sourceData.quarantinedContentPreview ||
    ""
  ).slice(0, 4000);
  const riskScore = clampNumber(
    Number(sourceData.moderationRiskScore || sourceData.aiRisk || 0),
    0,
    100
  );
  const riskLevel = normalizeRiskLevel(sourceData.moderationRiskLevel, riskScore);
  const basePatch = {
    moderationPublicCaseId: publicCaseId,
    moderationRiskLevel: riskLevel,
    moderationRiskScore: riskScore,
    moderationUpdatedAt: now,
  };

  if (!["hide", "delete"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported content action.");
  }

  if (action === "hide" && !moderationReason) {
    throw new HttpsError("invalid-argument", "A moderation reason is required when hiding content.");
  }

  if (action === "hide") {
    await sourceRef.set({
      ...basePatch,
      moderationStatus: "removed",
      moderationReason,
      content: "",
      quarantinedContentPreview: compactPreview(contentSnapshot),
      ...(sourceMeta.sourceType === "post" ? { imageUrls: [] } : {}),
    }, { merge: true });
  }

  const caseRecord = {
    sourceType: sourceMeta.sourceType,
    sourcePath,
    postId: sourceMeta.postId || null,
    commentId: sourceMeta.commentId || null,
    replyId: sourceMeta.replyId || null,
    authorId: sourceData.authorId || null,
    authorName: sourceData.authorName || null,
    category: sourceData.category || sourceData.aiTag || null,
    contentPreview: compactPreview(contentSnapshot),
    contentSnapshot,
    imageUrlsSnapshot: Array.isArray(sourceData.imageUrls) ? sourceData.imageUrls.slice(0, 8) : [],
    fightMode: Boolean(sourceData.fightMode),
    userRiskLabel: sourceData.userRiskLabel || (sourceData.fightMode ? "fight" : "normal"),
    aiGovernanceMode: sourceData.aiGovernanceMode || "manual",
    policyVersion: POLICY_VERSION,
    policyRefs: [
      { code: "使用者條款第5條", label: "站長可依平台治理需要移除高風險或違規內容" },
      { code: "社群守則第4條", label: "禁止個資、威脅、騷擾、未證實重大指控與惡意干擾" },
    ],
    riskLevel,
    riskScore,
    categories: sanitizeArray(sourceData.moderationCategories || sourceData.categories || []),
    summary: action === "hide" ? `站長遮蔽此內容：${moderationReason}` : "站長從本地後台完全移除此內容。",
    legalRisk: action === "hide" ? "內容已遮蔽並保留治理紀錄，可供後續申訴與安全稽核。" : "目標文件已刪除，治理紀錄保留於站長後台。",
    publicInterest: "unknown",
    recommendedAction: action === "hide" ? "hide" : "delete",
    rationale: action === "hide" ? moderationReason : "Manual hard delete from AI Ranger dashboard.",
    publicCaseId,
    status: "removed",
    lastAction: action,
    moderationReason,
    reviewedBy: reviewerId,
    reviewedAt: now,
    updatedAt: now,
    createdAt: sourceData.createdAt || now,
    sourceCreatedAt: sourceData.createdAt || null,
  };

  await db.collection("moderationCases").doc(sourceKey).set(caseRecord, { merge: true });

  if (action === "delete") {
    await sourceRef.delete();
  }

  return {
    ok: true,
    sourcePath,
    status: action === "hide" ? "removed" : "deleted",
    publicCaseId,
  };
}

exports.rangerContentAction = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const sourcePath = String(request.data?.sourcePath || "").trim();
    const action = String(request.data?.action || "").trim();
    const reason = String(request.data?.reason || "").trim();

    if (!sourcePath || !["hide", "delete"].includes(action)) {
      throw new HttpsError("invalid-argument", "Invalid content action.");
    }

    return applyDirectContentAction({
      sourcePath,
      action,
      reviewerId,
      reason,
    });
  }
);
