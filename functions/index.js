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
const ASSISTANT_IDENTITY = "馬祖小站智能客服（AI 輔助，非真人客服）";
const AI_NOTICE = "注意事項：小站智能客服僅提供輔助回覆，不提供互動功能，AI 可能會出錯。";
const SUPPORT_FOOTER = "如果需要站長處理，請按下方對應按鈕。";

const HANDOFF_OPTIONS = {
  issue: {
    label: "問題回報",
    receipt:
      "AI 模式已關閉，您的問題回報已留在聊天室。\n\n請直接在這裡補充截圖、手機型號或瀏覽器、操作步驟與大約發生時間。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  contact: {
    label: "聯絡站長",
    receipt:
      "AI 模式已關閉，您的訊息已留在聊天室等待站長查看。\n\n請直接在這裡補充要聯絡站長的內容。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  business: {
    label: "商業合作",
    receipt:
      "AI 模式已關閉，您的商業合作訊息已留在聊天室。\n\n請直接在這裡補充合作內容、希望合作時間、需求與方便回覆的方式。請耐心等待站長回覆，通常會在假日或空檔時段集中查看。",
  },
  report: {
    label: "檢舉內容",
    receipt:
      "AI 模式已關閉，您的檢舉訊息已留在聊天室。\n\n請直接在這裡補充截圖、文章或留言位置、發生時間與簡短原因。站長看到後會檢查處理。",
  },
  suggestion: {
    label: "提供建議",
    receipt:
      "AI 模式已關閉，您的建議已留在聊天室。\n\n感謝您協助馬祖小站變得更好。您可以直接在這裡補充更多細節，站長會集中整理大家的回饋。",
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

  return `${buttonText}\n\n按下按鈕後，AI 模式會關閉，訊息會留在聊天室等待站長查看。站長通常會在假日或空檔時段集中回覆。`;
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
你是「馬祖小站 Matsu Station」LINE 官方帳號的小站智能客服輔助 AI，不是自由聊天角色，也不提供互動功能。

重要事實：
- 官方聯絡與回報管道就是這個 LINE 官方帳號。
- 不要說網站頁面最下方有「聯絡站長」連結。
- 不要說網站有聯絡表單，除非站長未來明確新增。
- 小站智能客服僅提供輔助回覆，不提供互動功能，AI 可能會出錯；重要資訊以站長回覆、網站內容或官方公告為準。
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
  const replyText = `${option.receipt}\n\nAI 狀態會在下週一自動刷新。`;

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
          "我收到你的訊息了。\n\n如果這是問題回報或要給站長查看，請先按下方「問題回報」或「聯絡站長」按鈕，AI 模式關閉後再補充圖片或文字。"
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

function stripJsonFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function fallbackPatrolAnalysis(content) {
  const text = String(content || "");
  const hasPersonalData = /(身分證|電話|地址|住址|個資|肉搜|家裡|車牌|手機)/.test(text);
  const hasThreat = /(殺|打死|弄死|威脅|恐嚇|堵你|找你算帳)/.test(text);
  const hasCriminalClaim = /(貪污|收錢|詐騙|偷|強姦|販毒|犯罪|黑道|洗錢)/.test(text);
  const score = hasThreat || hasPersonalData ? 92 : hasCriminalClaim ? 76 : 18;
  const riskLevel = normalizeRiskLevel("", score);

  return {
    riskLevel,
    riskScore: score,
    categories: [
      ...(hasPersonalData ? ["personal_data"] : []),
      ...(hasThreat ? ["threat"] : []),
      ...(hasCriminalClaim ? ["unverified_accusation"] : []),
    ],
    summary: "AI analysis fallback was used because Gemini did not return valid JSON.",
    legalRisk: hasPersonalData || hasThreat || hasCriminalClaim
      ? "Potential legal or safety risk requires manual review."
      : "No obvious legal risk detected by fallback rules.",
    publicInterest: "unknown",
    recommendedAction: getRecommendedAction(riskLevel),
    rationale: "Fallback keyword-based analysis.",
  };
}

function normalizePatrolAnalysis(rawAnalysis, content) {
  const fallback = fallbackPatrolAnalysis(content);
  const riskScore = clampNumber(rawAnalysis?.riskScore ?? rawAnalysis?.score ?? fallback.riskScore, 0, 100);
  const riskLevel = normalizeRiskLevel(rawAnalysis?.riskLevel, riskScore);

  return {
    riskLevel,
    riskScore,
    categories: sanitizeArray(rawAnalysis?.categories || rawAnalysis?.labels || fallback.categories),
    summary: String(rawAnalysis?.summary || fallback.summary).slice(0, 500),
    legalRisk: String(rawAnalysis?.legalRisk || fallback.legalRisk).slice(0, 500),
    publicInterest: String(rawAnalysis?.publicInterest || fallback.publicInterest).slice(0, 80),
    recommendedAction: String(rawAnalysis?.recommendedAction || getRecommendedAction(riskLevel)).slice(0, 80),
    rationale: String(rawAnalysis?.rationale || fallback.rationale).slice(0, 700),
  };
}

function buildPatrolPrompt({ sourceType, content, category }) {
  return `
You are AI Rangers for Matsu Station, a Taiwan local community forum.
Your job is not censorship. Your job is risk triage for a human station master.

Analyze this ${sourceType} in Traditional Chinese context.
Return JSON only. No markdown.

Risk levels:
- low: normal criticism, jokes, emotional but lawful discussion
- medium: strong accusation, heated conflict, possible dispute
- high: unverified criminal accusation, serious defamation risk, doxxing hints
- critical: personal data, direct threat, targeted harassment, malicious doxxing

JSON schema:
{
  "riskLevel": "low|medium|high|critical",
  "riskScore": 0,
  "categories": ["public_issue", "politics", "personal_data", "threat", "harassment", "unverified_accusation", "spam"],
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
    }, content);
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
    return normalizePatrolAnalysis(parsed, content);
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
  const shouldCreateCase = ["medium", "high", "critical"].includes(analysis.riskLevel);
  const shouldQuarantine = ["high", "critical"].includes(analysis.riskLevel);

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

  if (!shouldCreateCase) return;

  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const existingCase = await caseRef.get();
  if (!existingCase.exists) {
    await caseRef.set({
      ...baseRecord,
      contentSnapshot: String(payload.content || "").slice(0, 4000),
      imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
      status: shouldQuarantine ? "quarantined" : "pending",
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
      buildSourcePatchForQuarantine(payload.sourceType, payload.sourceData, publicCaseId, analysis.riskLevel, analysis.riskScore),
      { merge: true }
    );

    await db.collection("notifications").add({
      recipientId: STATION_MASTER_UID,
      senderId: "ai-rangers",
      senderName: "AI 游騎兵",
      type: "report",
      title: "AI 游騎兵隔離了高風險內容",
      content: `案件 ${publicCaseId} 已進入人工審核。`,
      read: false,
      createdAt: now,
      moderationCaseId: sourceKey,
    });
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
    await incrementField(`posts/${event.params.postId}`, "commentsCount", 1);
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
    await Promise.all([
      incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "repliesCount", 1),
      incrementField(`posts/${event.params.postId}`, "commentsCount", 1),
    ]);
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

  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.exists && userSnap.data()?.role === "admin") return uid;

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
