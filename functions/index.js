const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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
const STATION_MASTER_LEGACY_ID = "L";
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
const POLICY_VERSION = "2026-05-23";
const REGEX_GOVERNANCE_VERSION = "regex-lightguard-v3-2026-05-22";
const AI_REGEX_MERGE_VERSION = "ai-lightguard-merge-v5-2026-05-22";
const GEMINI_SITE_SHEET_RISK_VERSION = "gemini-site-sheet-risk-v1-2026-05-23";
const AI_PATROL_QUEUE_VERSION = "ai-patrol-queue-v1-2026-05-21";
const QUEUE_PRECHECK_ANALYSIS_VERSION = "queue-precheck-v1-2026-05-21";
const AI_PATROL_QUEUE_COLLECTION = "aiPatrolQueue";
const AI_PATROL_QUEUE_MAX_ATTEMPTS = 3;
const AI_PATROL_QUEUE_PRECHECK_THRESHOLD = 90;
const SERVER_POST_CHAR_LIMIT = 500;
const SERVER_COMMENT_CHAR_LIMIT = 250;
const SERVER_POST_COOLDOWN_MS = 30 * 1000;
const SERVER_NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;
const SERVER_DAILY_POST_LIMIT = 20;
const SERVER_DAILY_COMMENT_LIMIT = DAILY_COMMENT_LIMIT;
const SERVER_DAILY_REPORT_LIMIT = 30;
const SERVER_DAILY_AVATAR_UPDATE_LIMIT = 5;
const SERVER_DAILY_POST_IMAGE_LIMIT = 5;
const SERVER_POST_IMAGE_COOLDOWN_MS = 60 * 1000;
const SERVER_MAX_POST_IMAGES = 1;
const ACCOUNT_CONTROL_VERSION = "account-control-v1-2026-05-22";
const AI_PATROL_QUEUE_REVIEW_COPY = "此內容可能涉及高風險資訊，目前正在由站長審核中。";
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

function getOpenAIKey() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY secret is missing");
  }
  return apiKey;
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

const HARD_PERSONAL_DATA_FORMAT_RULES = [
  {
    id: "national_id",
    pattern: /[A-Z][12]\d{8}/i,
    category: "personal_data",
    label: "身分證字號格式",
    severity: 95,
    action: "pending_review",
  },
  {
    id: "credit_card",
    pattern: /(?:\d[ -]*?){13,19}/,
    category: "personal_data",
    label: "信用卡或長串金融號碼格式",
    severity: 92,
    action: "pending_review",
  },
  {
    id: "bank_account",
    pattern: /(銀行|郵局|帳戶|帳號).{0,12}\d{8,16}/,
    category: "personal_data",
    label: "銀行帳戶格式",
    severity: 90,
    action: "pending_review",
  },
  {
    id: "otp_code",
    pattern: /(OTP|驗證碼|簡訊碼|認證碼).{0,8}\d{4,8}/i,
    category: "personal_data",
    label: "驗證碼格式",
    severity: 92,
    action: "pending_review",
  },
];

const SOFT_PERSONAL_DATA_FORMAT_RULES = [
  {
    id: "taiwan_mobile",
    pattern: /09\d{2}[-\s]?\d{3}[-\s]?\d{3}/,
    category: "personal_data_hint",
    label: "手機號碼格式",
    severity: 32,
    action: "allow",
  },
  {
    id: "landline",
    pattern: /0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4}/,
    category: "personal_data_hint",
    label: "電話號碼格式",
    severity: 28,
    action: "allow",
  },
  {
    id: "address_shape",
    pattern: /(地址|住址|家住|住在|門牌).{0,28}(縣|市|鄉|鎮|村|路|街|巷|弄|號)/,
    category: "personal_data_hint",
    label: "地址描述格式",
    severity: 32,
    action: "allow",
  },
  {
    id: "vehicle_plate",
    pattern: /(車牌|牌照).{0,12}[A-Z0-9]{2,4}[-\s]?[A-Z0-9]{2,4}/i,
    category: "personal_data_hint",
    label: "車牌格式",
    severity: 32,
    action: "allow",
  },
];

const SPAM_FORMAT_RULES = [
  {
    id: "many_urls",
    pattern: /(https?:\/\/\S+).{0,80}(https?:\/\/\S+)/i,
    category: "spam",
    label: "大量網址",
    severity: 42,
    action: "mask",
  },
  {
    id: "repeated_character",
    pattern: /(.)\1{12,}/,
    category: "spam",
    label: "單一字元洗版",
    severity: 38,
    action: "mask",
  },
  {
    id: "promo_link",
    pattern: /(免費領|限時領取|點我領|點連結|加群|加入群組|保證獲利|穩賺不賠|日賺|月入|高薪兼職|代操|投資群|博弈|賭盤|補助名額|官方通知|中獎通知|快速撥款|代辦補助).{0,50}(https?:\/\/|LINE|Line|line|私訊|加賴|加LINE|填資料|填表單|匯款|帳號|連結)/,
    category: "spam",
    label: "廣告/導流格式",
    severity: 42,
    action: "mask",
  },
];

const AI_PATROL_PRIORITY_RULES = [
  {
    id: "explicit_robbery_or_forced_entry_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去).{0,10}(搶劫|搶銀行|搶超商|搶店|搶星巴克|洗劫|打劫|闖入|闖進|砸店)/,
    score: 96,
    categories: ["threat", "violence", "property_crime"],
    label: "明確搶劫/闖入/砸店語意",
  },
  {
    id: "generic_first_person_robbery_target_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去).{0,8}搶(?!票|購|救|先|頭香|沙發|位|座位|名額|優惠|折扣|便宜|特價|限量|時間|鏡頭|生意|訂單|第一|第一個|食物|午餐|晚餐|早餐|東西|手機|網路)([一-龥A-Za-z0-9]{2,}(店|港|站|山|頂|村|路|街|公司|銀行|超商|餐廳|縣府|縣長|學校)?)/,
    score: 94,
    categories: ["threat", "violence", "property_crime"],
    label: "第一人稱搶奪具體目標語意",
  },
  {
    id: "explicit_abduction_or_physical_harm_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去|叫人|找人).{0,14}(綁架|綁票|綁走|劫持|挾持|擄走|殺死|殺掉|殺了|砍死|打死|弄死|放火|縱火|炸掉)/,
    score: 98,
    categories: ["threat", "violence"],
    label: "明確人身安全威脅語意",
  },
  {
    id: "explicit_assault_or_weapon_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去|叫人|找人|今晚|等等|等下|一起).{0,14}(打爆|打到住院|圍毆|堵人|堵他|堵她|堵你|堵門口|拖出來|拿刀|持刀|開槍|砍人|砍他|砍她|砍你|揍他|揍她|揍你|教訓他|教訓她|教訓你|弄殘)/,
    score: 96,
    categories: ["threat", "violence", "harassment"],
    label: "毆打/堵人/武器威脅語意",
  },
  {
    id: "arson_or_explosive_target_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去|今晚|等等|等下).{0,18}(放火|縱火|燒掉|燒了|炸掉|爆破).{0,12}(店|家|車|船|縣府|學校|港|站|公司|餐廳|超商|銀行)?/,
    score: 98,
    categories: ["threat", "violence", "property_crime"],
    label: "放火/爆裂物高風險語意",
  },
  {
    id: "rob_personal_property_intent",
    pattern: /(我要|我會|準備|打算|想去|去|要去).{0,10}搶(他|她|你|路人|學生|店員|老人|遊客|乘客).{0,6}(手機|錢包|包包|車|機車|現金|東西)/,
    score: 94,
    categories: ["threat", "violence", "property_crime"],
    label: "搶奪個人財物語意",
  },
  {
    id: "doxxing_or_private_data_intent",
    pattern: /(肉搜|開盒|公布|公開|貼出|挖出).{0,18}(個資|地址|電話|住址|車牌|家在哪|本名|身分|身份)/,
    score: 92,
    categories: ["privacy", "personal_data", "harassment"],
    label: "肉搜/公開個資語意",
  },
  {
    id: "direct_doxxing_intent",
    pattern: /(?:(我要|我會|準備|打算|幫我|誰來|大家).{0,12}(開盒|肉搜|人肉).{0,10}(他|她|你|那個人|店員|老師|同學|縣長|老闆|本人)?|(?:把|將|直接).{0,12}(電話|地址|住址|車牌|本名|個資).{0,12}(貼出來|丟出來|公開|公布))/,
    score: 93,
    categories: ["privacy", "personal_data", "harassment"],
    label: "直接開盒/公開個資意圖",
  },
  {
    id: "extortion_or_blackmail_intent",
    pattern: /(不給錢|不匯款|不道歉|不照做|敢不).{0,18}(公開|公布|貼出|開盒|肉搜|打|砍|弄死|散布|外流)/,
    score: 95,
    categories: ["threat", "privacy", "harassment"],
    label: "勒索/脅迫公開或傷害語意",
  },
  {
    id: "partial_private_data_leak_intent",
    pattern: /(我有|手上有|誰有|拿到).{0,14}(他|她|對方|那個人|某人)?.{0,14}(照片|對話|帳號|車牌|地址|住址|電話|個資|私密資料).{0,18}(公開|公布|貼出|丟出|外流|散布|傳出去)/,
    score: 93,
    categories: ["privacy", "personal_data", "harassment"],
    label: "持有並準備公開私密資料語意",
  },
  {
    id: "sexual_private_image_intent",
    pattern: /(散布|轉傳|分享|交換|求|外流|誰有|徵|收|買|賣|想看).{0,24}(未成年|兒少|國中|高中|小孩|學生)?.{0,16}(裸照|私密照|不雅照|性影像|偷拍|床照)/,
    score: 98,
    categories: ["sexual_image", "privacy"],
    label: "私密/兒少影像索取或散布語意",
  },
  {
    id: "scam_financial_lure_intent",
    pattern: /(保證獲利|穩賺不賠|日賺|月入|高薪兼職|代操|投資群|博弈|賭盤|貸款免審|免審貸款|補助名額|官方通知|中獎通知|快速撥款|代辦補助).{0,50}(加LINE|加賴|私訊|填資料|填表單|匯款|帳號|連結|https?:\/\/|line)/i,
    score: 92,
    categories: ["scam", "fraud", "spam"],
    label: "詐騙/投資導流語意",
  },
  {
    id: "coordinated_harassment_mobilization",
    pattern: /(揪團|大家|一起|今晚|明天|等等|等下|約一約|號召).{0,18}(堵|圍|包圍|闖|拖出來|砸|報復|洗版).{0,18}(門口|他|她|你|店|店家|學校|縣府|港|站|公司|餐廳|住家|家裡|本人)/,
    score: 91,
    categories: ["harassment", "coordination", "threat"],
    label: "集體動員騷擾/圍堵語意",
  },
  {
    id: "coordinated_harassment_target_first",
    pattern: /(揪團|大家|一起|今晚|明天|等等|等下|約一約|號召|有人在揪).{0,24}(門口|單位|店|店家|學校|縣府|港|站|公司|餐廳|住家|家裡|本人|某單位|某店|活動|活動會場|會場|現場|廣場|場地).{0,24}(堵|圍|圍住|包圍|闖|拖出來|砸|砸人|報復|洗版)/,
    score: 91,
    categories: ["harassment", "coordination", "threat"],
    label: "集體動員到場圍堵語意",
  },
  {
    id: "unverified_local_accusation_watch",
    pattern: /(聽說|有人說|爆料|群組在傳|大家都說|是不是|懷疑).{0,28}(店|店家|餐廳|單位|學校|候選人|議員|縣府|某某|老闆|帳號|社團|派系).{0,28}(收回扣|貪污|標案|補助|金流|黑箱|偷工減料|帶風向|買票|關說|內定)/,
    score: 84,
    categories: ["unverified_accusation", "defamation_risk", "public_issue"],
    label: "未證實地方指控觀察語意",
  },
  {
    id: "unverified_named_accusation_watch",
    pattern: /(某某|某人|那個人|那間店|那個單位|[一-龥A-Za-z0-9]{2,10}).{0,10}(是不是|疑似|被說|被爆|聽說).{0,18}(收回扣|貪污|標案|補助|金流|黑箱|偷工減料|帶風向|買票|關說|內定)/,
    score: 84,
    categories: ["unverified_accusation", "defamation_risk", "public_issue"],
    label: "可識別對象未證實指控觀察語意",
  },
  {
    id: "local_faction_mobilization_watch",
    pattern: /(聽說|有人說|群組在傳|爆料|大家都說).{0,24}(派系|群組|帳號|社團|陣營).{0,20}(動員|洗版|帶風向|灌票|操作留言|號召留言)/,
    score: 78,
    categories: ["coordination", "public_issue", "rumor"],
    label: "派系/帳號動員觀察語意",
  },
  {
    id: "public_service_complaint_escalation_watch",
    pattern: /(醫院|診所|船班|航班|學校|交通|縣府|公所|警察|消防|候船|港口).{0,28}(爛到|氣死|黑箱|罵爆|洗版|大家去留言|拒搭|抵制|投訴爆|沒人處理)/,
    score: 72,
    categories: ["public_service", "heated_complaint", "public_issue"],
    label: "公共服務抱怨升溫觀察語意",
  },
];

function containsAnyTerm(text, terms) {
  return terms.some((term) => text.includes(term));
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function addRegexSignal(signals, {
  id,
  category,
  label,
  severity,
  action,
  match,
  source = "regex",
}) {
  if (!category || signals.some((item) => item.id === id && item.match === match)) return;
  signals.push({
    id,
    category,
    label,
    severity: clampNumber(Number(severity || 0), 0, 100),
    action: action || "monitor",
    match: String(match || "").slice(0, 40),
    source,
  });
}

function collectTermSignals(text, terms, category, label, severity, action, signals) {
  terms.forEach((term) => {
    if (!term || !text.includes(term)) return;
    addRegexSignal(signals, {
      id: `${category}:term:${term}`,
      category,
      label,
      severity,
      action,
      match: term,
      source: "term",
    });
  });
}

function collectPatternSignals(text, patterns, category, label, severity, action, signals) {
  patterns.forEach((pattern, index) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (!match) return;
    addRegexSignal(signals, {
      id: `${category}:pattern:${index}`,
      category,
      label,
      severity,
      action,
      match: match[0],
    });
  });
}

function collectRuleSignals(text, rules, signals) {
  rules.forEach((rule) => {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    rule.pattern.lastIndex = 0;
    if (!match) return;
    addRegexSignal(signals, {
      id: rule.id,
      category: rule.category,
      label: rule.label,
      severity: rule.severity,
      action: rule.action,
      match: match[0],
      source: "regex",
    });
  });
}

function getRegexRiskTierFloor(signals = []) {
  const categories = new Set((signals.categories || []).map(String));
  if (categories.has("personal_data")) {
    return { legalRisk: 3, communityRisk: 0, spreadRisk: 3 };
  }
  if (categories.has("spam")) {
    return { legalRisk: 0, communityRisk: 1, spreadRisk: 1 };
  }
  return { legalRisk: 0, communityRisk: 0, spreadRisk: 0 };
}

function getStoredDeterministicSignals(signals = {}) {
  return {
    version: REGEX_GOVERNANCE_VERSION,
    purpose: String(signals.purpose || "lightweight_guardrail").slice(0, 80),
    scoreFloor: clampNumber(Number(signals.scoreFloor || 0), 0, 100),
    categories: sanitizeArray(signals.categories || []).slice(0, 10),
    summary: String(signals.summary || "").slice(0, 240),
    legalRisk: String(signals.legalRisk || "").slice(0, 240),
    recommendedAction: String(signals.recommendedAction || "").slice(0, 80),
    targetSensitivity: String(signals.targetSensitivity || "unknown").slice(0, 60),
    signals: Array.isArray(signals.regexSignals)
      ? signals.regexSignals
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: String(item.id || "").slice(0, 80),
          category: String(item.category || "").slice(0, 60),
          label: String(item.label || "").slice(0, 80),
          severity: clampNumber(Number(item.severity || 0), 0, 100),
          action: String(item.action || "").slice(0, 80),
          match: String(item.match || "").slice(0, 40),
          source: String(item.source || "regex").slice(0, 20),
        }))
        .slice(0, 12)
      : [],
  };
}

function normalizeRiskScanText(content) {
  return String(content || "")
    .normalize("NFKC")
    .replace(/[\s\u200b\u200c\u200d・･·.。_＿\-－—~～*＊]+/g, "");
}

function addUniqueCategory(categories, category) {
  if (category && !categories.includes(category)) categories.push(category);
}

function isMostlySymbols(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact) return false;
  const meaningful = compact.match(/[\p{Script=Han}A-Za-z0-9]/gu) || [];
  return meaningful.length === 0 || meaningful.length / compact.length < 0.2;
}

function getDeterministicRiskSignals(content, payload = {}) {
  const rawText = String(content || "");
  const trimmed = rawText.trim();
  const text = normalizeRiskScanText(content);
  const preRisk = clampNumber(Number(payload.preModerationRisk || 0) * 10, 0, 100);
  const preAction = String(payload.preModerationAction || "");
  const regexSignals = [];

  if (!trimmed) {
    addRegexSignal(regexSignals, {
      id: "blank_content",
      category: "low_quality",
      label: "空白內容",
      severity: 28,
      action: "allow",
      match: "",
      source: "format",
    });
  } else if (isMostlySymbols(trimmed)) {
    addRegexSignal(regexSignals, {
      id: "symbol_only",
      category: "low_quality",
      label: "幾乎只有符號",
      severity: 24,
      action: "allow",
      match: trimmed.slice(0, 20),
      source: "format",
    });
  }

  collectRuleSignals(rawText, HARD_PERSONAL_DATA_FORMAT_RULES, regexSignals);
  collectRuleSignals(rawText, SOFT_PERSONAL_DATA_FORMAT_RULES, regexSignals);
  collectRuleSignals(text, SPAM_FORMAT_RULES, regexSignals);

  const categories = [];
  regexSignals.forEach((signal) => addUniqueCategory(categories, signal.category));
  const strongest = regexSignals.reduce((best, signal) =>
    Number(signal.severity || 0) > Number(best?.severity || 0) ? signal : best,
  null);
  const hasHardFormat = regexSignals.some((signal) => signal.category === "personal_data");
  const hasSpam = regexSignals.some((signal) => signal.category === "spam");
  const hasLowQuality = regexSignals.some((signal) => signal.category === "low_quality");
  const scoreFloor = strongest ? clampNumber(Number(strongest.severity || 0), 0, 100) : 0;
  let summary = "";
  let legalRisk = "";
  let recommendedAction = strongest?.action || "";

  if (hasHardFormat) {
    summary = "偵測到可能涉及個資、金融或驗證碼的格式，建議站長確認。";
    legalRisk = "可能包含可識別個資或高敏感資訊，需確認語境。";
    recommendedAction = "pending_review";
  } else if (hasSpam) {
    summary = "偵測到大量網址、重複字元或導流洗版形式。";
    legalRisk = "主要是平台濫用與洗版風險，不代表內容已被判定違法。";
    recommendedAction = "mask";
  } else if (hasLowQuality) {
    summary = "內容接近空白或低資訊量形式。";
    legalRisk = "僅為基礎格式提示，未代表內容已違規。";
    recommendedAction = "allow";
  }

  if (preAction === "review") {
    addRegexSignal(regexSignals, {
      id: "legacy_precheck_hint",
      category: "precheck_hint",
      label: "舊版檢查提示",
      severity: Math.min(preRisk || 20, 30),
      action: "allow",
      match: "precheck",
      source: "legacy",
    });
    addUniqueCategory(categories, "precheck_hint");
    summary ||= "舊版檢查留下提示，僅作站務優先查看參考。";
    legalRisk ||= "非裁決訊號。";
    recommendedAction ||= "allow";
  }

  return {
    scoreFloor,
    categories,
    summary,
    legalRisk,
    recommendedAction,
    targetSensitivity: "unknown",
    regexSignals,
    regexVersion: REGEX_GOVERNANCE_VERSION,
    purpose: "lightweight_guardrail",
  };
}

function getRegexSignalList(signals = {}) {
  if (Array.isArray(signals.regexSignals)) return signals.regexSignals;
  if (Array.isArray(signals.signals)) return signals.signals;
  return [];
}

function getRegexActionFloorScore(signals = {}) {
  const signalList = getRegexSignalList(signals);
  const floorSignals = signalList.filter((signal) =>
    signal.category === "personal_data" ||
    signal.category === "spam"
  );
  return floorSignals.reduce((max, signal) =>
    Math.max(max, clampNumber(Number(signal.severity || 0), 0, 100)),
  0);
}

function getSemanticPatrolPriority(content) {
  const text = normalizeRiskScanText(content);
  const hits = [];
  AI_PATROL_PRIORITY_RULES.forEach((rule) => {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    rule.pattern.lastIndex = 0;
    if (!match) return;
    hits.push({
      id: rule.id,
      label: rule.label,
      score: clampNumber(Number(rule.score || 0), 0, 100),
      categories: rule.categories || [],
      match: String(match[0] || "").slice(0, 40),
    });
  });
  const strongest = hits.reduce((best, hit) =>
    hit.score > Number(best?.score || 0) ? hit : best,
  null);
  return {
    score: strongest?.score || 0,
    categories: [...new Set(hits.flatMap((hit) => hit.categories || []))].slice(0, 8),
    hits,
    summary: strongest
      ? `${strongest.label}。此訊號僅作為站務優先查看依據，不直接裁決。`
      : "",
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

function getRiskLevelFromScore(score) {
  return normalizeRiskLevel("", clampNumber(Number(score || 0), 0, 100));
}

function getRecommendedAction(riskLevel) {
  if (riskLevel === "critical") return "urgent_review";
  if (riskLevel === "high") return "pending_review";
  if (riskLevel === "medium") return "mask";
  return "allow";
}

function getLegacyRiskScoreFromProfile(profile = {}) {
  const legalRisk = clampNumber(Number(profile.legalRisk || 0), 0, 3);
  const communityRisk = clampNumber(Number(profile.communityRisk || 0), 0, 3);
  const spreadRisk = clampNumber(Number(profile.spreadRisk || 0), 0, 3);
  const credibility = clampNumber(Number(profile.credibility ?? 0.8), 0, 1);
  const coordinationRisk = clampNumber(Number(profile.coordinationRisk || 0), 0, 3);
  const velocityRisk = clampNumber(Number(profile.velocityRisk || 0), 0, 3);

  return Math.round(Math.max(
    legalRisk * 28,
    communityRisk * 20,
    spreadRisk * 24,
    coordinationRisk * 20,
    velocityRisk * 16,
    legalRisk >= 2 ? (1 - credibility) * 70 : (1 - credibility) * 30,
  ));
}

function getRiskLevelFromProfile(profile = {}, fallbackScore = 0) {
  const legalRisk = clampNumber(Number(profile.legalRisk || 0), 0, 3);
  const communityRisk = clampNumber(Number(profile.communityRisk || 0), 0, 3);
  const spreadRisk = clampNumber(Number(profile.spreadRisk || 0), 0, 3);
  const score = Math.max(getLegacyRiskScoreFromProfile(profile), fallbackScore);

  if (legalRisk >= 3 && (spreadRisk >= 2 || score >= 90)) return "critical";
  if (legalRisk >= 3 || score >= 70) return "high";
  if (legalRisk >= 2 || communityRisk >= 2 || spreadRisk >= 2 || score >= 35) return "medium";
  return "low";
}

function getRecommendedActionFromProfile(profile = {}, riskLevel = "low") {
  const legalRisk = clampNumber(Number(profile.legalRisk || 0), 0, 3);
  const communityRisk = clampNumber(Number(profile.communityRisk || 0), 0, 3);
  const spreadRisk = clampNumber(Number(profile.spreadRisk || 0), 0, 3);
  const credibility = clampNumber(Number(profile.credibility ?? 0.8), 0, 1);
  const aiConfidence = clampNumber(Number(profile.aiConfidence ?? 0.7), 0, 1);

  if (legalRisk >= 3) return riskLevel === "critical" ? "urgent_review" : "pending_review";
  if (legalRisk >= 2 && (credibility < 0.55 || aiConfidence < 0.55)) return "pending_review";
  if (legalRisk >= 2 || communityRisk >= 2 || spreadRisk >= 2) return "mask";
  return getRecommendedAction(riskLevel);
}

function inferCredibility(content, categories = []) {
  const text = String(content || "");
  const rumorLike = /(聽說|有人說|朋友說|據說|爆料|匿名|不確定|好像|疑似|傳聞|我聽到|我朋友)/i.test(text);
  const sourceLike = /(截圖|照片|影片|公告|判決|新聞|公文|連結|現場看到|本人|親身)/i.test(text);
  if (categories.includes("unverified_accusation")) return sourceLike ? 0.55 : 0.35;
  if (rumorLike && !sourceLike) return 0.45;
  if (sourceLike) return 0.82;
  return 0.68;
}

function normalizeRiskProfile(rawProfile = {}, context = {}) {
  const content = String(context.content || "");
  const deterministicSignals = getDeterministicRiskSignals(content);
  const categories = [
    ...new Set([
      ...sanitizeArray(context.categories || []),
      ...deterministicSignals.categories,
    ]),
  ].slice(0, 8);
  const fallbackRiskLevel = context.riskLevel || "low";
  const fallbackScore = Math.max(
    clampNumber(Number(context.riskScore || 0), 0, 100),
    clampNumber(Number(deterministicSignals.scoreFloor || 0), 0, 100),
  );
  const hasHighLegalCategory = categories.some((category) => [
    "personal_data",
    "privacy",
    "threat",
    "sexual_image",
    "scam",
  ].includes(category));
  const hasLegalDisputeCategory = categories.some((category) => [
    "unverified_accusation",
    "defamation",
    "harassment",
  ].includes(category));
  const hasCommunityCategory = categories.some((category) => [
    "politics",
    "public_issue",
    "insult",
    "spam",
  ].includes(category));

  const inferredLegalRisk = hasHighLegalCategory ? 3
    : hasLegalDisputeCategory || fallbackRiskLevel === "high" ? 2
      : fallbackRiskLevel === "medium" ? 1
        : 0;
  const inferredCommunityRisk = fallbackRiskLevel === "critical" ? 3
    : hasCommunityCategory || fallbackRiskLevel === "medium" ? 1
      : 0;
  const inferredCredibility = inferCredibility(content, categories);

  const regexTierFloor = getRegexRiskTierFloor(deterministicSignals);
  const legalRisk = Math.max(
    regexTierFloor.legalRisk,
    Math.round(clampNumber(rawProfile.legalRisk ?? rawProfile.legal ?? inferredLegalRisk, 0, 3)),
  );
  const communityRisk = Math.max(
    regexTierFloor.communityRisk,
    Math.round(clampNumber(rawProfile.communityRisk ?? rawProfile.community ?? inferredCommunityRisk, 0, 3)),
  );
  const credibility = clampNumber(rawProfile.credibility ?? inferredCredibility, 0, 1);
  const spreadRisk = Math.max(
    regexTierFloor.spreadRisk,
    Math.round(clampNumber(
      rawProfile.spreadRisk ?? rawProfile.spread ?? Math.max(
        communityRisk >= 2 ? 2 : communityRisk,
        legalRisk >= 3 ? 3 : legalRisk >= 2 && credibility < 0.55 ? 2 : 0,
        fallbackScore >= 70 ? 2 : fallbackScore >= 35 ? 1 : 0,
      ),
      0,
      3,
    )),
  );
  const aiConfidence = clampNumber(rawProfile.aiConfidence ?? rawProfile.confidence ?? 0.68, 0, 1);
  const coordinationRisk = Math.round(clampNumber(rawProfile.coordinationRisk ?? 0, 0, 3));
  const velocityRisk = Math.round(clampNumber(rawProfile.velocityRisk ?? 0, 0, 3));

  return {
    schemaVersion: "risk-profile-v1",
    legalRisk,
    communityRisk,
    credibility: Number(credibility.toFixed(2)),
    spreadRisk,
    aiConfidence: Number(aiConfidence.toFixed(2)),
    targetSensitivity: String(rawProfile.targetSensitivity || deterministicSignals.targetSensitivity || "unknown").slice(0, 60),
    evidenceType: String(rawProfile.evidenceType || (credibility < 0.55 ? "unverified" : "unspecified")).slice(0, 60),
    coordinationRisk,
    velocityRisk,
    labels: sanitizeArray(rawProfile.labels || rawProfile.tags || categories).slice(0, 8),
    recommendation: String(rawProfile.recommendation || "").slice(0, 80),
    humanReviewReason: String(rawProfile.humanReviewReason || "").slice(0, 240),
  };
}

function getAiGovernanceMode(payload, analysis) {
  const riskLevel = analysis?.riskLevel || "low";
  const elevated = ["medium", "high", "critical"].includes(riskLevel);

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

  addPolicyRef(refs, "服務條款第2條", "內容責任與平台治理");

  if (categories.has("personal_data") || categories.has("privacy")) {
    addPolicyRef(refs, "隱私權政策第3條", "禁止公開他人個資與非公開識別資訊");
  }

  if (categories.has("threat") || categories.has("harassment")) {
    addPolicyRef(refs, "社群規範第4條", "禁止威脅、騷擾、肉搜與煽動圍剿");
  }

  if (categories.has("unverified_accusation") || categories.has("defamation") || categories.has("insult")) {
    addPolicyRef(refs, "社群規範第4條", "禁止未證實重大指控與高風險名譽侵害");
  }

  if (categories.has("spam") || payload.moderationRemovalReason === "daily_comment_limit_exceeded") {
    addPolicyRef(refs, "社群規範第4條", "禁止洗版、複製垃圾文與惡意干擾");
  }

  if (categories.has("sexual_image") || categories.has("scam")) {
    addPolicyRef(refs, "社群規範第4條", "禁止私密影像、詐騙與重大安全風險內容");
  }

  if (["high", "critical"].includes(riskLevel)) {
    addPolicyRef(refs, "檢舉與審核說明第5條", "平台可審核、隔離、移除並保留必要治理紀錄");
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

function fallbackPatrolAnalysis(content, payload = {}) {
  const signals = payload.deterministicSignals || getDeterministicRiskSignals(content, payload);
  const semanticPriority = payload.semanticPriority || getSemanticPatrolPriority(content);
  const storedSignals = getStoredDeterministicSignals(signals);
  const actionFloor = getRegexActionFloorScore(signals);
  const semanticFloor = Number(semanticPriority.score || 0) >= 90 ? Number(semanticPriority.score || 0) : 0;
  const categories = [
    ...new Set([
      ...sanitizeArray(signals.categories),
      ...sanitizeArray(semanticPriority.categories),
    ]),
  ].slice(0, 8);
  const score = Math.max(actionFloor || 18, semanticFloor);
  const baseRiskLevel = normalizeRiskLevel("", score);
  const profileFloor = semanticFloor
    ? {
      legalRisk: 3,
      communityRisk: 2,
      spreadRisk: 3,
      aiConfidence: 0.42,
      labels: categories,
      humanReviewReason: "High-risk safety signal requires station-master review.",
    }
    : {};
  const riskProfile = normalizeRiskProfile(profileFloor, {
    content,
    categories,
    riskLevel: baseRiskLevel,
    riskScore: score,
  });
  const riskScore = Math.max(score, getLegacyRiskScoreFromProfile(riskProfile));
  const riskLevel = getRiskLevelFromProfile(riskProfile, riskScore);
  const hasSemanticFallback = semanticFloor >= 90;

  return {
    riskLevel,
    riskScore,
    riskProfile,
    categories,
    summary: hasSemanticFallback
      ? "內容包含需要站長確認的高風險訊號，已先轉入審核。"
      : actionFloor
      ? "內容包含需要站務注意的格式或濫用風險，已保守處理。"
      : "目前未偵測到明確違規訊號，內容維持觀察。",
    legalRisk: hasSemanticFallback
      ? "內容可能涉及安全或法律風險，需由站長確認後再決定是否公開。"
      : actionFloor
      ? (signals.legalRisk || "內容可能涉及格式、濫用或個資風險，需視脈絡確認。")
      : "目前沒有明確法律風險訊號。",
    publicInterest: "unknown",
    recommendedAction: hasSemanticFallback
      ? "pending_review"
      : actionFloor
      ? (signals.recommendedAction || getRecommendedActionFromProfile(riskProfile, riskLevel))
      : "allow",
    rationale: hasSemanticFallback
      ? "Conservative review hold because a high-risk safety signal was detected."
      : "Conservative fallback review completed without high-risk signal.",
    deterministicSignals: storedSignals,
    regexSignals: storedSignals.signals,
    regexScoreFloor: storedSignals.scoreFloor,
    regexRecommendedAction: storedSignals.recommendedAction,
    analysisSource: hasSemanticFallback ? "semantic_fallback" : actionFloor ? "regex_fallback" : "fallback",
    analysisVersion: AI_REGEX_MERGE_VERSION,
    regexVersion: REGEX_GOVERNANCE_VERSION,
    aiModel: "",
  };
}

function normalizePatrolAnalysis(rawAnalysis, content, payload = {}) {
  const fallback = fallbackPatrolAnalysis(content, payload);
  const signals = payload.deterministicSignals || getDeterministicRiskSignals(content, payload);
  const semanticPriority = payload.semanticPriority || getSemanticPatrolPriority(content);
  const storedSignals = getStoredDeterministicSignals(signals);
  const regexActionFloor = getRegexActionFloorScore(signals);
  const semanticFloor = Number(semanticPriority.score || 0) >= 90 ? Number(semanticPriority.score || 0) : 0;
  const baseRiskScore = Math.max(
    clampNumber(rawAnalysis?.riskScore ?? rawAnalysis?.score ?? fallback.riskScore, 0, 100),
    regexActionFloor,
    semanticFloor,
  );
  const categories = [
    ...new Set([
      ...sanitizeArray(rawAnalysis?.categories || rawAnalysis?.labels || fallback.categories),
      ...signals.categories,
      ...sanitizeArray(semanticPriority.categories),
    ]),
  ].slice(0, 8);
  const initialRiskLevel = normalizeRiskLevel(rawAnalysis?.riskLevel, baseRiskScore);
  const rawRiskProfile = { ...(rawAnalysis?.riskProfile || {}) };
  if (semanticFloor) {
    rawRiskProfile.legalRisk = Math.max(Number(rawRiskProfile.legalRisk || 0), 3);
    rawRiskProfile.communityRisk = Math.max(Number(rawRiskProfile.communityRisk || 0), 2);
    rawRiskProfile.spreadRisk = Math.max(Number(rawRiskProfile.spreadRisk || 0), 3);
    rawRiskProfile.aiConfidence = Math.max(Number(rawRiskProfile.aiConfidence || 0), 0.72);
    rawRiskProfile.labels = [
      ...new Set([
        ...sanitizeArray(rawRiskProfile.labels || rawRiskProfile.tags || []),
        ...sanitizeArray(semanticPriority.categories),
      ]),
    ].slice(0, 8);
    rawRiskProfile.humanReviewReason = rawRiskProfile.humanReviewReason ||
      "High-risk safety signal requires station-master review.";
  }
  const riskProfile = normalizeRiskProfile(rawRiskProfile, {
    content,
    categories,
    riskLevel: initialRiskLevel,
    riskScore: baseRiskScore,
  });
  const riskScore = Math.max(baseRiskScore, getLegacyRiskScoreFromProfile(riskProfile));
  const riskLevel = getRiskLevelFromProfile(riskProfile, riskScore);
  const recommendedAction = String(
    (regexActionFloor ? signals.recommendedAction : "") ||
    (semanticFloor ? "pending_review" : "") ||
    rawAnalysis?.recommendedAction ||
    riskProfile.recommendation ||
    getRecommendedActionFromProfile(riskProfile, riskLevel)
  ).slice(0, 80);
  const semanticSummary = semanticFloor
    ? "內容包含需要站長確認的高風險訊號，已先轉入審核。"
    : "";

  return {
    riskLevel,
    riskScore,
    riskProfile,
    categories,
    summary: String(semanticSummary || rawAnalysis?.summary || fallback.summary).slice(0, 500),
    legalRisk: String(semanticFloor
      ? "內容可能涉及安全或法律風險，需由站長確認後再決定是否公開。"
      : rawAnalysis?.legalRisk || fallback.legalRisk).slice(0, 500),
    publicInterest: String(rawAnalysis?.publicInterest || fallback.publicInterest).slice(0, 80),
    recommendedAction,
    rationale: String(rawAnalysis?.rationale || fallback.rationale).slice(0, 700),
    deterministicSignals: storedSignals,
    regexSignals: storedSignals.signals,
    regexScoreFloor: storedSignals.scoreFloor,
    regexRecommendedAction: storedSignals.recommendedAction,
    analysisSource: semanticFloor ? "ai_semantic_priority" : storedSignals.scoreFloor ? "ai_regex_merged" : "ai_regex_checked",
    analysisVersion: AI_REGEX_MERGE_VERSION,
    regexVersion: REGEX_GOVERNANCE_VERSION,
    aiModel: GEMINI_MODEL,
  };
}

function buildPatrolPrompt(payload = {}) {
  const { sourceType, content, category } = payload;
  const deterministicSignals = getStoredDeterministicSignals(
    payload.deterministicSignals || getDeterministicRiskSignals(content, payload),
  );
  const semanticPriority = payload.semanticPriority || getSemanticPatrolPriority(content);
  const regexSignalBrief = deterministicSignals.signals.map((signal) =>
    `${signal.category}:${signal.label}:${signal.match || "hit"}:${signal.severity}`,
  ).join(" | ") || "none";
  const semanticPriorityBrief = (semanticPriority.hits || []).map((hit) =>
    `${hit.label}:${hit.match || "hit"}:${hit.score}`,
  ).join(" | ") || "none";

  return `
You are AI Rangers for Matsu Station, a Taiwan local community forum.
Your job is not pre-publication censorship. Your job is post-publication legal/safety risk triage for a human station master.
Protect lawful speech under Taiwan's democratic free-expression norms while reducing risks to users and the platform.

Analyze this ${sourceType} in Traditional Chinese context.
Return JSON only. No markdown.

Matsu Station governance model:
- Users can publish first; AI patrol analyzes after creation.
- low: display normally, keep a patrol log.
- medium: keep content available but masked behind a reader warning; reduce amplification and send to station-master queue.
- high: set pending_review and do not publicly show the original text until the station master decides.
- critical: urgent station-master review; do not publicly show the original text.

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
- critical: personal data exposure, kidnapping/hostage threats, direct threat, targeted harassment, malicious doxxing, sexual/private images, child sexual content, scam or violence instruction

Multi-dimensional risk profile:
- legalRisk LR0-LR3: platform legal exposure. LR3 means personal data, threats, scam, sexual/private image, violence, or similar.
- Treat explicit kidnapping, hostage-taking, abduction, murder, arson, or physical harm statements toward any identifiable person or public official as LR3 and pending_review/urgent_review, even if the wording is short.
- communityRisk CR0-CR3: community volatility, factional conflict, pile-on, harassment, brigading, or moderation workload.
- credibility 0.0-1.0: evidence quality. Lower for hearsay, "someone said", anonymous accusations, or no source.
- spreadRisk SR0-SR3: amplification safety. SR2 means searchable/direct-linkable but not homepage. SR3 means no recommendation or push.
- aiConfidence 0.0-1.0: your confidence. Low confidence should add a humanReviewReason.

Freedom-preserving rules:
- Do not raise risk merely because the content discusses politics, elections, public officials, government agencies, local policy, public works, transport, business service quality, or criticism of public matters.
- Strong opinions, sarcasm, profanity, and local complaints are allowed unless they identify a target and include threats, doxxing, harassment, or concrete unverified illegal/private-life allegations.
- Public-interest criticism and questions should usually be allow, or mask only when the wording creates real dispute risk.
- Pending review should be reserved for clear, concrete risk. If uncertain between medium and high, choose medium and mask for station-master review.
- Governance must be transparent: if recommending mask/pending_review/urgent_review, explain which safety reason applies instead of using vague censorship language.

Lightweight Regex Guardrail:
- Regex version: ${deterministicSignals.version}
- Purpose: spam, blank/low-information content, and explicit data-format hints only
- Format/spam score: ${deterministicSignals.scoreFloor}/100
- Suggested guardrail action: ${deterministicSignals.recommendedAction || "none"}
- Target sensitivity: ${deterministicSignals.targetSensitivity}
- Categories: ${deterministicSignals.categories.join(", ") || "none"}
- Hits: ${regexSignalBrief}
- Regex note: ${deterministicSignals.summary || "none"}
- Regex limitation: ${deterministicSignals.legalRisk || "Regex intentionally does not judge emotion, defamation, politics, sarcasm, harassment, or community controversy."}

How to cooperate with regex:
- Treat regex as a cheap guardrail, not the main moderation judge.
- Regex does not decide emotion, insult, defamation, politics, sarcasm, rumor, harassment, or community risk.
- If regex only found phone/address/plate-like formats, use context: public business contact info can be low risk; private-person exposure or doxxing can be high.
- If regex found hard personal-data formats such as national ID, bank account, credit-card-like numbers, or verification codes, do not downgrade below pending_review unless context clearly shows a harmless test string.
- Spam and low-quality format signals can support masking/downranking, but legal and community meaning is your job.
- Explicit threats, kidnapping, doxxing, sexual/private images, scams, defamation, and coordinated harassment must be judged by AI semantics even if regex found nothing.

AI Patrol Routing Hints:
- These hints only decide what gets sent to you sooner. They are not final moderation decisions.
- Priority score: ${semanticPriority.score || 0}/100
- Categories: ${(semanticPriority.categories || []).join(", ") || "none"}
- Hits: ${semanticPriorityBrief}
- Note: ${semanticPriority.summary || "none"}
- If a short sentence expresses intent to rob, raid, attack, abduct, burn, dox, or distribute private images, evaluate the plain meaning and likely public safety risk. For example, "我要搶星巴克" should not be treated as spam; it is at least a human-review safety concern unless surrounding context clearly means harmless discount/snatching slang.

JSON schema:
{
  "riskLevel": "low|medium|high|critical",
  "riskScore": 0,
  "riskProfile": {
    "legalRisk": 0,
    "communityRisk": 0,
    "credibility": 0.8,
    "spreadRisk": 0,
    "aiConfidence": 0.7,
    "targetSensitivity": "private_person|public_official|business|school|minor|public_issue|unknown",
    "evidenceType": "first_hand|source_link|screenshot|hearsay|anonymous_tip|unverified|unspecified",
    "coordinationRisk": 0,
    "velocityRisk": 0,
    "labels": ["交通", "地方政治"],
    "recommendation": "allow|mask|pending_review|urgent_review|downrank",
    "humanReviewReason": "short Traditional Chinese reason if human review is useful"
  },
  "categories": ["public_issue", "politics", "personal_data", "personal_data_hint", "threat", "harassment", "unverified_accusation", "insult", "defamation", "privacy", "spam", "sexual_image", "scam"],
  "summary": "short Traditional Chinese summary",
  "legalRisk": "short Traditional Chinese legal risk note",
  "publicInterest": "low|medium|high",
  "recommendedAction": "allow|mask|pending_review|urgent_review",
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
        maxOutputTokens: 850,
      },
    });
    const parsed = JSON.parse(stripJsonFence(response.text));
    return normalizePatrolAnalysis(parsed, content, payload);
  } catch (error) {
    console.error("AI Rangers Gemini analysis failed:", {
      message: error?.message,
      status: error?.status,
    });
    return fallbackPatrolAnalysis(content, payload);
  }
}

const MEDIUM_MASK_COPY = "此內容可能涉及高爭議、攻擊性或未經證實資訊，請自行斟酌是否閱讀。";
const HIGH_REVIEW_COPY = "此內容可能涉及風險資訊或使用政策爭議，已暫時進入站長審核中，原文暫不公開。";
const PUBLIC_HIDDEN_PREVIEW = HIGH_REVIEW_COPY;
const REPORT_AUTO_MASK_THRESHOLD = 3;
const RECOMMENDATION_VERSION = "multi-risk-safety-weight-v3-2026-05-21";
const MORNING_REPORT_VERSION = "governance-pulse-v3";
const SAFE_MODE_REPORT_THRESHOLD = 8;
const LOCKDOWN_REPORT_THRESHOLD = 20;
const FINAL_MODERATION_CASE_STATUSES = new Set(["approved", "released", "hidden", "removed", "deleted", "dismissed", "reviewed"]);
const ACTIVE_MODERATION_CASE_STATUSES = new Set(["pending", "pending_review", "masked", "quarantined"]);

function isModerationCaseResolved(caseData = {}) {
  const status = String(caseData.status || "");
  if (FINAL_MODERATION_CASE_STATUSES.has(status)) return true;
  return Boolean(caseData.adminDecision || caseData.decidedAt || caseData.reviewedAt);
}

function isModerationCaseActive(caseData = {}) {
  if (isModerationCaseResolved(caseData)) return false;
  return ACTIVE_MODERATION_CASE_STATUSES.has(String(caseData.status || "pending"));
}

function isClosedSourceStatus(status = "") {
  return ["approved", "released", "hidden", "removed", "deleted"].includes(String(status || ""));
}

function getPublicModerationNoticeForStatus(status = "") {
  if (status === "masked") return MEDIUM_MASK_COPY;
  if (status === "pending_review" || status === "quarantined") return HIGH_REVIEW_COPY;
  if (status === "hidden" || status === "removed" || status === "deleted") return "此內容因違反社群規範，已被站方處理。";
  return "";
}

const PUBLIC_ONLY_MODERATION_TEXTS = [
  MEDIUM_MASK_COPY,
  HIGH_REVIEW_COPY,
  "此內容因可能違反社群規範，已由站方暫時隱藏，待確認後再處理。",
  "此內容因違反社群規範，已被站方處理。",
];

function isPublicOnlyModerationText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  return PUBLIC_ONLY_MODERATION_TEXTS.some((notice) =>
    text === notice || text.startsWith(String(notice).slice(0, 14))
  );
}

function pickAdminContentText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !isPublicOnlyModerationText(text)) return text;
  }
  return "";
}

function getSourceAdminContent(sourceData = {}) {
  return pickAdminContentText(
    sourceData.content,
    sourceData.contentSnapshot,
    sourceData.adminContentSnapshot,
    sourceData.contentPreview,
    sourceData.quarantinedContentPreview,
    sourceData.moderationSummary,
    sourceData.aiSummary,
  );
}

function getCaseAdminContent(caseData = {}) {
  return pickAdminContentText(
    caseData.contentSnapshot,
    caseData.contentPreview,
    caseData.originalContent,
    caseData.summary,
  );
}

async function loadModerationCaseForSourcePath(sourcePath) {
  if (!sourcePath) return null;
  const caseSnap = await db.collection("moderationCases").doc(getSourceKey(sourcePath)).get();
  return caseSnap.exists ? { id: caseSnap.id, ...caseSnap.data() } : null;
}

async function enrichPatrolPayloadWithModerationCase(payload = {}) {
  if (!payload?.sourcePath) return payload;
  const caseData = await loadModerationCaseForSourcePath(payload.sourcePath);
  if (!caseData) return payload;

  const caseContent = getCaseAdminContent(caseData);
  const sourceData = payload.sourceData || {};
  return {
    ...payload,
    content: caseContent || getSourceAdminContent(sourceData) || payload.content,
    authorId: payload.authorId || caseData.authorId,
    authorName: payload.authorName || caseData.authorName,
    category: payload.category || caseData.category,
    imageUrls: Array.isArray(payload.imageUrls) && payload.imageUrls.length
      ? payload.imageUrls
      : Array.isArray(caseData.imageUrlsSnapshot) ? caseData.imageUrlsSnapshot : payload.imageUrls,
    imagePaths: Array.isArray(payload.imagePaths) && payload.imagePaths.length
      ? payload.imagePaths
      : Array.isArray(caseData.imagePathsSnapshot) ? caseData.imagePathsSnapshot : payload.imagePaths,
    reportsCount: Math.max(Number(payload.reportsCount || 0), Number(caseData.reportsCount || 0)),
    adminCaseData: caseData,
    sourceData: {
      ...sourceData,
      moderationStatus: caseData.status || sourceData.moderationStatus,
      moderationRiskScore: caseData.riskScore ?? sourceData.moderationRiskScore,
      moderationRiskLevel: caseData.riskLevel || sourceData.moderationRiskLevel,
      moderationRiskProfile: caseData.riskProfile || sourceData.moderationRiskProfile,
      moderationAnalysisVersion: caseData.analysisVersion || sourceData.moderationAnalysisVersion,
      moderationAnalysisSource: caseData.analysisSource || sourceData.moderationAnalysisSource,
      moderationUpdatedAt: caseData.updatedAt || sourceData.moderationUpdatedAt,
      reportsCount: Math.max(Number(sourceData.reportsCount || 0), Number(caseData.reportsCount || 0)),
    },
  };
}

function getPublicSourceInternalFieldDeletePatch() {
  return {
    moderationSummary: admin.firestore.FieldValue.delete(),
    moderationRecommendedAction: admin.firestore.FieldValue.delete(),
    moderationAnalysisSource: admin.firestore.FieldValue.delete(),
    moderationAnalysisVersion: admin.firestore.FieldValue.delete(),
    moderationRegexVersion: admin.firestore.FieldValue.delete(),
    moderationRegexScoreFloor: admin.firestore.FieldValue.delete(),
    moderationRegexSignals: admin.firestore.FieldValue.delete(),
    moderationCategories: admin.firestore.FieldValue.delete(),
    moderationRiskProfile: admin.firestore.FieldValue.delete(),
  };
}

function buildPublicModerationScrubPatch(data = {}) {
  const status = String(data.moderationStatus || "");
  const publicNotice = getPublicModerationNoticeForStatus(status);
  const patch = {
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationPublicNotice: publicNotice || admin.firestore.FieldValue.delete(),
  };

  if (status === "masked") {
    patch.moderationMaskNotice = MEDIUM_MASK_COPY;
    patch.moderationReviewNotice = admin.firestore.FieldValue.delete();
  } else if (status === "pending_review" || status === "quarantined") {
    patch.moderationReviewNotice = HIGH_REVIEW_COPY;
    patch.moderationMaskNotice = admin.firestore.FieldValue.delete();
  } else if (status === "hidden" || status === "removed" || status === "deleted") {
    patch.moderationMaskNotice = admin.firestore.FieldValue.delete();
    patch.moderationReviewNotice = admin.firestore.FieldValue.delete();
  } else {
    patch.moderationMaskNotice = admin.firestore.FieldValue.delete();
    patch.moderationReviewNotice = admin.firestore.FieldValue.delete();
  }

  return patch;
}

async function scrubPublicModerationInternalFields({ maxPosts = 160, maxComments = 220, maxReplies = 180 } = {}) {
  const snapshots = await Promise.all([
    db.collection("posts").limit(maxPosts).get(),
    db.collectionGroup("comments").limit(maxComments).get(),
    db.collectionGroup("replies").limit(maxReplies).get(),
  ]);
  const docs = snapshots.flatMap((snapshot) => snapshot.docs);
  let batch = db.batch();
  let operationCount = 0;
  let scrubbedCount = 0;

  for (const docSnap of docs) {
    const data = docSnap.data() || {};
    const hasInternalFields = [
      "moderationSummary",
      "moderationRecommendedAction",
      "moderationAnalysisSource",
      "moderationAnalysisVersion",
      "moderationRegexVersion",
      "moderationRegexScoreFloor",
      "moderationRegexSignals",
      "moderationCategories",
      "moderationRiskProfile",
    ].some((field) => Object.prototype.hasOwnProperty.call(data, field));
    const status = String(data.moderationStatus || "");
    if (!hasInternalFields && !["masked", "pending_review", "quarantined", "hidden", "removed", "deleted"].includes(status)) {
      continue;
    }

    batch.set(docSnap.ref, buildPublicModerationScrubPatch(data), { merge: true });
    operationCount += 1;
    scrubbedCount += 1;
    if (operationCount >= 450) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount) await batch.commit();
  return { scannedCount: docs.length, scrubbedCount };
}

function getReportCategories(reasonCategory = "") {
  const category = String(reasonCategory || "");
  if (category.includes("個資") || category.includes("肉搜")) return ["report", "personal_data"];
  if (category.includes("威脅") || category.includes("暴力")) return ["report", "threat"];
  if (category.includes("誹謗") || category.includes("不實")) return ["report", "defamation", "unverified_accusation"];
  if (category.includes("騷擾") || category.includes("圍剿")) return ["report", "harassment"];
  if (category.includes("詐騙")) return ["report", "scam"];
  if (category.includes("色情") || category.includes("私密")) return ["report", "sexual_image"];
  if (category.includes("垃圾") || category.includes("洗版")) return ["report", "spam"];
  if (category.includes("人身攻擊")) return ["report", "insult"];
  return ["report"];
}

function buildSourcePatchForMasked(publicCaseId, riskLevel, riskScore) {
  return {
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationStatus: "masked",
    moderationPublicCaseId: publicCaseId,
    moderationPublicNotice: MEDIUM_MASK_COPY,
    moderationMaskNotice: MEDIUM_MASK_COPY,
    moderationReviewNotice: admin.firestore.FieldValue.delete(),
    quarantinedContentPreview: admin.firestore.FieldValue.delete(),
    moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildSourcePatchForPendingReview(sourceType, sourceData, publicCaseId, riskLevel, riskScore) {
  const basePatch = {
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationStatus: "pending_review",
    moderationPublicCaseId: publicCaseId,
    moderationPublicNotice: HIGH_REVIEW_COPY,
    moderationReviewNotice: HIGH_REVIEW_COPY,
    moderationMaskNotice: admin.firestore.FieldValue.delete(),
    moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (sourceType === "post") {
    return {
      ...basePatch,
      content: "",
      imageUrl: "",
      imagePath: "",
      imageUrls: [],
      imagePaths: [],
      quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
    };
  }

  return {
    ...basePatch,
    content: "",
    quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
  };
}

async function writePatrolArtifacts(payload, analysis) {
  const sourceKey = getSourceKey(payload.sourcePath);
  const publicCaseId = getPublicCaseId(payload.sourcePath);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const aiGovernanceMode = getAiGovernanceMode(payload, analysis);
  const shouldCreateCase = ["medium", "high", "critical"].includes(analysis.riskLevel);
  const shouldMask = analysis.riskLevel === "medium";
  const shouldPendingReview = ["high", "critical"].includes(analysis.riskLevel);
  const contentStatus = shouldPendingReview ? "pending_review" : shouldMask ? "masked" : "normal";
  const policyRefs = getPolicyRefsForAnalysis(payload, analysis);
  const publicModerationNotice = getPublicModerationNoticeForStatus(contentStatus);
  const sourceGovernancePatch = {
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationStatus: contentStatus,
    moderationRiskLevel: analysis.riskLevel,
    moderationRiskScore: analysis.riskScore,
    moderationPublicNotice: publicModerationNotice || admin.firestore.FieldValue.delete(),
    ...(shouldMask ? { moderationMaskNotice: MEDIUM_MASK_COPY, moderationReviewNotice: admin.firestore.FieldValue.delete() } : {}),
    ...(shouldPendingReview ? { moderationReviewNotice: HIGH_REVIEW_COPY, moderationMaskNotice: admin.firestore.FieldValue.delete() } : {}),
    ...(!shouldMask && !shouldPendingReview ? {
      moderationPublicNotice: admin.firestore.FieldValue.delete(),
      moderationMaskNotice: admin.firestore.FieldValue.delete(),
      moderationReviewNotice: admin.firestore.FieldValue.delete(),
    } : {}),
    moderationUpdatedAt: now,
  };
  const sourceRestorationPatch = {};
  if (payload.restoreSnapshotOnPublic && !shouldPendingReview && payload.content) {
    sourceRestorationPatch.content = String(payload.content || "").slice(0, 4000);
    sourceRestorationPatch.quarantinedContentPreview = admin.firestore.FieldValue.delete();
    sourceRestorationPatch.moderationReviewNotice = admin.firestore.FieldValue.delete();
    if (payload.sourceType === "post" && Array.isArray(payload.imageUrls)) {
      sourceRestorationPatch.imageUrls = payload.imageUrls.slice(0, 8);
      sourceRestorationPatch.imageUrl = sourceRestorationPatch.imageUrls[0] || "";
    }
    if (payload.sourceType === "post" && Array.isArray(payload.imagePaths)) {
      sourceRestorationPatch.imagePaths = payload.imagePaths.slice(0, 8);
      sourceRestorationPatch.imagePath = sourceRestorationPatch.imagePaths[0] || "";
    }
  }

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
    aiGovernanceMode,
    policyVersion: POLICY_VERSION,
    policyRefs,
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    riskProfile: analysis.riskProfile,
    legalRiskTier: analysis.riskProfile.legalRisk,
    communityRiskTier: analysis.riskProfile.communityRisk,
    credibilityScore: analysis.riskProfile.credibility,
    spreadRiskTier: analysis.riskProfile.spreadRisk,
    aiConfidence: analysis.riskProfile.aiConfidence,
    targetSensitivity: analysis.riskProfile.targetSensitivity,
    evidenceType: analysis.riskProfile.evidenceType,
    coordinationRiskTier: analysis.riskProfile.coordinationRisk,
    velocityRiskTier: analysis.riskProfile.velocityRisk,
    categories: analysis.categories,
    summary: analysis.summary,
    legalRisk: analysis.legalRisk,
    publicInterest: analysis.publicInterest,
    recommendedAction: analysis.recommendedAction,
    rationale: analysis.rationale,
    deterministicSignals: analysis.deterministicSignals,
    regexSignals: analysis.regexSignals,
    regexScoreFloor: analysis.regexScoreFloor,
    regexRecommendedAction: analysis.regexRecommendedAction,
    analysisSource: analysis.analysisSource,
    analysisVersion: analysis.analysisVersion,
    regexVersion: analysis.regexVersion,
    aiModel: analysis.aiModel,
    reportsCount: Math.max(0, Number(payload.reportsCount || 0)),
    likesCount: Math.max(0, Number(payload.sourceData?.likesCount || 0)),
    commentsCount: Math.max(0, Number(payload.sourceData?.commentsCount || 0)),
    repliesCount: Math.max(0, Number(payload.sourceData?.repliesCount || 0)),
    imageCount: Array.isArray(payload.imageUrls) ? payload.imageUrls.length : 0,
    imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
    imagePathsSnapshot: Array.isArray(payload.imagePaths) ? payload.imagePaths.slice(0, 8) : [],
    publicCaseId,
  };

  await db.collection("aiPatrolLogs").doc(sourceKey).set({
    ...baseRecord,
    createdAt: now,
    updatedAt: now,
    caseCreated: shouldCreateCase,
  }, { merge: true });

  const caseRef = db.collection("moderationCases").doc(sourceKey);

  if (!shouldCreateCase) {
    await db.doc(payload.sourcePath).set({
      ...sourceGovernancePatch,
      ...sourceRestorationPatch,
    }, { merge: true });
    if (payload.patrolQueuePrecheckCase) {
      await caseRef.set({
        ...baseRecord,
        contentSnapshot: String(payload.content || "").slice(0, 4000),
        imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
        imagePathsSnapshot: Array.isArray(payload.imagePaths) ? payload.imagePaths.slice(0, 8) : [],
        status: "approved",
        adminDecision: "ai_cleared_precheck",
        adminNote: "Gemini completed queue patrol and cleared the precheck hold.",
        decidedAt: now,
        reviewedAt: now,
        lastAction: "ai_auto_restored",
        updatedAt: now,
        sourceCreatedAt: payload.createdAt || null,
      }, { merge: true });
    }
    return;
  }

  const existingCase = await caseRef.get();
  if (!existingCase.exists) {
    await caseRef.set({
      ...baseRecord,
      contentSnapshot: String(payload.content || "").slice(0, 4000),
      imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
      imagePathsSnapshot: Array.isArray(payload.imagePaths) ? payload.imagePaths.slice(0, 8) : [],
      status: contentStatus,
      adminDecision: null,
      adminNote: "",
      decidedAt: null,
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

  if (shouldPendingReview) {
    await db.doc(payload.sourcePath).set(
      {
        ...sourceGovernancePatch,
        ...buildSourcePatchForPendingReview(payload.sourceType, payload.sourceData, publicCaseId, analysis.riskLevel, analysis.riskScore),
      },
      { merge: true }
    );

    await db.collection("rangerNotifications").add({
      recipientId: STATION_MASTER_UID,
      senderId: "ai-rangers",
      senderName: "小站巡邏系統",
      type: "report",
      title: "小站巡邏系統送出高風險內容裁決",
      content: `案件 ${publicCaseId} 已進入站長裁決，原文暫不公開。`,
      read: false,
      createdAt: now,
      moderationCaseId: sourceKey,
    });
  } else if (shouldMask) {
    await db.doc(payload.sourcePath).set(
      {
        ...sourceGovernancePatch,
        ...sourceRestorationPatch,
        ...buildSourcePatchForMasked(publicCaseId, analysis.riskLevel, analysis.riskScore),
      },
      { merge: true }
    );
  } else {
    await db.doc(payload.sourcePath).set(sourceGovernancePatch, { merge: true });
  }
}

async function runPatrolForSource(payload) {
  const patrolPayload = await enrichPatrolPayloadWithModerationCase(payload);
  if (!patrolPayload.content || !String(patrolPayload.content).trim()) return;
  if (patrolPayload.authorId === "system") return;

  const deterministicSignals = getDeterministicRiskSignals(patrolPayload.content, patrolPayload);
  const semanticPriority = getSemanticPatrolPriority(patrolPayload.content);
  const enrichedPayload = { ...patrolPayload, deterministicSignals, semanticPriority };
  const analysis = await analyzeWithGeminiForPatrol(enrichedPayload);
  await writePatrolArtifacts(enrichedPayload, analysis);
  return analysis;
}

function buildPatrolPayloadFromSnapshot(docSnap) {
  const data = docSnap.data() || {};
  const sourcePath = docSnap.ref.path;
  const sourceMeta = parseManagedSourcePath(sourcePath);
  const content = getSourceAdminContent(data);

  return {
    ...sourceMeta,
    sourcePath,
    authorId: data.authorId,
    authorName: data.authorName,
    category: data.category || data.aiTag,
    content,
    preModerationRisk: data.aiRisk || 0,
    preModerationAction: data.aiAction || "",
    imageUrls: data.imageUrls,
    reportsCount: data.reportsCount || 0,
    createdAt: data.createdAt || null,
    sourceData: data,
  };
}

function scoreAiPatrolCandidate(payload) {
  const data = payload.sourceData || {};
  const deterministicSignals = getDeterministicRiskSignals(payload.content, payload);
  const semanticPriority = getSemanticPatrolPriority(payload.content);
  const status = String(data.moderationStatus || "normal");
  const hasCurrentAnalysis = data.moderationAnalysisVersion === AI_REGEX_MERGE_VERSION;
  const analysisSource = String(data.moderationAnalysisSource || data.analysisSource || "");
  const storedRisk = getStoredModerationRisk(data);
  const isWeakOrFallbackAnalysis = ["fallback", "regex_fallback", "semantic_fallback", "queue_precheck"].includes(analysisSource) ||
    (Number(semanticPriority.score || 0) >= 90 && storedRisk < Number(semanticPriority.score || 0) - 25);
  const analysisAgeMs = Date.now() - toJsMillis(data.moderationUpdatedAt || data.updatedAt || data.createdAt);
  let score = Number(deterministicSignals.scoreFloor || 0);
  score += Number(semanticPriority.score || 0);
  score += Math.min(45, Number(data.reportsCount || 0) * 15);
  score += Math.min(35, storedRisk * 0.35);
  if (["pending_review", "masked"].includes(status)) score += 18;
  if (["hidden", "deleted", "removed"].includes(status)) score -= 40;
  if (!data.moderationAnalysisVersion) score += 12;
  if (hasCurrentAnalysis && !isWeakOrFallbackAnalysis) {
    score -= analysisAgeMs < 24 * 60 * 60 * 1000 ? 70 : 24;
    if (status === "normal") score -= 20;
    if (["pending_review", "masked"].includes(status)) score -= 34;
  } else if (hasCurrentAnalysis && isWeakOrFallbackAnalysis) {
    score += Number(semanticPriority.score || 0) >= 90 ? 70 : 18;
  }
  return score;
}

function getAiPatrolQueuePriority(payload, deterministicSignals, semanticPriority, priorityBoost = 0) {
  const basePayload = {
    ...payload,
    deterministicSignals,
    semanticPriority,
  };
  const data = payload.sourceData || {};
  const status = String(data.moderationStatus || "normal");
  let score = scoreAiPatrolCandidate(basePayload);
  score += clampNumber(Number(priorityBoost || 0), -60, 90);
  score = Math.max(
    score,
    Number(deterministicSignals?.scoreFloor || 0),
    Number(semanticPriority?.score || 0),
    Math.min(60, Number(data.reportsCount || 0) * 15),
  );
  if (status === "pending_review") score += 30;
  if (status === "masked") score += 18;
  if (status === "hidden" || status === "deleted" || status === "removed") score -= 120;
  return Math.round(clampNumber(score, -100, 220));
}

function getAiPatrolQueueReasons(payload, deterministicSignals, semanticPriority, source, reason) {
  const reasons = new Set();
  if (reason) reasons.add(String(reason).slice(0, 80));
  if (source) reasons.add(`source:${String(source).slice(0, 40)}`);
  (deterministicSignals?.categories || []).forEach((category) => reasons.add(`regex:${category}`));
  (semanticPriority?.categories || []).forEach((category) => reasons.add(`semantic:${category}`));
  (semanticPriority?.hits || []).slice(0, 3).forEach((hit) => reasons.add(`hit:${String(hit.id || hit.label || "").slice(0, 60)}`));
  if (Number(payload.reportsCount || payload.sourceData?.reportsCount || 0) > 0) reasons.add("reported");
  const status = String(payload.sourceData?.moderationStatus || "");
  if (status) reasons.add(`status:${status}`);
  return Array.from(reasons).filter(Boolean).slice(0, 10);
}

function shouldApplyQueuePrecheck(payload, deterministicSignals, semanticPriority) {
  const status = String(payload.sourceData?.moderationStatus || "");
  if (["pending_review", "hidden", "deleted", "removed", "quarantined"].includes(status)) return false;
  const regexFloor = Number(deterministicSignals?.scoreFloor || 0);
  const semanticScore = Number(semanticPriority?.score || 0);
  return semanticScore >= AI_PATROL_QUEUE_PRECHECK_THRESHOLD || regexFloor >= 90;
}

function buildQueuePrecheckProfile(payload, deterministicSignals, semanticPriority, riskScore) {
  const categories = [
    ...new Set([
      ...(deterministicSignals?.categories || []),
      ...(semanticPriority?.categories || []),
    ]),
  ].slice(0, 8);
  const profile = normalizeRiskProfile({
    legalRisk: categories.some((category) => ["threat", "violence", "personal_data", "privacy", "sexual_image", "scam"].includes(category)) ? 3 : 2,
    communityRisk: categories.some((category) => ["harassment", "violence", "threat"].includes(category)) ? 2 : 1,
    spreadRisk: 3,
    aiConfidence: 0.48,
    labels: categories,
    humanReviewReason: "Queued patrol precheck found a clear high-risk signal before Gemini review.",
  }, {
    content: payload.content,
    categories,
    riskLevel: "high",
    riskScore,
  });
  return { profile, categories };
}

async function applyQueuePrecheckReview(payload, context) {
  const deterministicSignals = context.deterministicSignals || getDeterministicRiskSignals(payload.content, payload);
  const semanticPriority = context.semanticPriority || getSemanticPatrolPriority(payload.content);
  if (!shouldApplyQueuePrecheck(payload, deterministicSignals, semanticPriority)) return false;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const sourceKey = getSourceKey(payload.sourcePath);
  const publicCaseId = getPublicCaseId(payload.sourcePath);
  const sourceRef = db.doc(payload.sourcePath);
  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const contentSnapshot = String(payload.content || "").slice(0, 4000);
  const imageUrlsSnapshot = Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [];
  const imagePathsSnapshot = Array.isArray(payload.imagePaths) ? payload.imagePaths.slice(0, 8) : [];
  const riskScore = clampNumber(Math.max(
    Number(context.priorityScore || 0),
    Number(deterministicSignals.scoreFloor || 0),
    Number(semanticPriority.score || 0),
    70,
  ), 0, 100);
  const { profile: riskProfile, categories } = buildQueuePrecheckProfile(payload, deterministicSignals, semanticPriority, riskScore);
  const summary = semanticPriority.summary ||
    deterministicSignals.summary ||
    "AI 巡邏前置防護偵測到明確高風險訊號，已先轉入站長審核，等待 Gemini 完整判斷。";
  const baseRecord = {
    sourceType: payload.sourceType,
    sourcePath: payload.sourcePath,
    postId: payload.postId || null,
    commentId: payload.commentId || null,
    replyId: payload.replyId || null,
    authorId: payload.authorId || null,
    authorName: payload.authorName || null,
    category: payload.category || null,
    contentPreview: compactPreview(contentSnapshot),
    contentSnapshot,
    imageUrlsSnapshot,
    imagePathsSnapshot,
    aiGovernanceMode: "queue_precheck",
    policyVersion: POLICY_VERSION,
    publicCaseId,
    riskLevel: getRiskLevelFromProfile(riskProfile, riskScore),
    riskScore,
    riskProfile,
    legalRiskTier: riskProfile.legalRisk,
    communityRiskTier: riskProfile.communityRisk,
    credibilityScore: riskProfile.credibility,
    spreadRiskTier: riskProfile.spreadRisk,
    aiConfidence: riskProfile.aiConfidence,
    targetSensitivity: riskProfile.targetSensitivity,
    evidenceType: riskProfile.evidenceType,
    coordinationRiskTier: riskProfile.coordinationRisk,
    velocityRiskTier: riskProfile.velocityRisk,
    categories,
    summary,
    legalRisk: "前置防護只做暫時遮蔽，完整法律/站規判斷等待 Gemini 巡邏完成。",
    publicInterest: "unknown",
    recommendedAction: "pending_review",
    rationale: "Queued patrol precheck before AI semantic review.",
    deterministicSignals: getStoredDeterministicSignals(deterministicSignals),
    regexSignals: getStoredDeterministicSignals(deterministicSignals).signals,
    regexScoreFloor: getStoredDeterministicSignals(deterministicSignals).scoreFloor,
    regexRecommendedAction: getStoredDeterministicSignals(deterministicSignals).recommendedAction,
    analysisSource: "queue_precheck",
    analysisVersion: QUEUE_PRECHECK_ANALYSIS_VERSION,
    regexVersion: REGEX_GOVERNANCE_VERSION,
    aiModel: "",
    reportsCount: Math.max(0, Number(payload.reportsCount || payload.sourceData?.reportsCount || 0)),
    likesCount: Math.max(0, Number(payload.sourceData?.likesCount || 0)),
    commentsCount: Math.max(0, Number(payload.sourceData?.commentsCount || 0)),
    repliesCount: Math.max(0, Number(payload.sourceData?.repliesCount || 0)),
    imageCount: imageUrlsSnapshot.length,
    status: "pending_review",
    adminDecision: null,
    adminNote: "",
    decidedAt: null,
    sourceCreatedAt: payload.createdAt || null,
    updatedAt: now,
  };

  await caseRef.set({
    ...baseRecord,
    createdAt: payload.createdAt || now,
  }, { merge: true });

  await sourceRef.set({
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationStatus: "pending_review",
    moderationPublicCaseId: publicCaseId,
    moderationRiskLevel: baseRecord.riskLevel,
    moderationRiskScore: riskScore,
    moderationPublicNotice: HIGH_REVIEW_COPY,
    moderationReviewNotice: HIGH_REVIEW_COPY,
    moderationMaskNotice: admin.firestore.FieldValue.delete(),
    content: "",
    quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
    ...(payload.sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
    moderationUpdatedAt: now,
  }, { merge: true });

  return true;
}

async function enqueueAiPatrolSource(payload, options = {}) {
  if (!payload?.sourcePath || !payload?.sourceType) return { queued: false, reason: "missing_source" };
  payload = await enrichPatrolPayloadWithModerationCase(payload);
  if (!payload.content || !String(payload.content).trim()) return { queued: false, reason: "empty_content" };
  if (payload.authorId === "system") return { queued: false, reason: "system_content" };

  const deterministicSignals = getDeterministicRiskSignals(payload.content, payload);
  const semanticPriority = getSemanticPatrolPriority(payload.content);
  const priorityScore = getAiPatrolQueuePriority(payload, deterministicSignals, semanticPriority, options.priorityBoost);
  const sourceKey = getSourceKey(payload.sourcePath);
  const jobRef = db.collection(AI_PATROL_QUEUE_COLLECTION).doc(sourceKey);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const source = String(options.source || "manual").slice(0, 40);
  const reason = String(options.reason || "").slice(0, 100);
  const queueReasons = getAiPatrolQueueReasons(payload, deterministicSignals, semanticPriority, source, reason);
  const contentSnapshot = String(payload.content || "").slice(0, 4000);
  let outcome = "queued";

  await db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(jobRef);
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};
    const existingStatus = String(existing.status || "");
    const existingAttempts = Math.max(0, Number(existing.attempts || 0));

    if (existingStatus === "processing" && !options.force) {
      outcome = "processing";
      return;
    }

    if (existingStatus === "done" && existing.analysisVersion === AI_REGEX_MERGE_VERSION && !options.force && priorityScore < 35) {
      outcome = "fresh";
      return;
    }

    transaction.set(jobRef, {
      queueVersion: AI_PATROL_QUEUE_VERSION,
      analysisVersion: AI_REGEX_MERGE_VERSION,
      regexVersion: REGEX_GOVERNANCE_VERSION,
      sourceKey,
      sourceType: payload.sourceType,
      sourcePath: payload.sourcePath,
      postId: payload.postId || null,
      commentId: payload.commentId || null,
      replyId: payload.replyId || null,
      authorId: payload.authorId || null,
      authorName: payload.authorName || null,
      category: payload.category || null,
      contentPreview: compactPreview(contentSnapshot, 220),
      contentSnapshot,
      imageUrlsSnapshot: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 8) : [],
      deterministicSignals: getStoredDeterministicSignals(deterministicSignals),
      semanticPriority: {
        score: Number(semanticPriority.score || 0),
        categories: semanticPriority.categories || [],
        hits: (semanticPriority.hits || []).slice(0, 6),
        summary: String(semanticPriority.summary || "").slice(0, 240),
      },
      priorityScore,
      priorityReasons: queueReasons,
      reportsCount: Math.max(0, Number(payload.reportsCount || payload.sourceData?.reportsCount || 0)),
      moderationStatus: String(payload.sourceData?.moderationStatus || "normal").slice(0, 40),
      moderationRiskScore: getStoredModerationRisk(payload.sourceData || {}),
      moderationAnalysisVersion: String(payload.sourceData?.moderationAnalysisVersion || "").slice(0, 80),
      sourceCreatedAt: payload.createdAt || null,
      sourceUpdatedAt: payload.sourceData?.moderationUpdatedAt || payload.sourceData?.updatedAt || payload.createdAt || null,
      source,
      reason,
      status: "queued",
      attempts: existingAttempts,
      createdAt: existing.createdAt || now,
      enqueuedAt: now,
      updatedAt: now,
      processedAt: null,
      processingStartedAt: null,
      lastError: admin.firestore.FieldValue.delete(),
    }, { merge: true });
  });

  let precheckApplied = false;
  if (outcome === "queued" && options.applyPrecheck !== false) {
    precheckApplied = await applyQueuePrecheckReview(payload, {
      deterministicSignals,
      semanticPriority,
      priorityScore,
    });
    if (precheckApplied) {
      await jobRef.set({
        precheckApplied: true,
        precheckAppliedAt: now,
        precheckStatus: "pending_review",
        updatedAt: now,
      }, { merge: true });
    }
  }

  return {
    queued: outcome === "queued",
    status: outcome,
    sourcePath: payload.sourcePath,
    sourceKey,
    priorityScore,
    precheckApplied,
  };
}

async function enqueueAiPatrolSourcePath(sourcePath, options = {}) {
  const sourceSnap = await db.doc(sourcePath).get();
  if (!sourceSnap.exists) return { queued: false, reason: "source_missing", sourcePath };
  const payload = buildPatrolPayloadFromSnapshot(sourceSnap);
  return enqueueAiPatrolSource(payload, options);
}

async function releaseStaleAiPatrolJobs(maxAgeMs = 15 * 60 * 1000) {
  const snapshot = await safeQuery(
    () => db.collection(AI_PATROL_QUEUE_COLLECTION).where("status", "==", "processing").limit(30).get(),
    "aiPatrolQueue.processing",
  );
  const nowMs = Date.now();
  const batch = db.batch();
  let released = 0;
  (snapshot.docs || []).forEach((docSnap) => {
    const data = docSnap.data() || {};
    const startedAt = toJsMillis(data.processingStartedAt);
    if (!startedAt || nowMs - startedAt < maxAgeMs) return;
    released += 1;
    batch.set(docSnap.ref, {
      status: "queued",
      processingStartedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: "Processing lock expired; job returned to queue.",
    }, { merge: true });
  });
  if (released > 0) await batch.commit();
  return released;
}

async function runAiPatrolQueueJob(jobDoc, options = {}) {
  const jobRef = jobDoc.ref;
  const now = admin.firestore.FieldValue.serverTimestamp();
  let jobData = jobDoc.data() || {};
  let shouldRun = false;
  let attemptNumber = Math.max(0, Number(jobData.attempts || 0)) + 1;

  await db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(jobRef);
    if (!freshSnap.exists) return;
    const fresh = freshSnap.data() || {};
    const status = String(fresh.status || "");
    if (!["queued", "failed"].includes(status)) return;
    if (Number(fresh.attempts || 0) >= AI_PATROL_QUEUE_MAX_ATTEMPTS && status === "failed") return;
    jobData = fresh;
    attemptNumber = Math.max(0, Number(fresh.attempts || 0)) + 1;
    shouldRun = true;
    transaction.set(jobRef, {
      status: "processing",
      attempts: attemptNumber,
      processingStartedAt: now,
      workerSource: String(options.source || "worker").slice(0, 40),
      updatedAt: now,
    }, { merge: true });
  });

  if (!shouldRun) return { skipped: true };

  try {
    const sourcePath = String(jobData.sourcePath || "");
    const sourceSnap = sourcePath ? await db.doc(sourcePath).get() : null;
    if (!sourceSnap || !sourceSnap.exists) {
      await jobRef.set({
        status: "skipped",
        skippedReason: "source_missing",
        processedAt: now,
        updatedAt: now,
      }, { merge: true });
      return { skipped: true, reason: "source_missing", sourcePath };
    }

    const payloadFromSource = buildPatrolPayloadFromSnapshot(sourceSnap);
    const contentSnapshot = String(jobData.contentSnapshot || "").trim();
    const payload = {
      ...payloadFromSource,
      content: contentSnapshot || payloadFromSource.content,
      imageUrls: Array.isArray(payloadFromSource.imageUrls) && payloadFromSource.imageUrls.length
        ? payloadFromSource.imageUrls
        : Array.isArray(jobData.imageUrlsSnapshot) ? jobData.imageUrlsSnapshot : payloadFromSource.imageUrls,
      reportsCount: Math.max(Number(payloadFromSource.reportsCount || 0), Number(jobData.reportsCount || 0)),
      patrolRunSource: String(options.source || jobData.source || "queue"),
      patrolQueueJobId: jobDoc.id,
      patrolQueuePrecheckCase: Boolean(jobData.precheckApplied),
      restoreSnapshotOnPublic: Boolean(contentSnapshot) && Boolean(jobData.precheckApplied),
    };

    const analysis = await runPatrolForSource(payload);
    if (!analysis) {
      await jobRef.set({
        status: "skipped",
        skippedReason: "empty_or_system_content",
        processedAt: now,
        updatedAt: now,
      }, { merge: true });
      return { skipped: true, reason: "empty_or_system_content", sourcePath };
    }

    await jobRef.set({
      status: "done",
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore,
      recommendedAction: analysis.recommendedAction,
      summary: analysis.summary,
      processedAt: now,
      updatedAt: now,
      processingStartedAt: null,
      analysisVersion: analysis.analysisVersion,
      aiModel: analysis.aiModel || GEMINI_MODEL,
      lastError: admin.firestore.FieldValue.delete(),
    }, { merge: true });

    return {
      ok: true,
      sourcePath,
      sourceType: payload.sourceType,
      publicCaseId: getPublicCaseId(sourcePath),
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore,
      categories: analysis.categories,
      summary: analysis.summary,
      recommendedAction: analysis.recommendedAction,
      preview: compactPreview(payload.content, 180),
      contextItem: createPatrolChatContext(payload, analysis),
    };
  } catch (error) {
    const failedFinal = attemptNumber >= AI_PATROL_QUEUE_MAX_ATTEMPTS;
    await jobRef.set({
      status: failedFinal ? "failed" : "queued",
      lastError: String(error?.message || error).slice(0, 500),
      failedAt: now,
      processingStartedAt: null,
      updatedAt: now,
    }, { merge: true });
    console.error("AI patrol queue job failed:", {
      jobId: jobDoc.id,
      sourcePath: jobData.sourcePath,
      message: error?.message || error,
    });
    return { failed: true, sourcePath: jobData.sourcePath, error: String(error?.message || error) };
  }
}

async function processAiPatrolQueue({ actorId = "system", source = "manual", maxItems = 8, concurrency = 2 } = {}) {
  const runId = `ai-patrol-queue-${Date.now()}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const limitCount = clampNumber(Number(maxItems || 8), 1, 30);
  const workerConcurrency = clampNumber(Number(concurrency || 2), 1, 4);
  const staleReleased = await releaseStaleAiPatrolJobs();
  const [queuedSnapshot, failedSnapshot] = await Promise.all([
    safeQuery(() => db.collection(AI_PATROL_QUEUE_COLLECTION).where("status", "==", "queued").limit(limitCount * 5).get(), "aiPatrolQueue.queued"),
    safeQuery(() => db.collection(AI_PATROL_QUEUE_COLLECTION).where("status", "==", "failed").limit(limitCount * 2).get(), "aiPatrolQueue.failed"),
  ]);
  const docsById = new Map();
  [...(queuedSnapshot.docs || []), ...(failedSnapshot.docs || [])].forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (String(data.status || "") === "failed" && Number(data.attempts || 0) >= AI_PATROL_QUEUE_MAX_ATTEMPTS) return;
    docsById.set(docSnap.id, docSnap);
  });
  const selectedDocs = Array.from(docsById.values())
    .sort((a, b) => {
      const aData = a.data() || {};
      const bData = b.data() || {};
      return Number(bData.priorityScore || 0) - Number(aData.priorityScore || 0) ||
        toJsMillis(aData.enqueuedAt || aData.updatedAt) - toJsMillis(bData.enqueuedAt || bData.updatedAt);
    })
    .slice(0, limitCount);

  const outputs = await mapWithConcurrency(selectedDocs, workerConcurrency, (docSnap) =>
    runAiPatrolQueueJob(docSnap, { source, actorId }),
  );
  const results = outputs.filter((item) => item?.ok);
  const failedCount = outputs.filter((item) => item?.failed).length;
  const skippedCount = outputs.filter((item) => item?.skipped).length;
  const stats = {
    selectedCount: selectedDocs.length,
    processedCount: results.length,
    failedCount,
    skippedCount,
    staleReleased,
    lowCount: results.filter((item) => item.riskLevel === "low").length,
    mediumCount: results.filter((item) => item.riskLevel === "medium").length,
    highCount: results.filter((item) => item.riskLevel === "high").length,
    criticalCount: results.filter((item) => item.riskLevel === "critical").length,
  };

  await db.collection("aiPatrolQueueRuns").doc(runId).set({
    runId,
    source,
    actorId,
    stats,
    results: results.map(({ contextItem, ...item }) => item).slice(0, 20),
    createdAt: now,
    updatedAt: now,
    model: GEMINI_MODEL,
    policyVersion: POLICY_VERSION,
    analysisVersion: AI_REGEX_MERGE_VERSION,
  }, { merge: true });

  return {
    ok: true,
    runId,
    stats,
    results,
    contextItems: results.map((item) => item.contextItem).filter(Boolean).slice(0, 12),
  };
}

function createPatrolChatContext(payload, analysis) {
  const caseCreated = ["medium", "high", "critical"].includes(String(analysis.riskLevel || ""));
  return createRangerChatContextItem({
    sourceType: payload.sourceType,
    sourcePath: payload.sourcePath,
    title: payload.category || payload.sourceType,
    content: payload.content,
    authorName: payload.authorName,
    authorId: payload.authorId,
    createdAt: payload.createdAt,
    updatedAt: payload.sourceData?.moderationUpdatedAt || payload.sourceData?.updatedAt || payload.createdAt,
    status: analysis.riskLevel === "high" || analysis.riskLevel === "critical"
      ? "pending_review"
      : analysis.riskLevel === "medium"
        ? "masked"
        : payload.sourceData?.moderationStatus || "normal",
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    reportsCount: payload.reportsCount || 0,
    category: (analysis.categories || []).join(", ") || payload.category,
    publicCaseId: caseCreated ? getPublicCaseId(payload.sourcePath) : "",
    summary: analysis.summary,
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const queue = Array.isArray(items) ? items : [];
  const limit = clampNumber(Number(concurrency || 1), 1, 5);
  const results = new Array(queue.length);
  let index = 0;

  async function runNext() {
    while (index < queue.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(queue[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, () => runNext()),
  );
  return results;
}

async function buildAiSitePatrol({ actorId = "system", source = "manual", limits = {} } = {}) {
  const maxPosts = clampNumber(Number(limits.posts || 260), 20, 800);
  const maxComments = clampNumber(Number(limits.comments || 360), 20, 1000);
  const maxReplies = clampNumber(Number(limits.replies || 260), 20, 1000);
  const defaultAiItems = source === "chat" ? 8 : 16;
  const maxAiItems = clampNumber(Number(limits.aiItems || defaultAiItems), 3, 30);
  const aiConcurrency = clampNumber(Number(limits.concurrency || 3), 1, 4);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const [postsSnapshot, commentsSnapshot, repliesSnapshot] = await Promise.all([
    safeQuery(() => db.collection("posts").limit(maxPosts).get(), "aiSitePatrol.posts"),
    safeQuery(() => db.collectionGroup("comments").limit(maxComments).get(), "aiSitePatrol.comments"),
    safeQuery(() => db.collectionGroup("replies").limit(maxReplies).get(), "aiSitePatrol.replies"),
  ]);

  const allDocs = [
    ...(postsSnapshot.docs || []),
    ...(commentsSnapshot.docs || []),
    ...(repliesSnapshot.docs || []),
  ];
  const payloads = (await mapWithConcurrency(allDocs, 8, async (docSnap) => {
      try {
        return await enrichPatrolPayloadWithModerationCase(buildPatrolPayloadFromSnapshot(docSnap));
      } catch (error) {
        console.error("AI site patrol payload failed:", docSnap.ref.path, error?.message || error);
        return null;
      }
    }))
    .filter((payload) => payload && payload.content && payload.authorId !== "system");

  const scored = payloads
    .map((payload) => ({
      payload,
      score: scoreAiPatrolCandidate(payload),
      updatedAt: toJsMillis(payload.sourceData?.moderationUpdatedAt || payload.sourceData?.updatedAt || payload.createdAt),
    }))
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

  const candidates = scored.filter((item) => item.score > -40);
  const selected = candidates.slice(0, maxAiItems);
  const alreadyPatrolledCount = Math.max(0, payloads.length - candidates.length);
  const patrolOutputs = await mapWithConcurrency(selected, aiConcurrency, async (item) => {
    try {
      const analysis = await runPatrolForSource({
        ...item.payload,
        patrolRunSource: source,
      });
      if (!analysis) return { skipped: true };
      return {
        ok: true,
        result: {
          sourcePath: item.payload.sourcePath,
          sourceType: item.payload.sourceType,
          publicCaseId: getPublicCaseId(item.payload.sourcePath),
          riskLevel: analysis.riskLevel,
          riskScore: analysis.riskScore,
          categories: analysis.categories,
          summary: analysis.summary,
          legalRisk: analysis.legalRisk,
          recommendedAction: analysis.recommendedAction,
          reportsCount: item.payload.reportsCount || 0,
          preview: compactPreview(item.payload.content, 180),
          contextItem: createPatrolChatContext(item.payload, analysis),
        },
      };
    } catch (error) {
      console.error("AI site patrol item failed:", {
        sourcePath: item.payload.sourcePath,
        message: error?.message,
      });
      return { ok: false, failed: true };
    }
  });

  const results = patrolOutputs
    .filter((item) => item?.ok && item.result)
    .map((item) => item.result);
  const failedCount = patrolOutputs.filter((item) => item?.failed).length;
  const lowCount = results.filter((item) => item.riskLevel === "low").length;
  const mediumCount = results.filter((item) => item.riskLevel === "medium").length;
  const highCount = results.filter((item) => item.riskLevel === "high").length;
  const criticalCount = results.filter((item) => item.riskLevel === "critical").length;
  const maskedCount = results.filter((item) => item.riskLevel === "medium").length;
  const pendingReviewCount = results.filter((item) => ["high", "critical"].includes(item.riskLevel)).length;

  const runId = `ai-site-patrol-${Date.now()}`;
  const scanIncomplete = (
    (postsSnapshot.docs || []).length >= maxPosts ||
    (commentsSnapshot.docs || []).length >= maxComments ||
    (repliesSnapshot.docs || []).length >= maxReplies
  );
  const stats = {
    postsScanned: postsSnapshot.docs?.length || 0,
    commentsScanned: commentsSnapshot.docs?.length || 0,
    repliesScanned: repliesSnapshot.docs?.length || 0,
    contentScanned: payloads.length,
    aiAnalyzed: results.length,
    skippedByAiLimit: Math.max(0, candidates.length - selected.length),
    alreadyPatrolledCount,
    lowCount,
    mediumCount,
    highCount,
    criticalCount,
    maskedCount,
    pendingReviewCount,
    failedCount,
    scanIncomplete,
    aiConcurrency,
  };
  const topResults = results
    .sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0))
    .slice(0, 12);
  const reply = [
    "AI 法律巡邏完成。",
    `全站掃描 ${stats.contentScanned} 筆內容：貼文 ${stats.postsScanned}、留言 ${stats.commentsScanned}、回覆 ${stats.repliesScanned}。`,
    `本次交給 Gemini 法律/站規判斷 ${stats.aiAnalyzed} 筆，低 ${lowCount}、中 ${mediumCount}、高 ${highCount}、極高 ${criticalCount}。`,
    `已自動遮罩 ${maskedCount} 筆，轉入站長審核中 ${pendingReviewCount} 筆。`,
    stats.skippedByAiLimit > 0 ? `為避免聊天室逾時，剩餘 ${stats.skippedByAiLimit} 筆候選內容會留到下一輪分批巡邏。` : "",
    alreadyPatrolledCount > 0 ? `另有 ${alreadyPatrolledCount} 筆近期已巡邏內容，本輪先跳過避免重複判斷。` : "",
    scanIncomplete ? "提醒：內容量已碰到本次掃描上限，可再巡邏一次或提高上限分批掃。" : "",
  ].filter(Boolean).join("\n");

  await db.collection("aiSitePatrolRuns").doc(runId).set({
    runId,
    source,
    actorId,
    stats,
    results: topResults.map(({ contextItem, ...item }) => item),
    createdAt: now,
    updatedAt: now,
    model: GEMINI_MODEL,
    policyVersion: POLICY_VERSION,
    analysisVersion: AI_REGEX_MERGE_VERSION,
  }, { merge: true });

  return {
    ok: true,
    runId,
    reply,
    stats,
    results: topResults.map(({ contextItem, ...item }) => item),
    contextItems: topResults.map((item) => item.contextItem),
    scanned: {
      scope: "ai_site_patrol",
      posts: stats.postsScanned,
      comments: stats.commentsScanned,
      replies: stats.repliesScanned,
      cases: stats.maskedCount + stats.pendingReviewCount,
      reports: 0,
      contextItems: stats.contentScanned,
    },
    model: GEMINI_MODEL,
  };
}

async function buildQueuedAiSitePatrol({ actorId = "system", source = "manual", limits = {} } = {}) {
  const maxPosts = clampNumber(Number(limits.posts || 260), 20, 800);
  const maxComments = clampNumber(Number(limits.comments || 360), 20, 1000);
  const maxReplies = clampNumber(Number(limits.replies || 260), 20, 1000);
  const defaultAiItems = source === "chat" ? 8 : source === "scheduler" ? 12 : 16;
  const queueItems = clampNumber(
    Number(limits.queueItems || Number(limits.aiItems || defaultAiItems) * 4),
    8,
    160,
  );
  const processNow = clampNumber(
    Number(limits.processNow ?? (source === "chat" ? 4 : source === "scheduler" ? 12 : 8)),
    0,
    30,
  );
  const workerConcurrency = clampNumber(Number(limits.concurrency || 2), 1, 4);

  const [postsSnapshot, commentsSnapshot, repliesSnapshot] = await Promise.all([
    safeQuery(() => db.collection("posts").limit(maxPosts).get(), "queuedAiSitePatrol.posts"),
    safeQuery(() => db.collectionGroup("comments").limit(maxComments).get(), "queuedAiSitePatrol.comments"),
    safeQuery(() => db.collectionGroup("replies").limit(maxReplies).get(), "queuedAiSitePatrol.replies"),
  ]);
  const publicFieldScrub = await scrubPublicModerationInternalFields({
    maxPosts: Math.min(maxPosts, 220),
    maxComments: Math.min(maxComments, 300),
    maxReplies: Math.min(maxReplies, 220),
  }).catch((error) => {
    console.error("Public moderation field scrub failed during patrol:", error?.message || error);
    return { scannedCount: 0, scrubbedCount: 0, failed: true };
  });

  const allDocs = [
    ...(postsSnapshot.docs || []),
    ...(commentsSnapshot.docs || []),
    ...(repliesSnapshot.docs || []),
  ];
  const payloads = (await mapWithConcurrency(allDocs, 8, async (docSnap) => {
      try {
        return await enrichPatrolPayloadWithModerationCase(buildPatrolPayloadFromSnapshot(docSnap));
      } catch (error) {
        console.error("Queued AI site patrol payload failed:", docSnap.ref.path, error?.message || error);
        return null;
      }
    }))
    .filter((payload) => payload && payload.content && payload.authorId !== "system");

  const scored = payloads
    .map((payload) => ({
      payload,
      score: scoreAiPatrolCandidate(payload),
      updatedAt: toJsMillis(payload.sourceData?.moderationUpdatedAt || payload.sourceData?.updatedAt || payload.createdAt),
    }))
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  const candidates = scored.filter((item) => item.score > -40);
  const selected = candidates.slice(0, queueItems);
  const enqueueOutputs = await mapWithConcurrency(selected, 4, async (item) => {
    try {
      return await enqueueAiPatrolSource(item.payload, {
        source,
        reason: "site_patrol_scan",
        actorId,
        priorityBoost: source === "chat" || source === "dashboard" ? 10 : 0,
        force: Boolean(limits.force),
      });
    } catch (error) {
      console.error("Queued AI patrol enqueue failed:", {
        sourcePath: item.payload.sourcePath,
        message: error?.message || error,
      });
      return { queued: false, status: "enqueue_failed", error: String(error?.message || error) };
    }
  });

  const queueProcess = processNow > 0
    ? await processAiPatrolQueue({
      actorId,
      source,
      maxItems: processNow,
      concurrency: workerConcurrency,
    })
    : { stats: { processedCount: 0, failedCount: 0, skippedCount: 0 }, results: [], contextItems: [] };
  const backlogSnapshot = await safeQuery(
    () => db.collection(AI_PATROL_QUEUE_COLLECTION).where("status", "==", "queued").limit(240).get(),
    "queuedAiSitePatrol.backlog",
  );
  const doneCount = enqueueOutputs.filter((item) => item?.status === "fresh").length;
  const queuedCount = enqueueOutputs.filter((item) => item?.queued).length;
  const processingCount = enqueueOutputs.filter((item) => item?.status === "processing").length;
  const precheckCount = enqueueOutputs.filter((item) => item?.precheckApplied).length;
  const failedEnqueueCount = enqueueOutputs.filter((item) => item?.status === "enqueue_failed").length;
  const processedResults = queueProcess.results || [];
  const stats = {
    postsScanned: postsSnapshot.docs?.length || 0,
    commentsScanned: commentsSnapshot.docs?.length || 0,
    repliesScanned: repliesSnapshot.docs?.length || 0,
    contentScanned: payloads.length,
    candidatesCount: candidates.length,
    selectedCount: selected.length,
    queuedCount,
    freshSkippedCount: doneCount,
    processingCount,
    precheckCount,
    failedEnqueueCount,
    backlogCount: backlogSnapshot.docs?.length || 0,
    processedCount: Number(queueProcess.stats?.processedCount || 0),
    failedCount: Number(queueProcess.stats?.failedCount || 0) + failedEnqueueCount,
    skippedCount: Number(queueProcess.stats?.skippedCount || 0),
    publicFieldScrubbedCount: Number(publicFieldScrub.scrubbedCount || 0),
    lowCount: Number(queueProcess.stats?.lowCount || 0),
    mediumCount: Number(queueProcess.stats?.mediumCount || 0),
    highCount: Number(queueProcess.stats?.highCount || 0),
    criticalCount: Number(queueProcess.stats?.criticalCount || 0),
  };
  const runId = `queued-ai-site-patrol-${Date.now()}`;
  const reply = [
    "AI 法律巡邏已切換成佇列模式。",
    `全站掃描 ${stats.contentScanned} 筆內容：貼文 ${stats.postsScanned}、留言 ${stats.commentsScanned}、回覆 ${stats.repliesScanned}。`,
    `本輪入列 ${stats.queuedCount} 筆，已有新分析先跳過 ${stats.freshSkippedCount} 筆，處理中 ${stats.processingCount} 筆。`,
    stats.precheckCount > 0 ? `前置防護已先轉入審核中 ${stats.precheckCount} 筆，等待 Gemini 完整判斷。` : "",
    processNow > 0
      ? `這輪已由 Gemini 處理 ${stats.processedCount} 筆：低 ${stats.lowCount}、中 ${stats.mediumCount}、高 ${stats.highCount}、極高 ${stats.criticalCount}。`
      : "本輪只建立佇列，交給排程 worker 分批處理。",
    `目前待 AI 複核佇列約 ${stats.backlogCount} 筆。`,
    stats.failedCount > 0 ? `有 ${stats.failedCount} 筆處理失敗，已保留在佇列狀態供下一輪追蹤。` : "",
  ].filter(Boolean).join("\n");

  await db.collection("aiSitePatrolRuns").doc(runId).set({
    runId,
    source,
    actorId,
    stats,
    results: processedResults.map(({ contextItem, ...item }) => item).slice(0, 20),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    model: GEMINI_MODEL,
    policyVersion: POLICY_VERSION,
    analysisVersion: AI_REGEX_MERGE_VERSION,
    queueVersion: AI_PATROL_QUEUE_VERSION,
  }, { merge: true });

  return {
    ok: true,
    runId,
    reply,
    stats,
    results: processedResults.map(({ contextItem, ...item }) => item).slice(0, 12),
    contextItems: (queueProcess.contextItems || []).slice(0, 12),
    scanned: {
      scope: "ai_site_patrol",
      posts: stats.postsScanned,
      comments: stats.commentsScanned,
      replies: stats.repliesScanned,
      cases: stats.precheckCount + stats.mediumCount + stats.highCount + stats.criticalCount,
      reports: 0,
      contextItems: stats.contentScanned,
    },
    model: GEMINI_MODEL,
  };
}

function toJsMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStoredModerationRisk(data = {}) {
  const score = Number(data.moderationRiskScore ?? data.aiRisk ?? data.riskScore ?? 0);
  return clampNumber(Number.isFinite(score) ? score : 0, 0, 100);
}

function getStoredRiskProfile(data = {}) {
  const rawProfile = data.moderationRiskProfile || data.riskProfile || {};
  return normalizeRiskProfile(rawProfile, {
    content: getSourceAdminContent(data) || getCaseAdminContent(data),
    categories: data.categories || data.moderationCategories || [],
    riskLevel: data.moderationRiskLevel || data.riskLevel || "low",
    riskScore: getStoredModerationRisk(data),
  });
}

function getRecommendationBucket({ status, riskScore, reportsCount, riskProfile }) {
  const normalizedStatus = String(status || "normal");
  const profile = riskProfile || {};
  const legalRisk = clampNumber(Number(profile.legalRisk || 0), 0, 3);
  const communityRisk = clampNumber(Number(profile.communityRisk || 0), 0, 3);
  const spreadRisk = clampNumber(Number(profile.spreadRisk || 0), 0, 3);

  if (["pending_review", "hidden", "deleted", "removed", "quarantined"].includes(normalizedStatus)) {
    return "no_recommend";
  }
  if (legalRisk >= 3 || spreadRisk >= 3) return "no_recommend";
  if (spreadRisk >= 2 || communityRisk >= 2) return "downrank";
  if (riskScore >= 70 || reportsCount >= 5) return "no_recommend";
  if (normalizedStatus === "masked" || riskScore >= 35 || reportsCount > 0) return "downrank";
  return "normal";
}

function calculatePostRecommendation(data = {}, nowMs = Date.now()) {
  const createdAtMs = toJsMillis(data.createdAt) || nowMs;
  const ageHours = Math.max(0, (nowMs - createdAtMs) / 3600000);
  const likesCount = Math.max(0, Number(data.likesCount || 0));
  const commentsCount = Math.max(0, Number(data.commentsCount || 0));
  const reportsCount = Math.max(0, Number(data.reportsCount || 0));
  const riskScore = getStoredModerationRisk(data);
  const riskProfile = getStoredRiskProfile(data);
  const status = String(data.moderationStatus || "normal");
  const freshnessScore = Math.max(0, 120 - ageHours * 3.8);
  const interactionScore = Math.min(80, likesCount * 2 + commentsCount * 3);
  const riskPenalty = Math.max(
    riskScore * 1.1,
    riskProfile.legalRisk * 24 +
      riskProfile.communityRisk * 14 +
      riskProfile.spreadRisk * 22 +
      (1 - riskProfile.credibility) * 32 +
      riskProfile.coordinationRisk * 12 +
      riskProfile.velocityRisk * 8,
  );
  const reportPenalty = Math.min(80, reportsCount * 15);
  const statusPenalty = status === "masked" ? 35
    : ["pending_review", "hidden", "deleted", "removed", "quarantined"].includes(status) ? 180
      : 0;
  const safetyWeight = clampNumber(100 - riskPenalty - reportPenalty - statusPenalty, 0, 100);
  const score = Math.round(freshnessScore + interactionScore + safetyWeight * 0.7 - riskPenalty - reportPenalty - statusPenalty);
  const bucket = getRecommendationBucket({ status, riskScore, reportsCount, riskProfile });

  return {
    recommendationScore: bucket === "no_recommend" ? Math.min(score, -100) : score,
    recommendationBucket: bucket,
    recommendationVersion: RECOMMENDATION_VERSION,
  };
}

function addGovernanceTopic(topicMap, rawTopic, weight, riskScore) {
  const topic = String(rawTopic || "").replace(/^#/, "").trim() || "general";
  const current = topicMap.get(topic) || { label: topic, count: 0, weight: 0, maxRisk: 0 };
  current.count += 1;
  current.weight += weight;
  current.maxRisk = Math.max(current.maxRisk, riskScore || 0);
  topicMap.set(topic, current);
}

function getGovernanceRuntimeMode({ reportsLast24h, highRiskCaseCount, criticalCaseCount }) {
  if (reportsLast24h >= LOCKDOWN_REPORT_THRESHOLD || criticalCaseCount >= 4) return "LOCKDOWN_CANDIDATE";
  if (reportsLast24h >= SAFE_MODE_REPORT_THRESHOLD || highRiskCaseCount >= 5 || criticalCaseCount > 0) return "SAFE_MODE_CANDIDATE";
  return "NORMAL";
}

async function safeQuery(getter, label) {
  try {
    return await getter();
  } catch (error) {
    console.error(`Governance query failed: ${label}`, error);
    return { docs: [], size: 0 };
  }
}

async function buildGovernanceSweep({ manual = false, actorId = "system" } = {}) {
  const nowMs = Date.now();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const dayKey = getTaipeiDayKey(new Date(nowMs));
  const last24hMs = nowMs - 24 * 60 * 60 * 1000;

  const [postsSnapshot, casesSnapshot, reportsSnapshot] = await Promise.all([
    safeQuery(() => db.collection("posts").orderBy("createdAt", "desc").limit(180).get(), "posts"),
    safeQuery(() => db.collection("moderationCases").orderBy("createdAt", "desc").limit(240).get(), "moderationCases"),
    safeQuery(() => db.collection("reports").orderBy("createdAt", "desc").limit(180).get(), "reports"),
  ]);

  const batch = db.batch();
  const topicMap = new Map();
  const authorMap = new Map();
  const resolvedCaseIds = new Set(
    casesSnapshot.docs
      .filter((caseDoc) => isModerationCaseResolved(caseDoc.data() || {}))
      .map((caseDoc) => caseDoc.id)
  );
  let maskedPostCount = 0;
  let downrankedPostCount = 0;
  let noRecommendPostCount = 0;

  postsSnapshot.docs.forEach((postDoc) => {
    const data = postDoc.data() || {};
    const rec = calculatePostRecommendation(data, nowMs);
    const riskProfile = getStoredRiskProfile(data);
    const riskScore = Math.max(getStoredModerationRisk(data), getLegacyRiskScoreFromProfile(riskProfile));
    const reportsCount = Math.max(0, Number(data.reportsCount || 0));
    const authorId = String(data.authorId || "");
    const status = String(data.moderationStatus || "normal");
    const sourcePath = `posts/${postDoc.id}`;
    const sourceKey = getSourceKey(sourcePath);
    const publicCaseId = data.moderationPublicCaseId || getPublicCaseId(sourcePath);
    const taipeiHour = new Date((toJsMillis(data.createdAt) || nowMs) + TAIPEI_UTC_OFFSET_MS).getUTCHours();
    const nightPost = taipeiHour >= 0 && taipeiHour < 6;

    if (status === "masked") maskedPostCount += 1;
    if (rec.recommendationBucket === "downrank") downrankedPostCount += 1;
    if (rec.recommendationBucket === "no_recommend") noRecommendPostCount += 1;

    addGovernanceTopic(topicMap, data.category || data.aiTag || "general", 1 + Math.min(6, Number(data.commentsCount || 0)), riskScore);

    if (authorId) {
      const author = authorMap.get(authorId) || {
        uid: authorId,
        displayName: String(data.authorName || "").slice(0, 80),
        postCount: 0,
        reportsCount: 0,
        maxRisk: 0,
        legalRiskMax: 0,
        communityRiskMax: 0,
        spreadRiskMax: 0,
        lowCredibilityCount: 0,
        nightPostCount: 0,
        hiddenActionCount: 0,
      };
      author.postCount += 1;
      author.reportsCount += reportsCount;
      author.maxRisk = Math.max(author.maxRisk, riskScore);
      author.legalRiskMax = Math.max(author.legalRiskMax, riskProfile.legalRisk);
      author.communityRiskMax = Math.max(author.communityRiskMax, riskProfile.communityRisk);
      author.spreadRiskMax = Math.max(author.spreadRiskMax, riskProfile.spreadRisk);
      if (riskProfile.credibility < 0.5) author.lowCredibilityCount += 1;
      if (nightPost) author.nightPostCount += 1;
      if (["hidden", "deleted", "removed", "quarantined"].includes(status)) {
        author.hiddenActionCount += 1;
      }
      authorMap.set(authorId, author);
    }

    const postPatch = {
      ...rec,
      recommendationUpdatedAt: now,
      nightGovernanceLastCheckedAt: now,
    };
    const shouldSafetyEscalate = riskProfile.legalRisk >= 3 &&
      !resolvedCaseIds.has(sourceKey) &&
      !["pending_review", "hidden", "deleted", "removed", "quarantined", "approved", "released"].includes(status);

    if (shouldSafetyEscalate) {
      const riskLevel = getRiskLevelFromProfile(riskProfile, riskScore);
      const adminContent = getSourceAdminContent(data);
      Object.assign(postPatch, {
        ...buildSourcePatchForPendingReview("post", data, publicCaseId, riskLevel, riskScore),
      });

      batch.set(db.collection("moderationCases").doc(sourceKey), {
        sourceType: "post",
        sourcePath,
        postId: postDoc.id,
        authorId: data.authorId || null,
        authorName: data.authorName || null,
        category: data.category || data.aiTag || null,
        contentPreview: compactPreview(adminContent),
        contentSnapshot: String(adminContent || "").slice(0, 4000),
        imageUrlsSnapshot: Array.isArray(data.imageUrls) ? data.imageUrls.slice(0, 8) : [],
        aiGovernanceMode: "continuous_safety_sweep",
        policyVersion: POLICY_VERSION,
        policyRefs: [
          { code: "刑法第305條", label: "疑似恐嚇或人身安全威脅，需站長立即確認。" },
          { code: "社群安全系統", label: "自動巡檢補抓高法律風險內容。" },
        ],
        riskLevel,
        riskScore,
        riskProfile,
        legalRiskTier: riskProfile.legalRisk,
        communityRiskTier: riskProfile.communityRisk,
        credibilityScore: riskProfile.credibility,
        spreadRiskTier: riskProfile.spreadRisk,
        aiConfidence: riskProfile.aiConfidence,
        targetSensitivity: riskProfile.targetSensitivity,
        evidenceType: riskProfile.evidenceType,
        coordinationRiskTier: riskProfile.coordinationRisk,
        velocityRiskTier: riskProfile.velocityRisk,
        categories: riskProfile.labels?.length ? riskProfile.labels : ["threat"],
        summary: "社群安全巡檢發現明確威脅或高法律風險內容。",
        legalRisk: "可能涉及恐嚇、人身自由或公共安全風險，需站長裁決。",
        publicInterest: "unknown",
        recommendedAction: "pending_review",
        rationale: "Continuous governance sweep deterministic safety escalation.",
        publicCaseId,
        reportsCount,
        likesCount: Math.max(0, Number(data.likesCount || 0)),
        commentsCount: Math.max(0, Number(data.commentsCount || 0)),
        imageCount: Array.isArray(data.imageUrls) ? data.imageUrls.length : 0,
        status: "pending_review",
        adminDecision: null,
        adminNote: "",
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
        sourceCreatedAt: data.createdAt || null,
      }, { merge: true });

      batch.set(db.collection("rangerNotifications").doc(), {
        recipientId: STATION_MASTER_UID,
        senderId: "safety-sweep",
        senderName: "社群安全系統",
        type: "report",
        title: "社群安全巡檢發現高風險內容",
        content: `案件 ${publicCaseId} 已自動轉入站長裁決。`,
        read: false,
        createdAt: now,
        moderationCaseId: sourceKey,
      });
    }

    batch.set(postDoc.ref, postPatch, { merge: true });
  });

  let activeCaseCount = 0;
  let highRiskCaseCount = 0;
  let criticalCaseCount = 0;
  let pendingReviewCount = 0;
  let maskedCaseCount = 0;

  const highRiskCases = [];
  casesSnapshot.docs.forEach((caseDoc) => {
    const data = caseDoc.data() || {};
    const status = String(data.status || "");
    const riskScore = clampNumber(Number(data.riskScore || data.moderationRiskScore || 0), 0, 100);
    const riskProfile = getStoredRiskProfile(data);
    const riskLevel = getRiskLevelFromProfile(riskProfile, riskScore);

    if (isModerationCaseActive(data)) activeCaseCount += 1;
    if (riskLevel === "high" || riskLevel === "critical") highRiskCaseCount += 1;
    if (riskLevel === "critical") criticalCaseCount += 1;
    if (!isModerationCaseResolved(data) && (status === "pending_review" || status === "pending")) pendingReviewCount += 1;
    if (!isModerationCaseResolved(data) && status === "masked") maskedCaseCount += 1;

    addGovernanceTopic(topicMap, data.category || data.sourceType || "moderation", 2, riskScore);

    const authorId = String(data.authorId || "");
    if (authorId) {
      const author = authorMap.get(authorId) || {
        uid: authorId,
        displayName: String(data.authorName || "").slice(0, 80),
        postCount: 0,
        reportsCount: 0,
        maxRisk: 0,
        legalRiskMax: 0,
        communityRiskMax: 0,
        spreadRiskMax: 0,
        lowCredibilityCount: 0,
        nightPostCount: 0,
        hiddenActionCount: 0,
      };
      author.reportsCount += Math.max(0, Number(data.reportsCount || 0));
      author.maxRisk = Math.max(author.maxRisk, riskScore);
      author.legalRiskMax = Math.max(author.legalRiskMax, riskProfile.legalRisk);
      author.communityRiskMax = Math.max(author.communityRiskMax, riskProfile.communityRisk);
      author.spreadRiskMax = Math.max(author.spreadRiskMax, riskProfile.spreadRisk);
      if (riskProfile.credibility < 0.5) author.lowCredibilityCount += 1;
      if (["hidden", "deleted", "removed", "quarantined"].includes(status)) {
        author.hiddenActionCount += 1;
      }
      authorMap.set(authorId, author);
    }

    if ((riskLevel === "high" || riskLevel === "critical" || status === "pending_review") && highRiskCases.length < 12) {
      highRiskCases.push({
        id: caseDoc.id,
        publicCaseId: data.publicCaseId || null,
        sourceType: data.sourceType || null,
        sourcePath: data.sourcePath || null,
        status,
        riskLevel,
        riskScore,
        riskProfile,
        reportsCount: Math.max(0, Number(data.reportsCount || 0)),
        summary: String(data.summary || data.contentPreview || "").slice(0, 180),
        updatedAt: data.updatedAt || data.createdAt || null,
      });
    }
  });

  const reportsLast24h = reportsSnapshot.docs.filter((reportDoc) => {
    const createdAtMs = toJsMillis(reportDoc.get("createdAt"));
    return createdAtMs >= last24hMs;
  }).length;

  const topReported = reportsSnapshot.docs.slice(0, 80).reduce((map, reportDoc) => {
    const data = reportDoc.data() || {};
    const key = String(data.moderationCaseId || data.sourcePath || data.targetId || reportDoc.id);
    const item = map.get(key) || {
      key,
      targetType: data.targetType || null,
      sourcePath: data.sourcePath || null,
      moderationCaseId: data.moderationCaseId || null,
      reportsCount: 0,
      reason: String(data.reason || "").slice(0, 120),
      targetPreview: String(data.targetPreview || "").slice(0, 180),
    };
    item.reportsCount += 1;
    map.set(key, item);
    return map;
  }, new Map());

  const topTopics = Array.from(topicMap.values())
    .sort((a, b) => (b.maxRisk + b.weight) - (a.maxRisk + a.weight))
    .slice(0, 10);

  const accountRiskProfiles = Array.from(authorMap.values()).map((item) => {
    const accountRiskScore = Math.round(clampNumber(
      item.maxRisk * 0.45 +
        item.reportsCount * 8 +
        item.hiddenActionCount * 18 +
        item.lowCredibilityCount * 8 +
        item.nightPostCount * 2 +
        item.legalRiskMax * 10 +
        item.communityRiskMax * 7 +
        item.spreadRiskMax * 9,
      0,
      100,
    ));
    const accountRiskTier = accountRiskScore >= 70 ? "high"
      : accountRiskScore >= 35 ? "medium"
        : accountRiskScore > 0 ? "low"
          : "normal";

    return {
      ...item,
      accountRiskScore,
      accountRiskTier,
      updatedAt: now,
      dayKey,
    };
  });

  accountRiskProfiles.slice(0, 120).forEach((profile) => {
    if (!profile.uid) return;
    batch.set(db.collection("accountRiskProfiles").doc(profile.uid), profile, { merge: true });
  });

  const suspiciousUsers = accountRiskProfiles
    .filter((item) => item.accountRiskScore >= 25 || item.reportsCount > 0 || item.maxRisk >= 50)
    .sort((a, b) => b.accountRiskScore - a.accountRiskScore)
    .slice(0, 10);

  const reportLeaders = Array.from(topReported.values())
    .sort((a, b) => b.reportsCount - a.reportsCount)
    .slice(0, 10);

  const runtimeMode = getGovernanceRuntimeMode({
    reportsLast24h,
    highRiskCaseCount,
    criticalCaseCount,
  });

  const actionItems = [];
  if (pendingReviewCount > 0) actionItems.push(`Review ${pendingReviewCount} pending cases.`);
  if (reportsLast24h >= SAFE_MODE_REPORT_THRESHOLD) actionItems.push(`Reports increased in the last 24h: ${reportsLast24h}.`);
  if (noRecommendPostCount > 0) actionItems.push(`${noRecommendPostCount} posts are excluded from proactive recommendation.`);
  if (!actionItems.length) actionItems.push("No urgent station-master action detected.");

  const reportDoc = {
    dayKey,
    reportType: "continuous_governance",
    reportVersion: MORNING_REPORT_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION,
    generatedAt: now,
    generatedBy: actorId,
    manual,
    runtimeMode,
    stats: {
      postsScanned: postsSnapshot.size || postsSnapshot.docs.length,
      casesScanned: casesSnapshot.size || casesSnapshot.docs.length,
      reportsScanned: reportsSnapshot.size || reportsSnapshot.docs.length,
      reportsLast24h,
      activeCaseCount,
      highRiskCaseCount,
      criticalCaseCount,
      pendingReviewCount,
      maskedCaseCount,
      maskedPostCount,
      downrankedPostCount,
      noRecommendPostCount,
      accountRiskCount: suspiciousUsers.length,
    },
    brief: {
      title: "Matsu Station AI Governance Pulse",
      summary: runtimeMode === "NORMAL"
        ? "Governance signals are stable. Continue normal monitoring."
        : "Elevated governance signals detected. Station-master review is recommended.",
      actionItems,
    },
    topTopics,
    highRiskCases,
    reportLeaders,
    suspiciousUsers,
    updatedAt: now,
  };

  batch.set(db.collection("governanceReports").doc(dayKey), reportDoc, { merge: true });
  batch.set(db.collection("siteRuntime").doc("governance"), {
    runtimeMode,
    recommendationVersion: RECOMMENDATION_VERSION,
    lastSweepAt: now,
    governanceSweepCadence: "every 30 minutes",
    stats: reportDoc.stats,
  }, { merge: true });

  await batch.commit();

  return {
    ok: true,
    dayKey,
    runtimeMode,
    stats: reportDoc.stats,
    actionItems,
  };
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

exports.reviewAvatarImage = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: ["OPENAI_API_KEY"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "請先登入。");
    }
    await assertPublishingProfile(uid);

    const imageUrl = String(request.data?.imageUrl || "").trim();
    const imagePath = sanitizeSubmittedAvatarPath(request.data?.imagePath, uid);
    if (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2000) {
      throw new HttpsError("invalid-argument", "頭像圖片網址不正確。");
    }
    const avatarQuota = await assertDailyAvatarQuota(uid);

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getOpenAIKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: [
            { type: "text", text: "請審核這張社群網站大頭照。禁止色情裸露、暴力血腥、仇恨、騷擾、威脅、自傷、明顯違法或兒少不當內容。" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }),
      });
    } catch (error) {
      console.error("Avatar OpenAI moderation request failed", { uid, imagePath, message: error?.message || String(error) });
      throw new HttpsError("unavailable", "頭像審核暫時無法連線，請稍後再試。");
    }

    const raw = await response.text();
    if (!response.ok) {
      console.error("Avatar OpenAI moderation failed", { uid, imagePath, status: response.status, body: raw.slice(0, 500) });
      throw new HttpsError("unavailable", "頭像審核暫時忙碌，請稍後再試。");
    }

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("Avatar moderation JSON parse failed", { uid, imagePath, message: error?.message || String(error) });
      throw new HttpsError("internal", "頭像審核回應格式異常。");
    }

    const moderation = Array.isArray(result?.results) ? result.results[0] || {} : {};
    const categoryScores = moderation.category_scores || {};
    const flagged = moderation.flagged === true;
    const maxScore = Object.values(categoryScores).reduce((max, value) => {
      const score = Number(value);
      return Number.isFinite(score) ? Math.max(max, score) : max;
    }, 0);
    const blocked = flagged || maxScore >= 0.72;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("avatarReviews").add({
      uid,
      imagePath,
      imageUrl,
      provider: "openai",
      model: "omni-moderation-latest",
      quotaDayKey: avatarQuota.dayKey,
      quotaCount: avatarQuota.count,
      quotaLimit: avatarQuota.limit,
      flagged,
      maxScore,
      allowed: !blocked,
      categories: moderation.categories || {},
      categoryScores,
      createdAt: now,
    });

    if (blocked) {
      throw new HttpsError("failed-precondition", "這張圖片無法作為頭像，請更換其他圖片。");
    }

    return {
      ok: true,
      allowed: true,
      maxScore,
    };
  }
);

function countSubmittedChars(value) {
  return Array.from(String(value || "")).length;
}

function sanitizeSubmittedText(value, maxLength, options = {}) {
  const text = String(value || "").trim();
  if (!options.allowEmpty && !text) {
    throw new HttpsError("invalid-argument", "內容不能空白。");
  }
  if (countSubmittedChars(text) > maxLength) {
    throw new HttpsError("invalid-argument", `內容最多 ${maxLength} 字。`);
  }
  return text;
}

function sanitizeSubmittedImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => /^https:\/\//i.test(item) && item.length <= 2000)
    .slice(0, SERVER_MAX_POST_IMAGES);
}

function sanitizeSubmittedImagePaths(value, uid) {
  if (!Array.isArray(value)) return [];
  const prefix = `posts/${uid}/`;
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith(prefix) && item.length <= 500 && !item.includes(".."))
    .slice(0, SERVER_MAX_POST_IMAGES);
}

function sanitizeSubmittedAvatarPath(value, uid) {
  const path = String(value || "").trim();
  const prefix = `avatars/${uid}/`;
  if (!path.startsWith(prefix) || path.includes("..") || path.length > 500) {
    throw new HttpsError("invalid-argument", "頭像路徑不正確。");
  }
  return path;
}

function sanitizeSubmittedPostImages(data, uid) {
  const imageUrls = sanitizeSubmittedImageUrls([
    ...(Array.isArray(data?.imageUrls) ? data.imageUrls : []),
    data?.imageUrl,
  ]);
  const imagePaths = sanitizeSubmittedImagePaths([
    ...(Array.isArray(data?.imagePaths) ? data.imagePaths : []),
    data?.imagePath,
  ], uid);
  const count = Math.min(imageUrls.length, imagePaths.length, SERVER_MAX_POST_IMAGES);
  return {
    imageUrls: imageUrls.slice(0, count),
    imagePaths: imagePaths.slice(0, count),
    imageUrl: imageUrls[0] || "",
    imagePath: imagePaths[0] || "",
  };
}

async function reviewImageWithOpenAI({ uid, imageUrl, imagePath, purpose }) {
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [
          {
            type: "text",
            text: purpose === "post"
              ? "請審核這張社群貼文圖片。禁止色情裸露、暴力血腥、仇恨、騷擾、威脅、自傷、明顯違法、兒少不當內容或其他不適合公開社群平台展示的圖片。"
              : "請審核這張社群網站大頭照。禁止色情裸露、暴力血腥、仇恨、騷擾、威脅、自傷、明顯違法或兒少不當內容。",
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }),
    });
  } catch (error) {
    console.error("OpenAI image moderation request failed", { uid, imagePath, purpose, message: error?.message || String(error) });
    throw new HttpsError("unavailable", "圖片審核暫時無法連線，請稍後再試。");
  }

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI image moderation failed", { uid, imagePath, purpose, status: response.status, body: raw.slice(0, 500) });
    throw new HttpsError("unavailable", "圖片審核暫時忙碌，請稍後再試。");
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch (error) {
    console.error("OpenAI image moderation JSON parse failed", { uid, imagePath, purpose, message: error?.message || String(error) });
    throw new HttpsError("internal", "圖片審核回應格式異常。");
  }

  const moderation = Array.isArray(result?.results) ? result.results[0] || {} : {};
  const categoryScores = moderation.category_scores || {};
  const flagged = moderation.flagged === true;
  const maxScore = Object.values(categoryScores).reduce((max, value) => {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(max, score) : max;
  }, 0);

  return {
    flagged,
    maxScore,
    blocked: flagged || maxScore >= 0.72,
    categories: moderation.categories || {},
    categoryScores,
  };
}

async function reviewSubmittedPostImages(uid, submittedImages) {
  const imageUrls = Array.isArray(submittedImages?.imageUrls) ? submittedImages.imageUrls : [];
  const imagePaths = Array.isArray(submittedImages?.imagePaths) ? submittedImages.imagePaths : [];
  if (!imageUrls.length) return [];

  let quota = null;
  try {
    quota = await assertDailyPostImageQuota(uid);
    const reviews = [];
    for (let index = 0; index < imageUrls.length; index += 1) {
      const imageUrl = imageUrls[index];
      const imagePath = imagePaths[index] || "";
      const review = await reviewImageWithOpenAI({ uid, imageUrl, imagePath, purpose: "post" });
      await db.collection("postImageReviews").add({
        uid,
        imagePath,
        imageUrl,
        provider: "openai",
        model: "omni-moderation-latest",
        quotaDayKey: quota.dayKey,
        quotaCount: quota.count,
        quotaLimit: quota.limit,
        flagged: review.flagged,
        maxScore: review.maxScore,
        allowed: !review.blocked,
        categories: review.categories,
        categoryScores: review.categoryScores,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      reviews.push(review);
      if (review.blocked) {
        throw new HttpsError("failed-precondition", "這張圖片可能不適合公開發布，請更換圖片或改成純文字發文。");
      }
    }
    return reviews;
  } catch (error) {
    await deleteStoragePaths(imagePaths);
    throw error;
  }
}

async function deleteStoragePaths(imagePaths) {
  const paths = Array.from(new Set(
    (Array.isArray(imagePaths) ? imagePaths : [])
      .map((item) => String(item || "").trim())
      .filter((item) => item.startsWith("posts/") && !item.includes("..")),
  ));
  if (!paths.length) return;
  const bucket = admin.storage().bucket();
  await Promise.all(paths.map(async (imagePath) => {
    try {
      await bucket.file(imagePath).delete({ ignoreNotFound: true });
    } catch (error) {
      console.warn("Storage image cleanup failed", { imagePath, message: error?.message });
    }
  }));
}

function sanitizeSubmittedId(value, label) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{6,120}$/.test(id)) {
    throw new HttpsError("invalid-argument", `${label} 不正確。`);
  }
  return id;
}

function getCallableIp(request) {
  const raw = request.rawRequest;
  const forwarded = String(raw?.headers?.["x-forwarded-for"] || raw?.headers?.["fastly-client-ip"] || "").split(",")[0].trim();
  return forwarded || String(raw?.ip || "").trim();
}

function getIpKey(ipAddress) {
  const value = String(ipAddress || "").trim();
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

async function assertAccountCanPublish(uid, request) {
  if (!uid || uid === STATION_MASTER_UID) return { ipAddress: "", ipKey: "" };
  const ipAddress = getCallableIp(request);
  const ipKey = getIpKey(ipAddress);
  const [userSnap, ipSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    ipKey ? db.collection("blockedIps").doc(ipKey).get() : Promise.resolve(null),
  ]);
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const accountStatus = String(userData.accountStatus || "");
  if (accountStatus === "banned" || userData.isBanned === true) {
    throw new HttpsError("permission-denied", "此帳號目前無法發布內容，請洽站方確認。");
  }
  if (accountStatus === "posting_suspended") {
    throw new HttpsError("permission-denied", "此帳號目前暫停發布內容，請洽站方確認。");
  }
  if (ipSnap && ipSnap.exists) {
    const ipData = ipSnap.data() || {};
    if (ipData.status === "blocked") {
      throw new HttpsError("permission-denied", "此連線來源目前無法發布內容，請稍後再試或洽站方確認。");
    }
  }
  return { ipAddress, ipKey };
}

async function recordAccountAccess(uid, request, extra = {}) {
  if (!uid || uid === STATION_MASTER_UID) return { ipAddress: "", ipKey: "" };
  const ipAddress = getCallableIp(request);
  const ipKey = getIpKey(ipAddress);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(uid).set({
    lastSeenAt: now,
    accountControlVersion: ACCOUNT_CONTROL_VERSION,
    lastAccessSource: admin.firestore.FieldValue.delete(),
    lastIpAddress: admin.firestore.FieldValue.delete(),
    lastIpKey: admin.firestore.FieldValue.delete(),
    ipHistory: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  const privatePatch = {
    lastSeenAt: now,
    lastAccessSource: String(extra.source || "callable").slice(0, 60),
    accountControlVersion: ACCOUNT_CONTROL_VERSION,
  };
  if (ipAddress && ipKey) {
    privatePatch.lastIpAddress = ipAddress;
    privatePatch.lastIpKey = ipKey;
    privatePatch.ipHistory = admin.firestore.FieldValue.arrayUnion({
      ipAddress,
      ipKey,
      source: String(extra.source || "callable").slice(0, 60),
      seenAt: new Date().toISOString(),
    });
  }
  await db.collection("accountControlProfiles").doc(uid).set(privatePatch, { merge: true });
  return { ipAddress, ipKey };
}

function normalizeSubmittedCategory(value) {
  const category = String(value || "在地生活").trim().replace(/^#/, "").slice(0, 40);
  return category || "在地生活";
}

async function assertPublishingProfile(uid) {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError("failed-precondition", "請先完成帳號設定。");
  }

  const data = userSnap.data() || {};
  const acceptedPolicies = data.agreedToTerms === true &&
    data.isProfileSetup === true &&
    data.acceptedTermsVersion === POLICY_VERSION &&
    data.acceptedPrivacyVersion === POLICY_VERSION &&
    data.acceptedCommunityRulesVersion === POLICY_VERSION;

  if (!acceptedPolicies) {
    throw new HttpsError("failed-precondition", "請先同意最新版服務條款、隱私權政策與社群規範。");
  }

  return {
    uid,
    raw: data,
    displayName: String(data.displayName || data.islanderId || "匿名島民").trim().slice(0, 60) || "匿名島民",
    photoURL: String(data.photoURL || DEFAULT_ISLANDER_PHOTO).trim() || DEFAULT_ISLANDER_PHOTO,
    role: uid === STATION_MASTER_UID || data.role === "admin" ? "admin" : "user",
  };
}

async function assertDailyPostQuota(uid, profileData = {}) {
  if (!uid || uid === STATION_MASTER_UID) return;

  const dayKey = getTaipeiDayKey();
  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const nowMs = Date.now();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = usageSnap.exists ? usageSnap.data() || {} : {};
    const postCount = Math.max(0, Number(usage.postCount || 0));
    const lastPostAtMs = Math.max(0, Number(usage.lastPostAtMs || 0));
    const accountAgeMs = nowMs - toJsMillis(profileData.createdAt);

    if (lastPostAtMs && nowMs - lastPostAtMs < SERVER_POST_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((SERVER_POST_COOLDOWN_MS - (nowMs - lastPostAtMs)) / 1000);
      throw new HttpsError("resource-exhausted", `發文太密集，請再等 ${secondsLeft} 秒。`);
    }

    if (postCount >= SERVER_DAILY_POST_LIMIT) {
      throw new HttpsError("resource-exhausted", `每個帳號一天最多 ${SERVER_DAILY_POST_LIMIT} 篇，請明天再發。`);
    }

    if (accountAgeMs > 0 && accountAgeMs < SERVER_NEW_ACCOUNT_WINDOW_MS && postCount > 0) {
      const minutesLeft = Math.ceil((SERVER_NEW_ACCOUNT_WINDOW_MS - accountAgeMs) / 60000);
      throw new HttpsError("resource-exhausted", `新帳號前 30 分鐘只能先發一篇，請再等約 ${minutesLeft} 分鐘。`);
    }

    transaction.set(usageRef, {
      uid,
      dayKey,
      postCount: admin.firestore.FieldValue.increment(1),
      lastPostAtMs: nowMs,
      lastPostAt: now,
      updatedAt: now,
      ...(usageSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
  });
}

async function assertDailyAvatarQuota(uid) {
  if (!uid || uid === STATION_MASTER_UID) {
    return { dayKey: getTaipeiDayKey(), count: 0, limit: Number.POSITIVE_INFINITY };
  }

  const dayKey = getTaipeiDayKey();
  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let nextCount = 1;

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = usageSnap.exists ? usageSnap.data() || {} : {};
    const avatarUpdateCount = Math.max(0, Number(usage.avatarUpdateCount || 0));

    if (avatarUpdateCount >= SERVER_DAILY_AVATAR_UPDATE_LIMIT) {
      throw new HttpsError("resource-exhausted", `今日頭像更新次數已達上限（${SERVER_DAILY_AVATAR_UPDATE_LIMIT} 次），請明天再試。`);
    }

    nextCount = avatarUpdateCount + 1;
    transaction.set(usageRef, {
      uid,
      dayKey,
      avatarUpdateCount: admin.firestore.FieldValue.increment(1),
      avatarLastUpdateAt: now,
      updatedAt: now,
      ...(usageSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
  });

  return { dayKey, count: nextCount, limit: SERVER_DAILY_AVATAR_UPDATE_LIMIT };
}

async function assertDailyPostImageQuota(uid) {
  if (!uid || uid === STATION_MASTER_UID) {
    return { dayKey: getTaipeiDayKey(), count: 0, limit: Number.POSITIVE_INFINITY };
  }

  const dayKey = getTaipeiDayKey();
  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const nowMs = Date.now();
  const now = admin.firestore.FieldValue.serverTimestamp();
  let nextCount = 1;

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = usageSnap.exists ? usageSnap.data() || {} : {};
    const postImageReviewCount = Math.max(0, Number(usage.postImageReviewCount || 0));
    const lastPostImageReviewAtMs = Math.max(0, Number(usage.lastPostImageReviewAtMs || 0));

    if (lastPostImageReviewAtMs && nowMs - lastPostImageReviewAtMs < SERVER_POST_IMAGE_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((SERVER_POST_IMAGE_COOLDOWN_MS - (nowMs - lastPostImageReviewAtMs)) / 1000);
      throw new HttpsError("resource-exhausted", `圖片發文需間隔 1 分鐘，請再等約 ${secondsLeft} 秒。`);
    }

    if (postImageReviewCount >= SERVER_DAILY_POST_IMAGE_LIMIT) {
      throw new HttpsError("resource-exhausted", `今日圖片發文已達上限（${SERVER_DAILY_POST_IMAGE_LIMIT} 張），請明天再試。`);
    }

    nextCount = postImageReviewCount + 1;
    transaction.set(usageRef, {
      uid,
      dayKey,
      postImageReviewCount: admin.firestore.FieldValue.increment(1),
      lastPostImageReviewAtMs: nowMs,
      lastPostImageReviewAt: now,
      updatedAt: now,
      ...(usageSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
  });

  return { dayKey, count: nextCount, limit: SERVER_DAILY_POST_IMAGE_LIMIT };
}

async function assertDailyCommentQuota(uid) {
  if (!uid || uid === STATION_MASTER_UID) return;

  const dayKey = getTaipeiDayKey();
  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = usageSnap.exists ? usageSnap.data() || {} : {};
    const commentCount = Math.max(0, Number(usage.commentCount || 0));

    if (commentCount >= SERVER_DAILY_COMMENT_LIMIT) {
      throw new HttpsError("resource-exhausted", `每個帳號一天最多 ${SERVER_DAILY_COMMENT_LIMIT} 則留言/回覆，請明天再發。`);
    }

    transaction.set(usageRef, {
      uid,
      dayKey,
      commentCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
      ...(usageSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
  });
}

function assertSourceCanReceiveDiscussion(data = {}, label = "內容") {
  const status = String(data.moderationStatus || "normal");
  if (["pending_review", "hidden", "deleted", "removed", "quarantined"].includes(status)) {
    throw new HttpsError("failed-precondition", `${label}目前由站務處理中，暫時不能回覆。`);
  }
}

function getPrecheckDecision(payload) {
  const deterministicSignals = getDeterministicRiskSignals(payload.content, payload);
  const semanticPriority = getSemanticPatrolPriority(payload.content);
  const protectedByPrecheck = shouldApplyQueuePrecheck(payload, deterministicSignals, semanticPriority);
  const riskScore = clampNumber(Math.max(
    Number(deterministicSignals.scoreFloor || 0),
    Number(semanticPriority.score || 0),
    protectedByPrecheck ? 70 : 0,
  ), 0, 100);

  return {
    deterministicSignals,
    semanticPriority,
    protectedByPrecheck,
    riskScore,
    riskLevel: getRiskLevelFromScore(riskScore),
  };
}

function buildProtectedSourcePatch(sourceType, publicCaseId, decision) {
  return {
    moderationStatus: "pending_review",
    moderationPublicCaseId: publicCaseId,
    moderationRiskLevel: decision.riskLevel,
    moderationRiskScore: decision.riskScore,
    moderationPublicNotice: HIGH_REVIEW_COPY,
    moderationReviewNotice: HIGH_REVIEW_COPY,
    content: "",
    quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
    ...(sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
  };
}

function sanitizeNotificationText(value, maxLength, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new HttpsError("invalid-argument", `${label} is required.`);
  }
  return text.slice(0, maxLength);
}

function sanitizeOptionalNotificationId(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  return sanitizeSubmittedId(value, label);
}

function normalizeNotificationUid(value) {
  const uid = String(value || "").trim();
  return uid === STATION_MASTER_LEGACY_ID ? STATION_MASTER_UID : uid;
}

async function assertNotificationRecipientExists(recipientId) {
  const snap = await db.collection("users").doc(recipientId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Notification recipient does not exist.");
  }
}

async function assertNotificationTarget({
  type,
  senderId,
  recipientId,
  postId,
  commentId,
  replyId,
}) {
  if (type === "follow_request") {
    const requestSnap = await db
      .collection("users")
      .doc(recipientId)
      .collection("followRequests")
      .doc(senderId)
      .get();
    if (!requestSnap.exists) {
      throw new HttpsError("failed-precondition", "Follow request does not exist.");
    }
    return;
  }

  if (!postId) {
    throw new HttpsError("invalid-argument", "postId is required.");
  }

  const postRef = db.collection("posts").doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) {
    throw new HttpsError("not-found", "Notification target post does not exist.");
  }

  let expectedRecipientId = normalizeNotificationUid(postSnap.get("authorId"));

  if (commentId) {
    const commentRef = postRef.collection("comments").doc(commentId);
    const commentSnap = await commentRef.get();
    if (!commentSnap.exists) {
      throw new HttpsError("not-found", "Notification target comment does not exist.");
    }
    expectedRecipientId = normalizeNotificationUid(commentSnap.get("authorId"));

    if (replyId) {
      const replySnap = await commentRef.collection("replies").doc(replyId).get();
      if (!replySnap.exists) {
        throw new HttpsError("not-found", "Notification target reply does not exist.");
      }
      if (type === "like") {
        expectedRecipientId = normalizeNotificationUid(replySnap.get("authorId"));
      }
    }
  }

  if (type === "report") {
    if (recipientId !== STATION_MASTER_UID) {
      throw new HttpsError("permission-denied", "Report notifications can only go to the station master.");
    }
    return;
  }

  if (type === "mention") {
    await assertNotificationRecipientExists(recipientId);
    return;
  }

  if (!expectedRecipientId || expectedRecipientId !== recipientId) {
    throw new HttpsError("permission-denied", "Notification recipient does not match target owner.");
  }
}

exports.createUserNotification = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
  },
  async (request) => {
    const senderId = requireSignedIn(request);
    const profile = await assertPublishingProfile(senderId);
    const type = sanitizeNotificationText(request.data?.type, 30, "type");
    const rawRecipientId = normalizeNotificationUid(request.data?.recipientId);
    const recipientId = sanitizeSubmittedId(rawRecipientId, "recipient");
    const allowedTypes = new Set(["like", "comment", "mention", "report", "follow_request"]);

    if (!allowedTypes.has(type)) {
      throw new HttpsError("invalid-argument", "Invalid notification type.");
    }

    if (type === "like") {
      return { ok: true, skipped: true, reason: "like_notifications_are_triggered_by_server" };
    }

    if (recipientId === senderId) {
      return { ok: true, skipped: true, reason: "same_recipient" };
    }

    const postId = sanitizeOptionalNotificationId(request.data?.postId, "post");
    const commentId = sanitizeOptionalNotificationId(request.data?.commentId, "comment");
    const replyId = sanitizeOptionalNotificationId(request.data?.replyId, "reply");
    const category = String(request.data?.category || "").trim().slice(0, 40);
    const title = sanitizeNotificationText(request.data?.title, 80, "title");
    const content = sanitizeNotificationText(request.data?.content, 300, "content");

    await assertNotificationTarget({
      type,
      senderId,
      recipientId,
      postId,
      commentId,
      replyId,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const notification = {
      recipientId,
      senderId,
      senderName: profile.displayName,
      type,
      title,
      content,
      read: false,
      createdAt: now,
      createdByServer: true,
      ...(postId ? { postId } : {}),
      ...(category ? { category } : {}),
      ...(commentId ? { commentId } : {}),
      ...(replyId ? { replyId } : {}),
    };

    const docRef = await db.collection("notifications").add(notification);
    await recordAccountAccess(senderId, request, { source: `notify_${type}` });

    return { ok: true, id: docRef.id };
  }
);

exports.createCommunityContent = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: ["GEMINI_API_KEY", "OPENAI_API_KEY"],
  },
  async (request) => {
    const uid = requireSignedIn(request);
    const publishAccess = await assertAccountCanPublish(uid, request);
    const profile = await assertPublishingProfile(uid);
    const sourceType = String(request.data?.sourceType || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const authorPatch = {
      authorId: uid,
      authorName: profile.displayName,
      authorPhoto: profile.photoURL,
      createdAt: now,
      createdByServer: true,
    };

    let sourceRef;
    let sourcePath = "";
    let postId = "";
    let commentId = "";
    let replyId = "";
    let category = "";
    let content = "";
    let imageUrls = [];
    let imagePaths = [];
    let imageUrl = "";
    let imagePath = "";
    let baseDoc = {};

    if (sourceType === "post") {
      const submittedImages = sanitizeSubmittedPostImages(request.data || {}, uid);
      imageUrls = submittedImages.imageUrls;
      imagePaths = submittedImages.imagePaths;
      imageUrl = submittedImages.imageUrl;
      imagePath = submittedImages.imagePath;
      content = sanitizeSubmittedText(request.data?.content, SERVER_POST_CHAR_LIMIT, { allowEmpty: imageUrls.length > 0 });
      category = normalizeSubmittedCategory(request.data?.category);
      try {
        await reviewSubmittedPostImages(uid, submittedImages);
        await assertDailyPostQuota(uid, profile.raw);
      } catch (error) {
        await deleteStoragePaths(imagePaths);
        throw error;
      }

      sourceRef = db.collection("posts").doc();
      postId = sourceRef.id;
      sourcePath = `posts/${postId}`;
      baseDoc = {
        ...authorPatch,
        content,
        category,
        aiSafe: true,
        aiRisk: 0,
        aiTag: category,
        aiSummary: "內容已送出，站務系統會依規範處理。",
        aiAction: "publish",
        likesCount: 0,
        commentsCount: 0,
        reportsCount: 0,
        imageUrl,
        imagePath,
        imageUrls,
        imagePaths,
      };
    } else if (sourceType === "comment") {
      postId = sanitizeSubmittedId(request.data?.postId, "貼文");
      content = sanitizeSubmittedText(request.data?.content, SERVER_COMMENT_CHAR_LIMIT);
      const postSnap = await db.collection("posts").doc(postId).get();
      if (!postSnap.exists) throw new HttpsError("not-found", "找不到要留言的貼文。");
      assertSourceCanReceiveDiscussion(postSnap.data(), "貼文");
      await assertDailyCommentQuota(uid);

      category = String(postSnap.get("category") || postSnap.get("aiTag") || "").slice(0, 40);
      sourceRef = db.collection("posts").doc(postId).collection("comments").doc();
      commentId = sourceRef.id;
      sourcePath = `posts/${postId}/comments/${commentId}`;
      baseDoc = {
        ...authorPatch,
        authorRole: profile.role,
        content,
        likesCount: 0,
        repliesCount: 0,
        serverQuotaChecked: true,
      };
    } else if (sourceType === "reply") {
      postId = sanitizeSubmittedId(request.data?.postId, "貼文");
      commentId = sanitizeSubmittedId(request.data?.commentId, "留言");
      content = sanitizeSubmittedText(request.data?.content, SERVER_COMMENT_CHAR_LIMIT);
      const postRef = db.collection("posts").doc(postId);
      const commentRef = postRef.collection("comments").doc(commentId);
      const [postSnap, commentSnap] = await Promise.all([postRef.get(), commentRef.get()]);
      if (!postSnap.exists) throw new HttpsError("not-found", "找不到要回覆的貼文。");
      if (!commentSnap.exists) throw new HttpsError("not-found", "找不到要回覆的留言。");
      assertSourceCanReceiveDiscussion(postSnap.data(), "貼文");
      assertSourceCanReceiveDiscussion(commentSnap.data(), "留言");
      await assertDailyCommentQuota(uid);

      category = String(postSnap.get("category") || postSnap.get("aiTag") || "").slice(0, 40);
      sourceRef = commentRef.collection("replies").doc();
      replyId = sourceRef.id;
      sourcePath = `posts/${postId}/comments/${commentId}/replies/${replyId}`;
      baseDoc = {
        ...authorPatch,
        authorRole: profile.role,
        content,
        likesCount: 0,
        serverQuotaChecked: true,
      };
    } else {
      throw new HttpsError("invalid-argument", "不支援的內容類型。");
    }

    const publicCaseId = getPublicCaseId(sourcePath);
    const patrolPayload = {
      sourceType,
      sourcePath,
      postId: postId || null,
      commentId: commentId || null,
      replyId: replyId || null,
      authorId: uid,
      authorName: profile.displayName,
      category,
      content,
      imageUrl,
      imagePath,
      imageUrls,
      imagePaths,
      reportsCount: 0,
      createdAt: null,
      sourceData: {
        moderationStatus: "normal",
        reportsCount: 0,
        likesCount: 0,
        commentsCount: 0,
        repliesCount: 0,
      },
    };
    const decision = getPrecheckDecision(patrolPayload);
    const protectedByPrecheck = Boolean(decision.protectedByPrecheck);
    const sourceDoc = {
      ...baseDoc,
      moderationStatus: protectedByPrecheck ? "pending_review" : "normal",
      moderationUpdatedAt: now,
      ...(protectedByPrecheck ? buildProtectedSourcePatch(sourceType, publicCaseId, decision) : {}),
    };

    await sourceRef.set(sourceDoc);
    const accessSnapshot = await recordAccountAccess(uid, request, { source: `create_${sourceType}` });
    const contentIpAddress = publishAccess.ipAddress || accessSnapshot.ipAddress || "";
    const contentIpKey = publishAccess.ipKey || accessSnapshot.ipKey || "";
    if (contentIpAddress || contentIpKey) {
      await db.collection("contentAccessLogs").doc(getSourceKey(sourcePath)).set({
        sourcePath,
        sourceType,
        postId: postId || null,
        commentId: commentId || null,
        replyId: replyId || null,
        authorId: uid,
        authorName: profile.displayName,
        ipAddress: contentIpAddress || null,
        ipKey: contentIpKey || null,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    }

    if (protectedByPrecheck) {
      try {
        await enqueueAiPatrolSource(patrolPayload, {
          source: "create_callable",
          reason: "server_precheck",
          actorId: uid,
          force: true,
          applyPrecheck: true,
        });
      } catch (error) {
        console.error("Create content precheck enqueue failed:", {
          sourcePath,
          message: error?.message,
        });
      }
    }

    return {
      id: sourceRef.id,
      sourcePath,
      sourceType,
      status: protectedByPrecheck ? "pending_review" : "normal",
      protected: protectedByPrecheck,
      publicCaseId: protectedByPrecheck ? publicCaseId : null,
    };
  }
);

function resolveSubmittedSourcePath(data = {}) {
  const sourceType = String(data.sourceType || "").trim();
  const postId = sanitizeSubmittedId(data.postId, "貼文");

  if (sourceType === "post") {
    return `posts/${postId}`;
  }

  if (sourceType === "comment") {
    const commentId = sanitizeSubmittedId(data.commentId, "留言");
    return `posts/${postId}/comments/${commentId}`;
  }

  if (sourceType === "reply") {
    const commentId = sanitizeSubmittedId(data.commentId, "留言");
    const replyId = sanitizeSubmittedId(data.replyId, "回覆");
    return `posts/${postId}/comments/${commentId}/replies/${replyId}`;
  }

  throw new HttpsError("invalid-argument", "不支援的內容類型。");
}

async function softRemoveCommunitySource({ sourcePath, actorId }) {
  const sourceMeta = parseManagedSourcePath(sourcePath);
  const sourceRef = db.doc(sourcePath);
  const sourceSnap = await sourceRef.get();

  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "找不到要刪除的內容。");
  }

  const sourceData = sourceSnap.data() || {};
  if (sourceData.authorId !== actorId && actorId !== STATION_MASTER_UID) {
    throw new HttpsError("permission-denied", "你沒有權限刪除此內容。");
  }

  const sourceKey = getSourceKey(sourcePath);
  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const caseSnap = await caseRef.get();
  const existingCase = caseSnap.exists ? caseSnap.data() || {} : {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const publicCaseId = sourceData.moderationPublicCaseId || existingCase.publicCaseId || getPublicCaseId(sourcePath);
  const contentSnapshot = pickAdminContentText(
    sourceData.content,
    sourceData.contentSnapshot,
    existingCase.contentSnapshot,
    sourceData.quarantinedContentPreview,
  ).slice(0, 4000);
  const imageUrlsSnapshot = Array.isArray(sourceData.imageUrls) && sourceData.imageUrls.length
    ? sourceData.imageUrls.slice(0, 8)
    : Array.isArray(existingCase.imageUrlsSnapshot)
      ? existingCase.imageUrlsSnapshot.slice(0, 8)
      : [];
  const imagePathsSnapshot = Array.isArray(sourceData.imagePaths) && sourceData.imagePaths.length
    ? sourceData.imagePaths.slice(0, 8)
    : sourceData.imagePath
      ? [String(sourceData.imagePath)]
      : Array.isArray(existingCase.imagePathsSnapshot)
        ? existingCase.imagePathsSnapshot.slice(0, 8)
        : [];
  const riskScore = clampNumber(Number(sourceData.moderationRiskScore || existingCase.riskScore || 0), 0, 100);
  const riskProfile = getStoredRiskProfile({
    ...existingCase,
    ...sourceData,
    content: contentSnapshot,
  });
  const authorDeletedCopy = "此內容已由作者刪除。";

  await sourceRef.set({
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationStatus: "deleted",
    moderationReason: "author_deleted",
    moderationPublicCaseId: publicCaseId,
    moderationPublicNotice: authorDeletedCopy,
    moderationMaskNotice: admin.firestore.FieldValue.delete(),
    moderationReviewNotice: admin.firestore.FieldValue.delete(),
    content: "",
    quarantinedContentPreview: authorDeletedCopy,
    ...(sourceMeta.sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
    deletionRequestedBy: actorId,
    deletionRequestedAt: now,
    moderationUpdatedAt: now,
  }, { merge: true });

  await caseRef.set({
    sourceType: sourceMeta.sourceType,
    sourcePath,
    postId: sourceMeta.postId || null,
    commentId: sourceMeta.commentId || null,
    replyId: sourceMeta.replyId || null,
    authorId: sourceData.authorId || null,
    authorName: sourceData.authorName || null,
    category: sourceData.category || sourceData.aiTag || existingCase.category || null,
    contentPreview: compactPreview(contentSnapshot),
    contentSnapshot,
    imageUrlsSnapshot,
    imagePathsSnapshot,
    aiGovernanceMode: existingCase.aiGovernanceMode || "author_removal",
    policyVersion: POLICY_VERSION,
    publicCaseId,
    riskLevel: existingCase.riskLevel || getRiskLevelFromProfile(riskProfile, riskScore),
    riskScore,
    riskProfile,
    legalRiskTier: riskProfile.legalRisk,
    communityRiskTier: riskProfile.communityRisk,
    credibilityScore: riskProfile.credibility,
    spreadRiskTier: riskProfile.spreadRisk,
    aiConfidence: riskProfile.aiConfidence,
    targetSensitivity: riskProfile.targetSensitivity,
    evidenceType: riskProfile.evidenceType,
    coordinationRiskTier: riskProfile.coordinationRisk,
    velocityRiskTier: riskProfile.velocityRisk,
    categories: sanitizeArray(existingCase.categories || sourceData.moderationCategories || []),
    summary: "作者自行刪除內容，系統保留治理紀錄與原文快照。",
    legalRisk: "作者刪除不代表站方已完成法律判斷；紀錄保留供站務後續查核。",
    publicInterest: existingCase.publicInterest || "unknown",
    recommendedAction: "author_deleted",
    rationale: "Author requested deletion through server-side soft delete.",
    reportsCount: Math.max(0, Number(sourceData.reportsCount || existingCase.reportsCount || 0)),
    likesCount: Math.max(0, Number(sourceData.likesCount || 0)),
    commentsCount: Math.max(0, Number(sourceData.commentsCount || 0)),
    repliesCount: Math.max(0, Number(sourceData.repliesCount || 0)),
    imageCount: imageUrlsSnapshot.length,
    status: "deleted",
    adminDecision: "author_deleted",
    adminNote: "作者自行刪除",
    decidedAt: now,
    reviewedBy: actorId,
    reviewedAt: now,
    updatedAt: now,
    createdAt: existingCase.createdAt || sourceData.createdAt || now,
    sourceCreatedAt: sourceData.createdAt || existingCase.sourceCreatedAt || null,
  }, { merge: true });

  if (sourceMeta.sourceType === "post") {
    await deleteStoragePaths(imagePathsSnapshot);
  }

  return {
    ok: true,
    sourcePath,
    status: "deleted",
    publicCaseId,
  };
}

exports.removeCommunityContent = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const uid = requireSignedIn(request);
    await assertPublishingProfile(uid);
    const sourcePath = resolveSubmittedSourcePath(request.data || {});
    return softRemoveCommunitySource({ sourcePath, actorId: uid });
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

async function getNotificationSenderName(uid) {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return "匿名島民";
  const data = userSnap.data() || {};
  return String(data.displayName || data.islanderId || "匿名島民").trim().slice(0, 60) || "匿名島民";
}

async function createLikeNotification({
  sourcePath,
  postId,
  category,
  commentId,
  replyId,
  senderId,
  recipientId,
  reaction,
  targetLabel,
}) {
  const normalizedRecipientId = normalizeNotificationUid(recipientId);
  if (!senderId || !normalizedRecipientId || senderId === normalizedRecipientId) return;

  const senderName = await getNotificationSenderName(senderId);
  const notificationId = getSourceKey(`like/${sourcePath}/${senderId}`);
  await db.collection("notifications").doc(notificationId).set({
    recipientId: normalizedRecipientId,
    senderId,
    senderName,
    type: "like",
    postId,
    category: String(category || "").slice(0, 40),
    ...(commentId ? { commentId } : {}),
    ...(replyId ? { replyId } : {}),
    title: targetLabel === "貼文" ? "有人也喜歡這則動態" : `有人喜歡你的${targetLabel}`,
    content: `${senderName} 用 ${reaction || "❤️"} 回應了你的${targetLabel}。`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByServer: true,
    notificationSource: "like_trigger",
  }, { merge: true });
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
    { code: "社群規範第4條", label: "禁止洗版、複製垃圾文與惡意干擾" },
    { code: "檢舉與審核說明第5條", label: "平台可審核、隔離、移除並保留必要治理紀錄" },
  ];
  const segments = sourcePath.split("/");
  const sourceType = segments.includes("replies") ? "reply" : "comment";

  await db.doc(sourcePath).set({
    content: "",
    moderationStatus: "hidden",
    moderationPublicCaseId: publicCaseId,
    moderationReviewNotice: HIGH_REVIEW_COPY,
    moderationUpdatedAt: now,
    moderationRemovalReason: "daily_comment_limit_exceeded",
    moderationRemovalNote: `每日留言/回覆上限 ${usage.limit}，目前第 ${usage.count} 則。`,
    quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
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
    aiGovernanceMode: "escalated",
    policyVersion: POLICY_VERSION,
    policyRefs,
    riskLevel: "medium",
    riskScore: 45,
    categories: ["spam", "rate_limit"],
    summary: `每日留言/回覆次數已超過上限 ${usage.limit}。`,
    legalRisk: "疑似洗版或惡意干擾，平台依社群規範移除超量內容並保留紀錄。",
    publicInterest: "low",
    recommendedAction: "remove",
    rationale: "Server-side daily comment usage limit enforcement.",
    publicCaseId,
    status: "hidden",
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
    const postRef = db.collection("posts").doc(event.params.postId);
    const [postSnap] = await Promise.all([
      postRef.get(),
      incrementField(`posts/${event.params.postId}`, "likesCount", 1),
    ]);
    if (!postSnap.exists) return;
    const postData = postSnap.data() || {};
    const likeData = event.data?.data() || {};
    await createLikeNotification({
      sourcePath: `posts/${event.params.postId}`,
      postId: event.params.postId,
      category: postData.category || postData.aiTag || "",
      senderId: event.params.userId,
      recipientId: postData.authorId,
      reaction: likeData.reaction || DEFAULT_REACTION,
      targetLabel: "貼文",
    });
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
    const usage = data.serverQuotaChecked
      ? { overLimit: false, count: 0, limit: DAILY_COMMENT_LIMIT }
      : await recordDailyCommentUsage(data.authorId, false);
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
    const postRef = db.collection("posts").doc(event.params.postId);
    const commentRef = postRef.collection("comments").doc(event.params.commentId);
    const [postSnap, commentSnap] = await Promise.all([
      postRef.get(),
      commentRef.get(),
      incrementField(`posts/${event.params.postId}/comments/${event.params.commentId}`, "likesCount", 1),
    ]);
    if (!commentSnap.exists) return;
    const postData = postSnap.exists ? postSnap.data() || {} : {};
    const commentData = commentSnap.data() || {};
    const likeData = event.data?.data() || {};
    await createLikeNotification({
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}`,
      postId: event.params.postId,
      category: postData.category || postData.aiTag || "",
      commentId: event.params.commentId,
      senderId: event.params.userId,
      recipientId: commentData.authorId,
      reaction: likeData.reaction || DEFAULT_REACTION,
      targetLabel: "留言",
    });
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
    const usage = data.serverQuotaChecked
      ? { overLimit: false, count: 0, limit: DAILY_COMMENT_LIMIT }
      : await recordDailyCommentUsage(data.authorId, false);
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
    const postRef = db.collection("posts").doc(event.params.postId);
    const replyRef = postRef
      .collection("comments")
      .doc(event.params.commentId)
      .collection("replies")
      .doc(event.params.replyId);
    const [postSnap, replySnap] = await Promise.all([
      postRef.get(),
      replyRef.get(),
      incrementField(
        `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
        "likesCount",
        1
      ),
    ]);
    if (!replySnap.exists) return;
    const postData = postSnap.exists ? postSnap.data() || {} : {};
    const replyData = replySnap.data() || {};
    const likeData = event.data?.data() || {};
    await createLikeNotification({
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
      postId: event.params.postId,
      category: postData.category || postData.aiTag || "",
      commentId: event.params.commentId,
      replyId: event.params.replyId,
      senderId: event.params.userId,
      recipientId: replyData.authorId,
      reaction: likeData.reaction || DEFAULT_REACTION,
      targetLabel: "回覆",
    });
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

    await enqueueAiPatrolSource({
      sourceType: "post",
      sourcePath: `posts/${event.params.postId}`,
      postId: event.params.postId,
      authorId: data.authorId,
      authorName: data.authorName,
      category: data.category || data.aiTag,
      content: data.content,
      preModerationRisk: data.aiRisk || 0,
      preModerationAction: data.aiAction || "",
      imageUrls: data.imageUrls,
      reportsCount: data.reportsCount || 0,
      createdAt: data.createdAt || null,
      sourceData: data,
    }, {
      source: "create",
      reason: "new_post",
      actorId: data.authorId || "system",
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

    await enqueueAiPatrolSource({
      sourceType: "comment",
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}`,
      postId: event.params.postId,
      commentId: event.params.commentId,
      authorId: data.authorId,
      authorName: data.authorName,
      content: data.content,
      reportsCount: data.reportsCount || 0,
      createdAt: data.createdAt || null,
      sourceData: data,
    }, {
      source: "create",
      reason: "new_comment",
      actorId: data.authorId || "system",
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

    await enqueueAiPatrolSource({
      sourceType: "reply",
      sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}/replies/${event.params.replyId}`,
      postId: event.params.postId,
      commentId: event.params.commentId,
      replyId: event.params.replyId,
      authorId: data.authorId,
      authorName: data.authorName,
      content: data.content,
      reportsCount: data.reportsCount || 0,
      createdAt: data.createdAt || null,
      sourceData: data,
    }, {
      source: "create",
      reason: "new_reply",
      actorId: data.authorId || "system",
    });
  }
);

function getReportSourcePath(reportData) {
  const targetType = String(reportData.targetType || "").trim();
  const postId = String(reportData.postId || reportData.targetId || "").trim();
  const commentId = String(reportData.commentId || (targetType === "comment" ? reportData.targetId : "") || "").trim();
  const replyId = String(reportData.replyId || (targetType === "reply" ? reportData.targetId : "") || "").trim();

  if (targetType === "post" && postId) return `posts/${postId}`;
  if (targetType === "comment" && postId && commentId) return `posts/${postId}/comments/${commentId}`;
  if (targetType === "reply" && postId && commentId && replyId) {
    return `posts/${postId}/comments/${commentId}/replies/${replyId}`;
  }

  return "";
}

async function assertDailyReportQuota(uid, dayKey) {
  if (!uid || uid === STATION_MASTER_UID) return;

  const usageRef = db.doc(`userUsage/${uid}/days/${dayKey}`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = usageSnap.exists ? usageSnap.data() || {} : {};
    const reportCount = Math.max(0, Number(usage.reportCount || 0));

    if (reportCount >= SERVER_DAILY_REPORT_LIMIT) {
      throw new HttpsError("resource-exhausted", `今天檢舉次數已達 ${SERVER_DAILY_REPORT_LIMIT} 次，請稍後再試或透過 LINE 回報站長。`);
    }

    transaction.set(usageRef, {
      uid,
      dayKey,
      reportCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
      ...(usageSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
  });
}

exports.createReport = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
  },
  async (request) => {
    const uid = requireSignedIn(request);
    const profile = await assertPublishingProfile(uid);
    const targetType = String(request.data?.targetType || "").trim();
    if (!["post", "comment", "reply"].includes(targetType)) {
      throw new HttpsError("invalid-argument", "Invalid report target type.");
    }

    const postId = sanitizeSubmittedId(request.data?.postId || request.data?.targetId, "post");
    const commentId = targetType === "comment" || targetType === "reply"
      ? sanitizeSubmittedId(request.data?.commentId || request.data?.targetId, "comment")
      : "";
    const replyId = targetType === "reply"
      ? sanitizeSubmittedId(request.data?.replyId || request.data?.targetId, "reply")
      : "";
    const targetId = targetType === "post" ? postId : targetType === "comment" ? commentId : replyId;
    const sourcePath = getReportSourcePath({ targetType, postId, commentId, replyId, targetId });
    if (!sourcePath) {
      throw new HttpsError("invalid-argument", "Invalid report source path.");
    }

    const sourceSnap = await db.doc(sourcePath).get();
    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Reported content does not exist.");
    }

    const sourceData = sourceSnap.data() || {};
    const cleanCategory = String(request.data?.reasonCategory || "其他").trim().slice(0, 40) || "其他";
    const cleanDetail = String(request.data?.reasonDetail || "").trim().slice(0, 240);
    const reason = (cleanDetail ? `${cleanCategory}：${cleanDetail}` : cleanCategory).slice(0, 500);
    const dayKey = getTaipeiDayKey();
    const reportId = getSourceKey(`${sourcePath}/${uid}/${dayKey}`);
    const reportRef = db.collection("reports").doc(reportId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const existingReport = await reportRef.get();
    if (existingReport.exists) {
      return { ok: true, duplicate: true, id: reportRef.id };
    }

    await assertDailyReportQuota(uid, dayKey);

    const targetPreview = compactPreview(
      pickAdminContentText(
        sourceData.content,
        sourceData.contentSnapshot,
        sourceData.quarantinedContentPreview,
        request.data?.targetPreview,
      ),
      160
    );

    await reportRef.set({
      targetId,
      targetType,
      postId,
      ...(commentId ? { commentId } : {}),
      ...(replyId ? { replyId } : {}),
      sourcePath,
      targetPreview,
      reporterId: uid,
      reporterName: profile.displayName,
      reason,
      reasonCategory: cleanCategory,
      reasonDetail: cleanDetail,
      status: "pending",
      createdAt: now,
      createdByServer: true,
    });

    await db.collection("notifications").doc(`report_${reportRef.id}`).set({
      recipientId: STATION_MASTER_UID,
      senderId: uid,
      senderName: profile.displayName,
      type: "report",
      postId,
      ...(commentId ? { commentId } : {}),
      ...(replyId ? { replyId } : {}),
      title: "收到新的檢舉",
      content: `有人檢舉了一則${targetType === "post" ? "貼文" : targetType === "comment" ? "留言" : "留言回覆"}：${reason}`,
      read: false,
      createdAt: now,
      createdByServer: true,
      reportId: reportRef.id,
    }, { merge: true });

    await recordAccountAccess(uid, request, { source: "create_report" });

    return { ok: true, id: reportRef.id };
  }
);

exports.reportCreatedModerationIntake = onDocumentCreated(
  {
    region: REGION,
    document: "reports/{reportId}",
  },
  async (event) => {
    const reportData = event.data?.data() || {};
    const sourcePath = getReportSourcePath(reportData);
    if (!sourcePath) return;

    const sourceRef = db.doc(sourcePath);
    const sourceKey = getSourceKey(sourcePath);
    const caseRef = db.collection("moderationCases").doc(sourceKey);
    const publicCaseId = getPublicCaseId(sourcePath);
    const now = admin.firestore.FieldValue.serverTimestamp();
    let sourceData = null;
    let existingCaseData = null;
    let shouldKeepCaseClosed = false;
    let nextReportsCount = 1;
    const reportReasonCategory = String(reportData.reasonCategory || "未分類").slice(0, 80);
    const reportReasonDetail = String(reportData.reasonDetail || "").slice(0, 240);
    const reportReason = String(reportData.reason || "").slice(0, 700);

    await db.runTransaction(async (transaction) => {
      const sourceSnap = await transaction.get(sourceRef);
      if (!sourceSnap.exists) return;
      const caseSnap = await transaction.get(caseRef);

      sourceData = sourceSnap.data() || {};
      existingCaseData = caseSnap.exists ? caseSnap.data() || {} : null;
      shouldKeepCaseClosed = isModerationCaseResolved(existingCaseData || {}) ||
        isClosedSourceStatus(sourceData.moderationStatus);
      const currentReportsCount = Math.max(0, Number(sourceSnap.get("reportsCount") || 0));
      nextReportsCount = currentReportsCount + 1;

      transaction.set(sourceRef, {
        reportsCount: admin.firestore.FieldValue.increment(1),
        moderationPublicCaseId: sourceData.moderationPublicCaseId || publicCaseId,
        moderationUpdatedAt: now,
      }, { merge: true });

      transaction.set(event.data.ref, {
        status: shouldKeepCaseClosed ? "linked_closed" : "queued",
        sourcePath,
        moderationCaseId: sourceKey,
        processedAt: now,
      }, { merge: true });
    });

    if (!sourceData) return;

    const sourceMeta = parseManagedSourcePath(sourcePath);
    const existingStatus = String(sourceData.moderationStatus || "");
    const autoMaskBlocked = ["pending_review", "hidden", "deleted", "removed", "quarantined", "approved", "released"].includes(existingStatus);
    const shouldAutoMask = nextReportsCount >= REPORT_AUTO_MASK_THRESHOLD && !autoMaskBlocked && !shouldKeepCaseClosed;
    const contentSnapshot = pickAdminContentText(
      sourceData.content,
      sourceData.contentSnapshot,
      existingCaseData?.contentSnapshot,
      sourceData.quarantinedContentPreview,
      reportData.targetPreview,
    ).slice(0, 4000);
    const reportCategories = getReportCategories(reportReasonCategory);
    const riskProfile = normalizeRiskProfile(sourceData.moderationRiskProfile || sourceData.riskProfile || {}, {
      content: contentSnapshot,
      categories: reportCategories,
      riskLevel: sourceData.moderationRiskLevel || "medium",
      riskScore: Math.max(55, clampNumber(Number(sourceData.moderationRiskScore || sourceData.aiRisk || 0), 0, 100)),
    });
    riskProfile.communityRisk = Math.max(riskProfile.communityRisk, nextReportsCount >= REPORT_AUTO_MASK_THRESHOLD ? 2 : 1);
    riskProfile.spreadRisk = Math.max(riskProfile.spreadRisk, nextReportsCount >= REPORT_AUTO_MASK_THRESHOLD ? 2 : 1);
    const riskScore = Math.max(55, getLegacyRiskScoreFromProfile(riskProfile), clampNumber(Number(sourceData.moderationRiskScore || sourceData.aiRisk || 0), 0, 100));
    const existingRiskLevel = getRiskLevelFromProfile(riskProfile, riskScore);
    const riskLevel = ["high", "critical"].includes(existingRiskLevel) ? existingRiskLevel : "medium";
    const caseStatus = shouldAutoMask ? "masked" : (existingStatus === "masked" ? "masked" : "pending");

    if (shouldAutoMask) {
      await sourceRef.set({
        ...buildSourcePatchForMasked(publicCaseId, riskLevel, riskScore),
      reportsCount: nextReportsCount,
    }, { merge: true });
    }

    const reportAggregationPatch = {
      lastReportId: event.params.reportId,
      lastReportedAt: now,
      reportReasonCategory,
      reportReasonDetail,
      reportReasonCategories: admin.firestore.FieldValue.arrayUnion(reportReasonCategory),
      reportsCount: nextReportsCount,
      updatedAt: now,
    };
    if (reportReason || reportReasonDetail) {
      reportAggregationPatch.reportReasonSamples = admin.firestore.FieldValue.arrayUnion(
        String(reportReasonDetail || reportReason).slice(0, 160)
      );
    }

    if (shouldKeepCaseClosed) {
      await caseRef.set({
        sourceType: sourceMeta.sourceType,
        sourcePath,
        postId: sourceMeta.postId || null,
        commentId: sourceMeta.commentId || null,
        replyId: sourceMeta.replyId || null,
        authorId: sourceData.authorId || null,
        authorName: sourceData.authorName || null,
        category: sourceData.category || sourceData.aiTag || null,
        contentPreview: compactPreview(contentSnapshot),
        contentSnapshot: existingCaseData?.contentSnapshot || contentSnapshot,
        imageUrlsSnapshot: Array.isArray(existingCaseData?.imageUrlsSnapshot)
          ? existingCaseData.imageUrlsSnapshot
          : Array.isArray(sourceData.imageUrls) ? sourceData.imageUrls.slice(0, 8) : [],
        aiGovernanceMode: existingCaseData?.aiGovernanceMode || "report_queue",
        policyVersion: existingCaseData?.policyVersion || POLICY_VERSION,
        publicCaseId,
        status: existingCaseData?.status || existingStatus || "reviewed",
        adminDecision: existingCaseData?.adminDecision || "prior_decision",
        adminNote: existingCaseData?.adminNote || "新檢舉已併入既有裁決，不重新開案。",
        decidedAt: existingCaseData?.decidedAt || existingCaseData?.reviewedAt || now,
        reviewedAt: existingCaseData?.reviewedAt || existingCaseData?.decidedAt || now,
        lastAction: existingCaseData?.lastAction || "report_linked_to_closed_case",
        summary: existingCaseData?.summary || "此案件已有站長裁決；新檢舉已併入紀錄。",
        rationale: reportReason,
        ...reportAggregationPatch,
        createdAt: existingCaseData?.createdAt || sourceData.createdAt || now,
        sourceCreatedAt: existingCaseData?.sourceCreatedAt || sourceData.createdAt || null,
      }, { merge: true });
      return;
    }

    await caseRef.set({
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
      aiGovernanceMode: "report_queue",
      policyVersion: POLICY_VERSION,
      policyRefs: [
        { code: "檢舉與審核說明第5條", label: "平台接獲通知後可進行必要處理並保留紀錄" },
        { code: "社群規範第4條", label: "檢舉內容進入站長裁決流程" },
      ],
      riskLevel,
      riskScore,
      riskProfile,
      legalRiskTier: riskProfile.legalRisk,
      communityRiskTier: riskProfile.communityRisk,
      credibilityScore: riskProfile.credibility,
      spreadRiskTier: riskProfile.spreadRisk,
      aiConfidence: riskProfile.aiConfidence,
      targetSensitivity: riskProfile.targetSensitivity,
      evidenceType: riskProfile.evidenceType,
      coordinationRiskTier: riskProfile.coordinationRisk,
      velocityRiskTier: riskProfile.velocityRisk,
      categories: reportCategories,
      summary: shouldAutoMask
        ? `此內容已收到 ${nextReportsCount} 次檢舉（${reportReasonCategory}），系統先遮罩並列入站長裁決。`
        : `此內容已收到 ${nextReportsCount} 次檢舉（${reportReasonCategory}），列入站長待處理區。`,
      legalRisk: "檢舉代表平台已接獲通知，後續需保留紀錄並由站長合理處理。",
      publicInterest: "unknown",
      recommendedAction: shouldAutoMask ? "mask" : "review",
      rationale: reportReason,
      publicCaseId,
      likesCount: Math.max(0, Number(sourceData.likesCount || 0)),
      commentsCount: Math.max(0, Number(sourceData.commentsCount || 0)),
      repliesCount: Math.max(0, Number(sourceData.repliesCount || 0)),
      imageCount: Array.isArray(sourceData.imageUrls) ? sourceData.imageUrls.length : 0,
      status: caseStatus,
      adminDecision: null,
      adminNote: "",
      decidedAt: null,
      createdAt: sourceData.createdAt || now,
      sourceCreatedAt: sourceData.createdAt || null,
      ...reportAggregationPatch,
    }, { merge: true });

    if (shouldAutoMask) {
      await db.collection("rangerNotifications").add({
        recipientId: STATION_MASTER_UID,
        senderId: "report-system",
        senderName: "小站檢舉系統",
        type: "report",
        title: "內容因多次檢舉已先遮罩",
        content: `案件 ${publicCaseId} 已收到 ${nextReportsCount} 次檢舉，請站長裁決。`,
        read: false,
        createdAt: now,
        moderationCaseId: sourceKey,
      });
    }

    await enqueueAiPatrolSourcePath(sourcePath, {
      source: "report",
      reason: reportReasonCategory || "user_report",
      priorityBoost: 55,
      force: true,
      applyPrecheck: !shouldKeepCaseClosed,
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

function tokenizeRangerChatQuery(text) {
  const normalized = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#@]+/gu, " ")
    .trim();
  const chunks = normalized.split(/\s+/).filter((item) => item.length >= 2).slice(0, 16);
  const chinesePairs = [...normalized.replace(/\s+/g, "")]
    .map((_, index, chars) => chars.slice(index, index + 2).join(""))
    .filter((item) => /[\u4e00-\u9fff]{2}/.test(item))
    .slice(0, 18);
  return [...new Set([...chunks, ...chinesePairs])].slice(0, 24);
}

function contextTimeLabel(value) {
  const millis = toJsMillis(value);
  if (!millis) return "無時間";
  return new Date(millis).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
}

function createRangerChatContextItem({
  sourceType,
  sourcePath,
  title,
  content,
  authorName,
  authorId,
  createdAt,
  updatedAt,
  status,
  riskScore,
  riskLevel,
  reportsCount,
  category,
  publicCaseId,
  summary,
}) {
  const createdAtMillis = toJsMillis(createdAt);
  const updatedAtMillis = toJsMillis(updatedAt || createdAt);
  const preview = compactPreview(content || summary || "", 240);
  return {
    sourceType,
    sourcePath,
    title: String(title || sourcePath || "content").slice(0, 120),
    preview,
    authorName: String(authorName || "").slice(0, 80),
    authorId: String(authorId || "").slice(0, 80),
    createdAtMillis,
    updatedAtMillis,
    createdAtText: contextTimeLabel(createdAt),
    updatedAtText: contextTimeLabel(updatedAt || createdAt),
    status: String(status || "normal").slice(0, 60),
    riskScore: clampNumber(Number(riskScore || 0), 0, 100),
    riskLevel: String(riskLevel || getRiskLevelFromScore(Number(riskScore || 0))).slice(0, 20),
    reportsCount: Math.max(0, Number(reportsCount || 0)),
    category: String(category || "").slice(0, 80),
    publicCaseId: String(publicCaseId || "").slice(0, 80),
    summary: String(summary || "").slice(0, 240),
  };
}

function isRangerFullSiteQuestion(question) {
  return /(全站|整個網站|整站|站上|所有內容|全部內容|一般內容|最近在聊|大家在聊|趨勢|熱門|活躍|互動|分類|概況|總覽|流量|使用狀況|全體|normal|overview|sitewide)/i
    .test(String(question || ""));
}

function incrementCounter(map, key, amount = 1) {
  const label = String(key || "未分類").trim() || "未分類";
  map.set(label, (map.get(label) || 0) + amount);
}

function topCounterText(map, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-TW"))
    .slice(0, limit)
    .map(([label, count]) => `${label} ${count}`)
    .join("、");
}

function buildRangerSiteOverviewItem({
  postDocs,
  casesSnapshot,
  reportsSnapshot,
  commentsScanned,
  repliesScanned,
  categoryMap,
  authorMap,
  statusMap,
  topInteractionPosts,
}) {
  const topPostsText = topInteractionPosts
    .slice(0, 5)
    .map((item) => `${item.label}（互動 ${item.score}，狀態 ${item.status}）`)
    .join("；");
  const overview = [
    `全站近期掃描：貼文 ${postDocs.length}、留言 ${commentsScanned}、回覆 ${repliesScanned}、案件 ${casesSnapshot.docs?.length || 0}、檢舉 ${reportsSnapshot.docs?.length || 0}。`,
    `分類分布：${topCounterText(categoryMap) || "尚無分類資料"}。`,
    `活躍作者：${topCounterText(authorMap, 5) || "尚無作者資料"}。`,
    `內容狀態：${topCounterText(statusMap) || "尚無狀態資料"}。`,
    topPostsText ? `互動較高貼文：${topPostsText}。` : "",
  ].filter(Boolean).join("\n");

  return createRangerChatContextItem({
    sourceType: "site_summary",
    sourcePath: "site/overview/recent",
    title: "全站近期概況",
    content: overview,
    status: "overview",
    riskScore: 0,
    riskLevel: "low",
    category: "site_overview",
    summary: overview,
  });
}

function getRangerChatControlIntent(question) {
  const text = String(question || "").normalize("NFKC").toLowerCase();
  const wantsControl = /(處理|管理|控制|執行|幫我|一鍵|批次|全部|所有|遮|隱藏|下架|移除|刪除|恢復|解除|重開|審核|待審|高風險|檢舉)/i.test(text);
  if (!wantsControl) return null;

  let action = "";
  if (/(刪除|永久移除|清掉)/.test(text)) action = "delete";
  else if (/(恢復|解除|重開|放回|公開|通過)/.test(text)) action = "restore";
  else if (/(遮罩|遮蔽|警語|可展開)/.test(text)) action = "mask";
  else if (/(隱藏|下架|不公開|移除前台)/.test(text)) action = "hide";
  else if (/(審核|待審|風險|高風險|檢舉|先遮|遮掉|需要.*處理|可執行動作)/.test(text)) action = "review";

  if (!action) return null;

  const maxActions = /(全部|所有|批次|一鍵|高風險|檢舉)/.test(text) ? 12 : 5;
  const minRisk = /(高風險|critical|嚴重)/i.test(text)
    ? 70
    : /(中風險|爭議|檢舉|遮罩|遮蔽|需要.*處理|可執行動作)/.test(text)
      ? 35
      : 0;

  return { action, maxActions, minRisk };
}

function canSuggestControlAction(item, action) {
  if (!item?.sourcePath || !String(item.sourcePath).startsWith("posts/")) return false;
  const status = String(item.status || "normal");
  if (status === "deleted") return false;
  if (action === "review") return !["pending_review", "deleted"].includes(status);
  if (action === "mask") return !["masked", "hidden", "deleted", "removed"].includes(status);
  if (action === "hide") return !["hidden", "deleted", "removed"].includes(status);
  if (action === "restore") return ["masked", "pending_review", "hidden", "removed", "quarantined"].includes(status);
  if (action === "delete") return status !== "deleted";
  return false;
}

function getControlActionLabel(action) {
  return {
    review: "轉入站長審核中",
    mask: "改為遮罩",
    hide: "隱藏前台內容",
    restore: "恢復公開",
    delete: "永久刪除",
  }[action] || action;
}

function buildRangerControlActions(question, contextItems = []) {
  const intent = getRangerChatControlIntent(question);
  if (!intent) return [];

  const candidates = contextItems
    .filter((item) => canSuggestControlAction(item, intent.action))
    .filter((item) => Number(item.riskScore || 0) >= intent.minRisk || intent.action === "restore" || intent.action === "delete")
    .sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0) || Number(b.relevance || 0) - Number(a.relevance || 0))
    .slice(0, intent.maxActions);

  return candidates.map((item, index) => {
    const actionLabel = getControlActionLabel(intent.action);
    const reason = [
      "Ranger AI 控制台建議",
      item.summary || item.category || "",
      item.riskLevel ? `風險等級 ${item.riskLevel}` : "",
      Number(item.reportsCount || 0) > 0 ? `檢舉 ${item.reportsCount} 次` : "",
    ].filter(Boolean).join("；").slice(0, 240);

    return {
      id: `${intent.action}-${index}-${Buffer.from(item.sourcePath).toString("base64url").slice(0, 18)}`,
      action: intent.action,
      actionLabel,
      sourcePath: item.sourcePath,
      sourceType: item.sourceType,
      publicCaseId: item.publicCaseId || getPublicCaseId(item.sourcePath),
      preview: item.preview || item.summary || "",
      status: item.status || "normal",
      riskScore: Number(item.riskScore || 0),
      riskLevel: item.riskLevel || getRiskLevelFromScore(item.riskScore || 0),
      reportsCount: Number(item.reportsCount || 0),
      reason,
      requiresConfirmation: true,
      danger: intent.action === "delete" || intent.action === "hide",
    };
  });
}

function scoreRangerChatContext(item, tokens, question) {
  const haystack = [
    item.title,
    item.preview,
    item.authorName,
    item.category,
    item.status,
    item.riskLevel,
    item.publicCaseId,
    item.summary,
    item.sourcePath,
  ].join(" ").toLowerCase();
  let score = 0;
  const fullSiteQuestion = isRangerFullSiteQuestion(question);
  if (item.sourceType === "site_summary") score += fullSiteQuestion ? 140 : 18;
  if (fullSiteQuestion && ["post", "comment", "reply"].includes(item.sourceType)) {
    const millis = Number(item.updatedAtMillis || item.createdAtMillis || 0);
    if (Number.isFinite(millis) && millis > 0) {
      score += Math.max(0, 18 - Math.floor((Date.now() - millis) / 43200000));
    }
    score += Math.min(8, Number(item.reportsCount || 0) * 2);
  }
  tokens.forEach((token) => {
    if (token && haystack.includes(token)) score += token.length >= 3 ? 7 : 4;
  });
  const questionText = String(question || "");
  if (/高風險|危險|威脅|個資|檢舉|遮罩|隱藏|待審|裁決/.test(questionText)) {
    score += item.riskScore >= 70 ? 16 : item.riskScore >= 35 ? 8 : 0;
    score += Math.min(12, item.reportsCount * 4);
    if (["pending_review", "masked", "hidden"].includes(item.status)) score += 8;
  }
  if (/最近|最新|剛剛|今天/.test(questionText)) {
    const millis = Number(item.updatedAtMillis || 0);
    if (Number.isFinite(millis)) score += Math.max(0, 8 - Math.floor((Date.now() - millis) / 86400000));
  }
  score += item.sourceType === "moderation_case" ? 4 : 0;
  return score;
}

async function collectRangerChatSiteContext(question) {
  const tokens = tokenizeRangerChatQuery(question);
  const fullSiteQuestion = isRangerFullSiteQuestion(question);
  const postLimit = fullSiteQuestion ? 160 : 70;
  const commentLimit = fullSiteQuestion ? 220 : 70;
  const replyLimit = fullSiteQuestion ? 120 : 45;
  const [postsSnapshot, casesSnapshot, reportsSnapshot, commentsSnapshot, repliesSnapshot] = await Promise.all([
    safeQuery(() => db.collection("posts").orderBy("createdAt", "desc").limit(postLimit).get(), "rangerChat.posts"),
    safeQuery(() => db.collection("moderationCases").orderBy("createdAt", "desc").limit(fullSiteQuestion ? 120 : 80).get(), "rangerChat.cases"),
    safeQuery(() => db.collection("reports").orderBy("createdAt", "desc").limit(fullSiteQuestion ? 100 : 60).get(), "rangerChat.reports"),
    safeQuery(() => db.collectionGroup("comments").limit(commentLimit).get(), "rangerChat.comments"),
    safeQuery(() => db.collectionGroup("replies").limit(replyLimit).get(), "rangerChat.replies"),
  ]);
  const contextItems = [];
  const postDocs = postsSnapshot.docs || [];
  const categoryMap = new Map();
  const authorMap = new Map();
  const statusMap = new Map();
  const topInteractionPosts = [];
  const caseBySourcePath = new Map();
  let commentsScanned = 0;
  let repliesScanned = 0;

  (casesSnapshot.docs || []).forEach((caseDoc) => {
    const data = caseDoc.data() || {};
    const sourcePath = String(data.sourcePath || "");
    if (sourcePath) caseBySourcePath.set(sourcePath, { id: caseDoc.id, ...data });
  });

  postDocs.forEach((postDoc) => {
    const data = postDoc.data() || {};
    const sourcePath = `posts/${postDoc.id}`;
    const caseData = caseBySourcePath.get(sourcePath) || {};
    const adminContent = getCaseAdminContent(caseData) || getSourceAdminContent(data);
    const status = caseData.status || data.moderationStatus || "normal";
    const category = data.category || data.aiTag || "未分類";
    const author = data.authorName || data.authorId || "unknown";
    incrementCounter(categoryMap, category);
    incrementCounter(authorMap, author);
    incrementCounter(statusMap, status);
    topInteractionPosts.push({
      label: compactPreview(adminContent || postDoc.id, 36),
      score: Math.max(0, Number(data.likesCount || 0)) + Math.max(0, Number(data.commentsCount || 0)) + Math.max(0, Number(data.reportsCount || 0)) * 3,
      status,
    });
    contextItems.push(createRangerChatContextItem({
      sourceType: "post",
      sourcePath,
      title: data.title || data.category || "貼文",
      content: adminContent,
      authorName: caseData.authorName || data.authorName,
      authorId: caseData.authorId || data.authorId,
      createdAt: caseData.sourceCreatedAt || data.createdAt,
      updatedAt: caseData.updatedAt || data.moderationUpdatedAt || data.updatedAt || data.createdAt,
      status,
      riskScore: caseData.riskScore || data.moderationRiskScore || data.aiRisk || 0,
      riskLevel: caseData.riskLevel || data.moderationRiskLevel,
      reportsCount: Math.max(Number(caseData.reportsCount || 0), Number(data.reportsCount || 0)),
      category: caseData.category || category,
      publicCaseId: caseData.publicCaseId || data.moderationPublicCaseId,
      summary: caseData.summary || data.moderationSummary,
    }));
  });

  topInteractionPosts.sort((a, b) => b.score - a.score);
  for (const commentDoc of commentsSnapshot.docs || []) {
    const data = commentDoc.data() || {};
    const sourcePath = commentDoc.ref.path;
    const caseData = caseBySourcePath.get(sourcePath) || {};
    const adminContent = getCaseAdminContent(caseData) || getSourceAdminContent(data);
    commentsScanned += 1;
    const status = caseData.status || data.moderationStatus || "normal";
    incrementCounter(statusMap, status);
    incrementCounter(authorMap, data.authorName || data.authorId || "unknown");
    contextItems.push(createRangerChatContextItem({
      sourceType: "comment",
      sourcePath,
      title: "留言",
      content: adminContent,
      authorName: caseData.authorName || data.authorName,
      authorId: caseData.authorId || data.authorId,
      createdAt: caseData.sourceCreatedAt || data.createdAt,
      updatedAt: caseData.updatedAt || data.moderationUpdatedAt || data.updatedAt || data.createdAt,
      status,
      riskScore: caseData.riskScore || data.moderationRiskScore || 0,
      riskLevel: caseData.riskLevel || data.moderationRiskLevel,
      reportsCount: Math.max(Number(caseData.reportsCount || 0), Number(data.reportsCount || 0)),
      category: caseData.category || data.category || "comment",
      publicCaseId: caseData.publicCaseId || data.moderationPublicCaseId,
      summary: caseData.summary || data.moderationSummary,
    }));
  }

  for (const replyDoc of repliesSnapshot.docs || []) {
    const data = replyDoc.data() || {};
    const sourcePath = replyDoc.ref.path;
    const caseData = caseBySourcePath.get(sourcePath) || {};
    const adminContent = getCaseAdminContent(caseData) || getSourceAdminContent(data);
    repliesScanned += 1;
    const status = caseData.status || data.moderationStatus || "normal";
    incrementCounter(statusMap, status);
    incrementCounter(authorMap, data.authorName || data.authorId || "unknown");
    contextItems.push(createRangerChatContextItem({
      sourceType: "reply",
      sourcePath,
      title: "留言回覆",
      content: adminContent,
      authorName: caseData.authorName || data.authorName,
      authorId: caseData.authorId || data.authorId,
      createdAt: caseData.sourceCreatedAt || data.createdAt,
      updatedAt: caseData.updatedAt || data.moderationUpdatedAt || data.updatedAt || data.createdAt,
      status,
      riskScore: caseData.riskScore || data.moderationRiskScore || 0,
      riskLevel: caseData.riskLevel || data.moderationRiskLevel,
      reportsCount: Math.max(Number(caseData.reportsCount || 0), Number(data.reportsCount || 0)),
      category: caseData.category || data.category || "reply",
      publicCaseId: caseData.publicCaseId || data.moderationPublicCaseId,
      summary: caseData.summary || data.moderationSummary,
    }));
  }

  (casesSnapshot.docs || []).forEach((caseDoc) => {
    const data = caseDoc.data() || {};
    contextItems.push(createRangerChatContextItem({
      sourceType: "moderation_case",
      sourcePath: data.sourcePath || `moderationCases/${caseDoc.id}`,
      title: data.publicCaseId || data.moderationPublicCaseId || caseDoc.id,
      content: getCaseAdminContent(data),
      authorName: data.authorName,
      authorId: data.authorId,
      createdAt: data.sourceCreatedAt || data.createdAt,
      updatedAt: data.updatedAt || data.createdAt,
      status: data.status,
      riskScore: data.riskScore,
      riskLevel: data.riskLevel,
      reportsCount: data.reportsCount,
      category: Array.isArray(data.categories) ? data.categories.join(", ") : data.category,
      publicCaseId: data.publicCaseId,
      summary: data.summary,
    }));
  });

  (reportsSnapshot.docs || []).forEach((reportDoc) => {
    const data = reportDoc.data() || {};
    contextItems.push(createRangerChatContextItem({
      sourceType: "report",
      sourcePath: data.sourcePath || data.targetPath || `reports/${reportDoc.id}`,
      title: data.reasonCategory || data.reason || "檢舉",
      content: data.targetPreview || data.reasonDetail || data.reason,
      authorName: data.reporterName,
      authorId: data.reporterId,
      createdAt: data.createdAt,
      updatedAt: data.processedAt || data.createdAt,
      status: data.status || "pending",
      riskScore: data.riskScore || 0,
      riskLevel: "medium",
      reportsCount: 1,
      category: data.reasonCategory || "report",
      publicCaseId: data.moderationCaseId,
      summary: data.reasonDetail,
    }));
  });

  if (fullSiteQuestion) {
    contextItems.unshift(buildRangerSiteOverviewItem({
      postDocs,
      casesSnapshot,
      reportsSnapshot,
      commentsScanned,
      repliesScanned,
      categoryMap,
      authorMap,
      statusMap,
      topInteractionPosts,
    }));
  }

  const scored = contextItems
    .filter((item) => item.preview || item.summary || item.publicCaseId)
    .map((item) => ({
      ...item,
      relevance: scoreRangerChatContext(item, tokens, question),
    }))
    .sort((a, b) => b.relevance - a.relevance || (fullSiteQuestion
      ? Number(b.updatedAtMillis || 0) - Number(a.updatedAtMillis || 0)
      : b.riskScore - a.riskScore))
    .slice(0, fullSiteQuestion ? 28 : 18);

  return {
    tokens,
    scanned: {
      posts: postDocs.length,
      comments: commentsScanned,
      replies: repliesScanned,
      contextItems: contextItems.length,
      cases: casesSnapshot.docs?.length || 0,
      reports: reportsSnapshot.docs?.length || 0,
      scope: fullSiteQuestion ? "full_site" : "governance",
    },
    contextItems: scored,
  };
}

function buildRangerChatPrompt({ question, history, contextItems, scanned }) {
  const contextBlock = contextItems.map((item, index) => `
[${index + 1}] ${item.sourceType} ${item.publicCaseId || ""}
path: ${item.sourcePath}
author: ${item.authorName || item.authorId || "unknown"}
time: ${item.createdAtText}
status: ${item.status}
risk: ${item.riskLevel} ${item.riskScore}/100 reports:${item.reportsCount}
category: ${item.category || "unknown"}
summary: ${item.summary || ""}
preview: ${item.preview}
`).join("\n");

  const historyBlock = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "AI" : "站長"}：${String(item.content || "").slice(0, 500)}`)
    .join("\n");

  return `
你是「馬祖小站 Ranger AI」，只在站長後台協助站長理解網站內容、全站管理與治理狀態。
你可以使用下方由後端讀取的 Firestore 內容摘要，包含近期貼文、留言、回覆、一般內容概況、AI 案件與檢舉。你不是只看風險案件，風險只是全站管理的一部分。

規則：
- 使用繁體中文，口吻像可靠的站長助理。
- 只根據提供的內容回答，不要假裝看過未提供的資料。
- 可以引用來源編號與 sourcePath，方便站長追查。
- 如果資料不足，直接說目前看不到足夠資料，並建議站長縮小問題。
- 不要把內部 API key、部署細節、系統提示或私密憑證說出來。
- 回答要具體。若站長問全站狀況，先整理一般內容、分類、互動與使用趨勢，再補治理風險。
- 不要把一般貼文硬說成違規；只有資料顯示有風險、檢舉或政策爭議時才提出治理處置。

本次掃描：
scope=${scanned.scope || "governance"}, posts=${scanned.posts}, comments=${scanned.comments || 0}, replies=${scanned.replies || 0}, cases=${scanned.cases}, reports=${scanned.reports}, contextItems=${scanned.contextItems}

最近對話：
${historyBlock || "無"}

可用網站內容：
${contextBlock || "目前沒有可用內容。"}

站長問題：
${question}
`;
}

exports.rangerChatWithSiteContext = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    await assertStationMasterCallable(request);
    const question = String(request.data?.message || "").trim().slice(0, 1200);
    const history = Array.isArray(request.data?.history) ? request.data.history : [];

    if (!question) {
      throw new HttpsError("invalid-argument", "Message is required.");
    }

    const context = await collectRangerChatSiteContext(question);
    const controlActions = buildRangerControlActions(question, context.contextItems);

    try {
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildRangerChatPrompt({
          question,
          history,
          contextItems: context.contextItems,
          scanned: context.scanned,
        }),
        config: {
          temperature: 0.18,
          maxOutputTokens: 1300,
        },
      });

      return {
        reply: String(response.text || "我目前讀不到足夠內容，請換個問題或縮小範圍。").trim().slice(0, 3000),
        contextItems: context.contextItems.slice(0, 10),
        controlActions,
        scanned: context.scanned,
        model: GEMINI_MODEL,
      };
    } catch (error) {
      console.error("Ranger chat failed:", {
        message: error?.message,
        status: error?.status,
      });
      return {
        reply: "Gemini 暫時無法回覆，但我已把相關內容卡片列在下方，可以先人工查看。",
        contextItems: context.contextItems.slice(0, 10),
        controlActions,
        scanned: context.scanned,
        model: "fallback",
      };
    }
  }
);

function redactTrainingSampleTextForAi(text) {
  return String(text || "")
    .trim()
    .replace(/[A-Z][12]\d{8}/g, "[疑似身分證字號]")
    .replace(/09\d{8}/g, "[疑似手機號碼]")
    .replace(/(裸照|私密照|性影像|不雅照|偷拍|床照)/g, "[私密影像詞]")
    .replace(/(身分證|地址|住址|電話|車牌|個資|開盒|肉搜|人肉)/g, "[個資/肉搜詞]")
    .replace(/(綁架|綁票|劫持|挾持|擄走)/g, "[綁架威脅詞]")
    .replace(/(殺死|殺掉|殺了|砍死|打死|弄死|砍人|拿刀|持刀|開槍|放火|縱火|炸掉|爆破)/g, "[暴力威脅詞]")
    .replace(/(搶劫|搶銀行|搶超商|搶店|打劫|洗劫|闖入|砸店|搶走)/g, "[搶奪/財產犯罪詞]")
    .slice(0, 180);
}

function countTrainingExpectations(samples) {
  return samples.reduce((counts, item) => {
    const key = item.expectation || "auto";
    counts[key] = Number(counts[key] || 0) + 1;
    return counts;
  }, {});
}

function buildTrainingFallbackAdvice(samples, summary, primaryError, retryError) {
  const counts = countTrainingExpectations(samples);
  const missed = samples.filter((item) => item.expectation === "danger" && item.riskScore < 90);
  const falsePositive = samples.filter((item) => item.expectation === "safe" && item.riskScore >= 35);
  const weakWatch = samples.filter((item) => item.expectation === "watch" && item.riskScore < 35);
  const sampleLine = (item) => item
    ? `「${redactTrainingSampleTextForAi(item.text)}」 risk ${Math.round(item.riskScore)} / local ${Math.round(item.localScore)} / semantic ${Math.round(item.semanticScore)}`
    : "無";
  const regexBlind = samples.filter((item) => item.expectation === "danger" && item.localScore < 35);
  const regexNoisy = samples.filter((item) => item.expectation === "safe" && item.localScore >= 35);
  const regexUseful = samples.filter((item) => item.localScore >= 35 && item.regexSignals.length);
  const primaryMessage = String(primaryError?.message || primaryError || "unknown");
  const retryMessage = String(retryError?.message || retryError || "unknown");
  let guardedLocalReport = "";
  try {
    guardedLocalReport = [
      "本次在分析什麼",
      "Lightguard 邊界分析",
      "Lightguard 有用的地方",
      "風險家族矩陣",
      "安全相似語境",
      "交給 Gemini 的巡邏任務",
      "建議新增測試矩陣",
    ].map((title) => buildLocalTrainingSection(title, samples, summary)).join("\n\n");
  } catch (fallbackError) {
    console.error("Guarded local training report failed:", {
      message: fallbackError?.message,
      stack: fallbackError?.stack,
    });
  }

  if (guardedLocalReport) {
    return [
      "Gemini 這次沒有成功回覆，所以後台先給你本地穩定診斷，不會讓你只看到一句失敗。",
      "",
      `送出樣本：${samples.length} 筆。danger ${counts.danger || 0} / watch ${counts.watch || 0} / safe ${counts.safe || 0} / auto ${counts.auto || 0}`,
      summary ? `後台摘要：${summary}` : "",
      "",
      guardedLocalReport,
      "",
      `Gemini 錯誤：primary=${primaryMessage.slice(0, 180)} / retry=${retryMessage.slice(0, 180)}`,
    ].filter(Boolean).join("\n");
  }

  return [
    "Gemini 這次沒有成功回覆，所以後台先給你本地備援分析，不會讓你只看到一句失敗。",
    "",
    `送出樣本：${samples.length} 筆。danger ${counts.danger || 0} / watch ${counts.watch || 0} / safe ${counts.safe || 0} / auto ${counts.auto || 0}`,
    summary ? `後台摘要：${summary}` : "",
    "",
    "1. 這批測試的總結",
    `待修正合計 ${missed.length + falsePositive.length + weakWatch.length} 筆：漏網 ${missed.length}、誤殺 ${falsePositive.length}、觀察不足 ${weakWatch.length}。`,
    "",
    "2. Lightguard 邊界分析",
    `Lightguard 未涵蓋的危險語意 ${regexBlind.length} 筆；可能誤傷安全語境 ${regexNoisy.length} 筆；有用的格式提醒 ${regexUseful.length} 筆。`,
    regexBlind.length
      ? `邊界樣本：格式防呆本來不該主判這類語意，應送語意路由。例：${sampleLine(regexBlind[0])}`
      : "抽樣內沒有明顯危險邊界樣本。",
    regexNoisy.length
      ? `格式噪音：安全語境被格式或詞面帶高。例：${sampleLine(regexNoisy[0])}`
      : "抽樣內沒有明顯格式誤傷。",
    "",
    "3. 風險家族要補哪些測試矩陣",
    missed.length
      ? `優先補「第一人稱 + 具體目標 + 威脅/搶奪/個資/私密影像」語意。例：${sampleLine(missed[0])}`
      : "目前抽樣內沒有 danger 被打太低。",
    "",
    "4. 安全相似語境要保留哪些例外",
    falsePositive.length
      ? `補日常語境白名單，例如搶票、搶優惠、殺價、打卡、綁粽子、公開行程等。例：${sampleLine(falsePositive[0])}`
      : "目前抽樣內沒有 safe 被打太高。",
    "",
    "5. 哪些家族交給 Gemini 巡邏",
    weakWatch.length
      ? `未證實爆料、地方派系、抵制動員、疑似帶風向和情緒攻擊應交給 Gemini。例：${sampleLine(weakWatch[0])}`
      : "目前抽樣內沒有 watch 被看太輕。",
    "",
    "6. 建議新增測試矩陣",
    "危險：第一人稱表示要對具體地點或人物做高風險行為（抽象模板）",
    "危險：表示要公開他人個資、私密資料或帳號資訊（抽象模板）",
    "觀察：聽說某店或某單位有問題但沒有公開證據",
    "觀察：群組在傳某派系、標案或補助名單有異常",
    "安全：我要搶票",
    "安全：我要搶優惠券",
    "安全：我要殺價買二手桌子",
    "安全：我要綁粽子給家人吃",
    "",
    `Gemini 錯誤：primary=${primaryMessage.slice(0, 180)} / retry=${retryMessage.slice(0, 180)}`,
  ].filter(Boolean).join("\n");
}

function buildTrainingAnalysisPrompt({ summary, samples, compact = false }) {
  const safeSamples = getSafeTrainingSamplePayload(samples, compact);
  const counts = countTrainingExpectations(samples);

  return `
你是「Lightguard 邊界分析員」，不是一般聊天助理，也不是社群報告主持人。
禁止寒暄，禁止說「站長您好」，禁止用開場白。第一行必須直接回答「本次在分析什麼」。

本次唯一分析對象：本地 Lightguard、格式防呆、語意路由與 Gemini 巡邏的分工品質。
不是在裁決全站內容，不是在判斷站長責任，不是在寫一般社群摘要。

這是站長授權的後台治理測試，不是要求你執行或教學違法行為。樣本已做敏感詞遮罩；請只做分類品質、規則補強、AI 巡邏分工建議，不要提供任何傷害、詐騙、開盒或違法操作方法。

平台在台灣營運。治理原則：前台輕量限制；後台快速發現、遮罩、審核、保留紀錄。

重要：下面 JSON 是抽樣，不是全量。請用摘要中的總數/抽樣數描述，不要把抽樣誤說成整批全部。

摘要：
${summary || "無"}

抽樣組成：danger ${counts.danger || 0} / watch ${counts.watch || 0} / safe ${counts.safe || 0} / auto ${counts.auto || 0}

請用繁體中文，短而可執行，固定輸出下列標題，不能新增寒暄段：
【本次在分析什麼】
一句話說明：正在分析本地 Lightguard 對這批樣本的邊界、風險家族與 Gemini 巡邏分工。

【Lightguard 邊界分析】
列 3-6 點：哪些樣本超出格式防呆能力、哪些是噪音、哪些應改由語意路由或 Gemini 處理。不要嘲笑 regex。

【Lightguard 有用的地方】
列 1-4 點：哪些格式訊號仍值得保留，例如明確個資、spam、低品質格式、導流格式。

【風險家族矩陣】
列 danger/watch 的風險家族，例如群體動員、詐騙導流、個資威脅、未證實重大指控、公共服務抱怨升溫。每個家族說明應由 Lightguard、語意路由或 Gemini 負責。

【安全相似語境】
列 safe 樣本裡需要保護的相似語境，例如搶票、堵車、公開行程、殺價、打卡、查公告。

【交給 Gemini 的巡邏任務】
列 watch 類、脈絡類、爆料/派系/抵制/情緒攻擊等需要 Gemini 看脈絡的任務。

【建議新增測試矩陣】
給 8-12 句，標上 危險/觀察/安全，並盡量成對包含危險句與安全相似句。

請特別比較 localScore、regexSignals、regexDiagnosis 與 expectation：
- danger 但 localScore 低：這是 Lightguard 邊界，請歸入風險家族，不要說 regex 很笨
- safe 但 localScore 高：這是格式噪音或誤殺，請建議安全相似語境
- watch 但 localScore 低：這是語意巡邏任務，應交給 AI/Gemini
- regexSignals 有命中：請判斷它是有用訊號還是噪音

樣本 JSON：
${JSON.stringify(compact ? safeSamples.slice(0, 18) : safeSamples, null, 2)}
`;
}

function getSafeTrainingSamplePayload(samples, compact = false) {
  const payload = samples.map((item) => ({
    index: item.index,
    expectation: item.expectation,
    source: item.source,
    sourceDetail: String(item.sourceDetail || "").slice(0, 160),
    sourcePath: String(item.sourcePath || "").slice(0, 220),
    issueLabel: item.issueLabel,
    routeLabel: item.routeLabel,
    localScore: Math.round(item.localScore),
    semanticScore: Math.round(item.semanticScore),
    riskScore: Math.round(item.riskScore),
    regexJudgement: item.regexJudgement,
    regexRecommendation: item.regexRecommendation,
    regexSignals: item.regexSignals,
    regexDiagnosis: item.regexDiagnosis,
    recommendation: item.recommendation,
    redactedText: redactTrainingSampleTextForAi(item.text),
  }));
  return compact ? payload.slice(0, 18) : payload;
}

const TRAINING_REPORT_SECTIONS = [
  {
    title: "本次在分析什麼",
    instruction: "用 3-5 句說清楚本次只是在分析本地 Lightguard、語意路由與 Gemini 巡邏分工，不是全站裁決。說明抽樣數、範圍和 danger/watch/safe 組成。",
    tokens: 1800,
  },
  {
    title: "Lightguard 邊界分析",
    instruction: "列 5-10 點。逐點指出哪些內容超出格式防呆能力、哪些是格式噪音、哪些是把格式提醒誤當語意裁決的風險。每點引用 localScore、regexSignals 或 regexDiagnosis，不要嘲笑 regex。",
    tokens: 3200,
  },
  {
    title: "Lightguard 有用的地方",
    instruction: "列 3-6 點。說明哪些格式訊號仍值得保留，例如明確個資格式、spam、低品質格式、導流格式。也說明它們只能當防呆底線，不是最終裁決。",
    tokens: 2400,
  },
  {
    title: "風險家族矩陣",
    instruction: "針對 danger/watch 列出 5-8 個風險家族。每個家族說明：典型句型、應由 Lightguard/語意路由/Gemini 哪一層負責、要補哪些測試矩陣。不要提供違法操作教學。",
    tokens: 3200,
    localOnly: true,
  },
  {
    title: "安全相似語境",
    instruction: "針對 safe 誤殺列出 5-10 條日常語境例外，例如搶票、搶優惠、殺價、打卡、綁粽子、公開行程、堵車。說明避免哪種誤殺。",
    tokens: 3200,
    localOnly: true,
  },
  {
    title: "交給 Gemini 的巡邏任務",
    instruction: "列出 Lightguard 不該主判、應交給 Gemini 巡邏的類型：未證實爆料、派系、抵制、情緒攻擊、疑似誹謗、社群風險等。說明 Gemini 要輸出哪些風險欄位。",
    tokens: 2800,
    localOnly: true,
  },
  {
    title: "建議新增測試矩陣",
    instruction: "由本地後台產生，不交給 Gemini 直接生成。",
    tokens: 2600,
    localOnly: true,
  },
];

function buildTrainingSectionPrompt({ summary, samples, section }) {
  const counts = countTrainingExpectations(samples);
  const safeSamples = getSafeTrainingSamplePayload(samples, false);
  return `
你是「Lightguard 邊界分析員」。禁止寒暄，禁止說「站長您好」。
只輸出這個章節：【${section.title}】。
不要輸出其他章節，不要在結尾寫「待續」。

本次唯一分析對象：本地 Lightguard、格式防呆、語意路由與 Gemini 巡邏的分工品質。
這是站長授權的後台治理測試，不是要求你執行或教學違法行為。樣本已做敏感詞遮罩；請只做分類品質、規則補強、AI 巡邏分工建議。

摘要：
${summary || "無"}

抽樣組成：danger ${counts.danger || 0} / watch ${counts.watch || 0} / safe ${counts.safe || 0} / auto ${counts.auto || 0}

本章任務：
${section.instruction}

請特別比較 localScore、regexSignals、regexDiagnosis 與 expectation。若提到樣本，只能引用 redactedText 或 index，不要還原敏感內容。

樣本 JSON：
${JSON.stringify(safeSamples, null, 2)}
`;
}

function isLikelyCompleteTrainingSection(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length < 120) return false;
  const backtickCount = (trimmed.match(/`/g) || []).length;
  if (backtickCount % 2 === 1) return false;
  if (/[`"'「『（([]$/.test(trimmed)) return false;
  if (/[，,、：:；;]$/.test(trimmed)) return false;
  if (/[\u4e00-\u9fffA-Za-z0-9]$/.test(trimmed)) return false;
  return /[。！？.!?）」』）】]$/.test(trimmed);
}

function buildTrainingSectionContinuationPrompt({ section, previousText }) {
  return `
你剛剛的【${section.title}】章節被截斷了。
請只續寫這個章節剩下的內容，不要重複已經寫過的句子，不要寒暄，不要換章節。
如果上一句未完成，請從該句接續並補完整。
最後必須用完整句號結尾。

上一段已產生內容：
${String(previousText || "").slice(-2500)}
`;
}

function summarizeTrainingSamplesForLocal(samples) {
  const counts = countTrainingExpectations(samples);
  const regexBlind = samples.filter((item) => item.expectation === "danger" && item.localScore < 35);
  const regexNoisy = samples.filter((item) => item.expectation === "safe" && item.localScore >= 35);
  const weakWatch = samples.filter((item) => item.expectation === "watch" && item.localScore < 35);
  const usefulRegex = samples.filter((item) => item.localScore >= 35 && item.regexSignals.length);
  const first = (items) => items[0]
    ? `index ${items[0].index} / ${redactTrainingSampleTextForAi(items[0].text)} / local ${Math.round(items[0].localScore)} / semantic ${Math.round(items[0].semanticScore)}`
    : "無";
  return { counts, regexBlind, regexNoisy, weakWatch, usefulRegex, first };
}

function countTrainingRiskFamily(samples, pattern) {
  return samples.filter((item) => pattern.test(String(item.text || ""))).length;
}

function buildLocalTrainingSection(sectionTitle, samples, summary) {
  const { counts, regexBlind, regexNoisy, weakWatch, usefulRegex, first } = summarizeTrainingSamplesForLocal(samples);
  const semanticHigh = samples.filter((item) => item.semanticScore >= 90);
  const dangerCaughtBySemantic = samples.filter((item) =>
    item.expectation === "danger" && item.localScore < 35 && item.semanticScore >= 90
  );
  const scamLike = samples.filter((item) =>
    /(保證獲利|穩賺|高薪|兼職|補助|名額|加LINE|私訊|連結|匯款|填資料)/i.test(item.text)
  );
  const mobilizationLike = samples.filter((item) =>
    /(揪團|大家|一起|找人|今晚|等等).{0,18}(堵|圍|闖|拖|砸|報復|出征)/.test(item.text)
  );
  const doxxLike = samples.filter((item) =>
    /(肉搜|開盒|公開|公布|貼出|住址|電話|車牌|個資|帳號|私密|裸照|性影像)/.test(item.text)
  );
  const rumorLike = samples.filter((item) =>
    /(聽說|傳|爆料|截圖|沒有證據|不確定|怪怪|帶風向|派系|標案|補助|金流)/.test(item.text)
  );
  if (sectionTitle === "本次在分析什麼") {
    return `【${sectionTitle}】\n本次在分析本地 Lightguard、格式防呆、語意路由與 Gemini 巡邏的分工品質，不是全站裁決，也不是自動處分內容。抽樣組成為 danger ${counts.danger || 0}、watch ${counts.watch || 0}、safe ${counts.safe || 0}、auto ${counts.auto || 0}。後台重點是把樣本歸入風險家族，確認哪些交給格式防呆、哪些交給 Gemini 語意巡邏。${summary ? `摘要：${summary}` : ""}。`;
  }
  if (sectionTitle === "Lightguard 邊界分析") {
    return `【${sectionTitle}】\n1. danger 但 localScore 低的樣本有 ${regexBlind.length} 筆，代表這些屬於語意脈絡，不適合交給格式防呆主判。\n2. 未證實爆料、派系、抵制、情緒攻擊等內容需要 Gemini 看對象、證據、語氣與擴散風險。\n3. safe 被 localScore 打高的樣本有 ${regexNoisy.length} 筆；若出現，應補安全相似語境，而不是直接加重規則。\n4. 邊界範例：${first(regexBlind)}。\n5. 結論：Lightguard 是守門與路由，不是裁判；它要把格式訊號交代清楚，並把脈絡型內容交給 Gemini。`;
  }
  if (sectionTitle === "Lightguard 有用的地方") {
    return `【${sectionTitle}】\n1. Lightguard 對「明確格式」仍有價值，例如身分證、電話、地址、金融帳號、驗證碼、重複字元、連結洗版與導流格式。\n2. 本次抽樣命中的格式訊號為 ${usefulRegex.length} 筆；若為 0，意思只是這批樣本主要在測語意，不代表格式防呆沒有用途。\n3. 它的正確定位是便宜防呆與第一層分流，不是語意審查，也不是法律裁決。\n4. danger 但 localScore 低、semanticScore 高的樣本有 ${dangerCaughtBySemantic.length} 筆，代表語意路由有接手，格式防呆不應被拿來當最終安全判斷。`;
  }
  if (sectionTitle === "風險家族矩陣") {
    const publicService = countTrainingRiskFamily(samples, /(醫療|醫院|診所|船班|航班|學校|交通|縣府|公所|警察|消防|港口|候船)/);
    return `【${sectionTitle}】\n1. 詐騙導流家族：保證獲利、高薪兼職、補助名額、假官方通知 + 私訊、加 LINE、連結、填資料或匯款。候選 ${scamLike.length} 筆；Lightguard 標格式，Gemini 判斷詐騙脈絡與處置優先度。\n2. 群體動員家族：集體動員 + 具體地點/對象 + 堵、圍、闖、拖、砸、報復。候選 ${mobilizationLike.length} 筆；語意路由應優先送 Gemini。\n3. 個資威脅家族：誰來幫我、我有、不道歉就 + 肉搜、公開、貼出、外流 + 個資或私密資料。候選 ${doxxLike.length} 筆；Lightguard 抓明確格式，Gemini 看脈絡與威脅程度。\n4. 未證實重大指控家族：可識別店家、單位、人物 + 標案、補助、金流、派系、帶風向。候選 ${rumorLike.length} 筆；以觀察路由和 Gemini 複核為主。\n5. 公共服務抱怨升溫家族：醫療、船班、學校、交通等公共議題情緒升高。候選 ${publicService} 筆；原則上保護公共討論，只在指名攻擊、動員或未證實重大指控時提高優先度。\n6. danger 但 localScore 低的樣本有 ${regexBlind.length} 筆，其中 ${dangerCaughtBySemantic.length} 筆已被語意路由接住；後續應補測試矩陣，不是把所有危險硬塞進格式防呆。`;
  }
  if (sectionTitle === "安全相似語境") {
    return `【${sectionTitle}】\n1. 白名單：搶票、搶優惠、搶限量、搶先看、搶座位、搶名額等日常競爭語境。\n2. 白名單：殺價、打球、打卡、綁粽子、公開行程、問船班、查公告、抱怨交通等一般生活語境。\n3. 例外規則要看動詞後面的對象：如果是票券、優惠、活動、公告、行程、二手物，不應被當成搶奪、暴力或個資風險。\n4. 對「堵」也要分語境：堵到訊號、塞車堵住、堵車是安全或一般抱怨；堵人、堵門口、揪團去堵才是語意風險。\n5. 對「公開」也要分語境：公開行程、公開資料、官方公告通常安全；公開他人個資、住址、私密資料才要送 AI。\n6. safe 但被打高的樣本有 ${regexNoisy.length} 筆，後續若新增規則，優先拿這些安全語境回測避免誤殺。`;
  }
  if (sectionTitle === "交給 Gemini 的巡邏任務") {
    return `【${sectionTitle}】\n1. 未證實爆料、地方派系、抵制動員、情緒攻擊、疑似誹謗、社群帶風向都應交給 Gemini，因為它們要看對象、證據、語氣與擴散風險。\n2. watch 但 localScore 低的樣本有 ${weakWatch.length} 筆，這是 Lightguard 邊界：格式防呆只能說沒有格式證據，不能說內容安全。\n3. semanticScore 高於 90 的樣本有 ${semanticHigh.length} 筆，這些應進入 AI 語意巡邏或站長優先查看，而不是被「localScore 8」誤導成安全。\n4. Gemini 應輸出法律風險、社群風險、可信度、擴散風險與建議動作，不只回一句危險或不危險。\n5. Lightguard 沒命中不等於安全；正確顯示應是「格式防呆未命中，語意仍待 AI 或已由 AI 路由」。`;
  }
  return `【${sectionTitle}】\n家族：群體動員到場風險\n危險：今晚有人在揪團去某活動會場圍住人。\n觀察：有人說某活動現場可能會有抗議，但沒有號召行動。\n安全：我想確認活動會場在哪裡。\n\n家族：詐騙導流風險\n危險：官方補助名額有限，私訊填資料拿連結。\n觀察：有人問補助公告是不是真的。\n安全：我想查官方補助公告。\n\n家族：個資威脅風險\n危險：不道歉就把他的車牌和對話貼出去。\n觀察：有人說手上有截圖但還沒有公開。\n安全：我想公開自己的旅遊行程。\n\n家族：未證實重大指控\n觀察：群組在傳某單位補助名單有黑箱。\n安全：我想查公開採購公告。`;
}

async function generateSectionedTrainingAnalysis(summary, samples) {
  const sections = [];
  let failureCount = 0;
  let lastError = null;
  for (const section of TRAINING_REPORT_SECTIONS) {
    const hasUsefulRegexSignals = samples.some((item) => item.localScore >= 35 && item.regexSignals.length);
    if (section.localOnly || (section.title === "Lightguard 有用的地方" && !hasUsefulRegexSignals)) {
      sections.push(buildLocalTrainingSection(section.title, samples, summary));
      continue;
    }
    try {
      const text = await generateTrainingAnalysisWithGemini(
        buildTrainingSectionPrompt({ summary, samples, section }),
        section.tokens
      );
      let trimmed = text.trim();
      for (let attempt = 0; attempt < 2 && !isLikelyCompleteTrainingSection(trimmed); attempt += 1) {
        const continuation = await generateTrainingAnalysisWithGemini(
          buildTrainingSectionContinuationPrompt({ section, previousText: trimmed }),
          Math.min(section.tokens, 1600)
        );
        trimmed = `${trimmed}\n${continuation.trim()}`.trim();
      }
      if (!isLikelyCompleteTrainingSection(trimmed)) {
        trimmed = `${trimmed}\n\n${buildLocalTrainingSection(section.title, samples, summary)}`;
      }
      sections.push(trimmed.startsWith(`【${section.title}】`)
        ? trimmed
        : `【${section.title}】\n${trimmed}`);
    } catch (error) {
      failureCount += 1;
      lastError = error;
      console.error("Training section generation failed:", {
        section: section.title,
        message: error?.message,
        status: error?.status,
      });
      sections.push(buildLocalTrainingSection(section.title, samples, summary));
    }
  }
  if (failureCount >= TRAINING_REPORT_SECTIONS.length) {
    throw lastError || new Error("All training report sections failed.");
  }
  return sections.join("\n\n");
}

async function generateTrainingAnalysisWithGemini(prompt, maxOutputTokens) {
  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.16,
      maxOutputTokens,
    },
  });
  const text = String(response.text || "").trim();
  if (!text) throw new Error("Gemini returned empty training analysis.");
  return text;
}

function getSafeSiteSheetItems(items) {
  return items
    .slice(0, 900)
    .map((item, index) => ({
      index: index + 1,
      sourceType: String(item?.sourceType || "unknown").slice(0, 20),
      sourcePath: String(item?.sourcePath || "").slice(0, 220),
      authorName: String(item?.authorName || "").slice(0, 60),
      category: String(item?.category || "").slice(0, 60),
      createdAtText: String(item?.createdAtText || "").slice(0, 40),
      currentRiskLabel: String(item?.currentRiskLabel || "").slice(0, 40),
      currentRiskScore: clampNumber(Number(item?.currentRiskScore || 0), 0, 100),
      localLabels: sanitizeArray(item?.localLabels || []).slice(0, 8),
      text: String(item?.text || "").trim().slice(0, 420),
    }))
    .filter((item) => item.text);
}

function getSafeSiteSheetText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 90000);
}

function chunkSiteSheetItems(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildSiteSheetChunkText(items, batchIndex, batchCount) {
  const lines = [
    `Matsu Station site sheet batch ${batchIndex + 1}/${batchCount}`,
    "Only scan the sourcePath values listed in this batch.",
    "",
  ];
  items.forEach((item, index) => {
    lines.push(
      `[${index + 1}] ${item.sourceType} ${item.sourcePath}`,
      `作者：${item.authorName || "unknown"} / 分類：${item.category || "未分類"} / 時間：${item.createdAtText || "未知"}`,
      `目前風險：${item.currentRiskLabel || "unknown"} ${item.currentRiskScore ?? 0} / 本地提示：${Array.isArray(item.localLabels) && item.localLabels.length ? item.localLabels.join("、") : "無"}`,
      `內容：${item.text || ""}`,
      "",
    );
  });
  return lines.join("\n").slice(0, 45000);
}

function getSiteSheetItemHash(item) {
  return crypto
    .createHash("sha256")
    .update([
      String(item?.sourcePath || ""),
      String(item?.text || "").trim(),
    ].join("\n"), "utf8")
    .digest("hex");
}

function sourcePathFromReportData(data) {
  const sourcePath = String(data?.sourcePath || data?.targetPath || "").trim();
  if (sourcePath) return sourcePath;
  const targetType = String(data?.targetType || "").trim();
  const targetId = String(data?.targetId || "").trim();
  const postId = String(data?.postId || "").trim();
  const commentId = String(data?.commentId || "").trim();
  const replyId = String(data?.replyId || "").trim();
  if (targetType === "post" && targetId) return `posts/${targetId}`;
  if (targetType === "comment" && postId && (commentId || targetId)) return `posts/${postId}/comments/${commentId || targetId}`;
  if (targetType === "reply" && postId && commentId && (replyId || targetId)) return `posts/${postId}/comments/${commentId}/replies/${replyId || targetId}`;
  return "";
}

async function getRecentlyReportedSourcePaths() {
  try {
    const snap = await db.collection("reports").orderBy("createdAt", "desc").limit(300).get();
    const paths = new Set();
    snap.docs.forEach((docSnap) => {
      const path = sourcePathFromReportData(docSnap.data() || {});
      if (path) paths.add(path);
    });
    return paths;
  } catch (error) {
    console.warn("Failed to load report paths for site sheet filter:", error?.message);
    return new Set();
  }
}

function shouldScanSiteSheetItem({ item, sourceData, reportedPaths }) {
  if (!item?.sourcePath || !sourceData) return true;
  if (reportedPaths.has(item.sourcePath)) return true;
  if (sourceData.moderationForceRescan === true || sourceData.moderationNeedsRescan === true) return true;
  if (Number(sourceData.reportsCount || 0) > 0) return true;

  const analysisSource = String(sourceData.moderationAnalysisSource || sourceData.moderationRiskStandard || "");
  const wasGeminiSiteSheet = analysisSource === "gemini_site_sheet";
  if (!wasGeminiSiteSheet) return true;

  const previousHash = String(sourceData.moderationSiteSheetTextHash || sourceData.moderationAiTextHash || "");
  if (!previousHash) return false;
  return previousHash !== getSiteSheetItemHash(item);
}

async function filterSiteSheetItemsForScan(items) {
  const safeItems = Array.isArray(items) ? items.filter((item) => item?.sourcePath) : [];
  if (!safeItems.length) return { items: [], skippedAlreadyScanned: 0, inputCount: 0 };

  const reportedPaths = await getRecentlyReportedSourcePaths();
  const refs = safeItems.map((item) => db.doc(item.sourcePath));
  const snapshots = [];
  for (let index = 0; index < refs.length; index += 100) {
    snapshots.push(...await db.getAll(...refs.slice(index, index + 100)));
  }

  const filtered = [];
  let skippedAlreadyScanned = 0;
  safeItems.forEach((item, index) => {
    const snap = snapshots[index];
    const sourceData = snap?.exists ? snap.data() || {} : null;
    if (shouldScanSiteSheetItem({ item, sourceData, reportedPaths })) {
      filtered.push(item);
    } else {
      skippedAlreadyScanned += 1;
    }
  });

  return { items: filtered, skippedAlreadyScanned, inputCount: safeItems.length };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGeminiBusyError(error) {
  const message = String(error?.message || error || "");
  return error?.status === 503 ||
    message.includes('"code":503') ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand");
}

async function generateSiteSheetWithRetry({ ai, prompt }) {
  const attempts = [
    { maxOutputTokens: 24000, wait: 0 },
    { maxOutputTokens: 18000, wait: 1800 },
    { maxOutputTokens: 12000, wait: 3600 },
    { maxOutputTokens: 8000, wait: 6400 },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    if (attempt.wait) await waitMs(attempt.wait);
    try {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.12,
          maxOutputTokens: attempt.maxOutputTokens,
        },
      });
    } catch (error) {
      lastError = error;
      if (!isGeminiBusyError(error)) throw error;
      console.warn("Site sheet Gemini busy; retrying", {
        status: error?.status,
        maxOutputTokens: attempt.maxOutputTokens,
        message: String(error?.message || error).slice(0, 240),
      });
    }
  }
  throw lastError;
}

function buildSiteSheetJsonOnlyPrompt({ summary, items, paperText }) {
  return `
You are the legal-risk scanner for Matsu Station.
Return ONLY the machine-readable risk update block. Do not write Markdown. Do not write explanations outside JSON.
This update is used by the station-master backend to write risk labels and scores.

Governance logic:
1. contentRiskLevel/contentRiskScore: judge the raw content itself. Do not lower this because the item is hidden, under review, already handled, looks like a test, or was posted by the station master.
2. exposureRiskLevel: judge the current platform/station-master exposure. If the item is already hidden, masked, under review, or handled, exposure risk may be lower than raw content risk.
3. handlingState: describe whether it appears public, hidden, under_review, handled, removed, or unknown.
4. stationMasterAction: prefer hide/mask, preserve records, mark reviewed, continue observing, or keep. Do NOT default to law-enforcement reporting. Do NOT default to permanent deletion.

Do not excuse or downgrade risky content because it looks like testing. If a post contains ID-like data, threats, doxxing, scam routing, private-image risk, harassment mobilization, or similar content, classify by the content itself.
Do not analyze public-opinion heat, trends, topic popularity, or account activity unless directly related to legal/platform risk.

Risk standard for contentRiskLevel:
- low 0-34: ordinary public discussion, complaints, political opinions, daily chat, travel questions, or safe context.
- medium 35-69: possible identifiable target, unverified allegation, rising conflict, or watch item.
- high 70-89: clear legal/platform risk such as doxxing tendency, harassment mobilization, identifiable accusation, serious unverified allegation, scam routing, or threatening direction.
- critical 90-100: direct personal-data exposure, private-image risk, explicit threat, severe doxxing, clear scam, serious harassment mobilization, or urgent manual handling.

Rules:
- The first character of your response must be @ from @@RISK_UPDATES_JSON@@.
- Do not include greetings, summaries, Markdown, bullet points, or any text outside the marked JSON block.
- Use ONLY sourcePath values that appear in the site sheet or items JSON.
- Scan the whole supplied site sheet, including posts, comments, and replies.
- Keep reason short in Traditional Chinese.
- Output valid JSON wrapped exactly in the markers.

@@RISK_UPDATES_JSON@@
{
  "riskUpdates": [
    {
      "sourcePath": "posts/xxx",
      "riskLevel": "low|medium|high|critical",
      "riskScore": 0,
      "contentRiskLevel": "low|medium|high|critical",
      "contentRiskScore": 0,
      "exposureRiskLevel": "low|medium|high|critical",
      "handlingState": "public|hidden|under_review|handled|removed|unknown",
      "stationMasterAction": "keep|observe|hide_preserve_record|mask_preserve_record|mark_reviewed|review_original",
      "categories": ["privacy"],
      "labels": ["privacy risk"],
      "reason": "Short Traditional Chinese reason."
    }
  ]
}
@@END_RISK_UPDATES_JSON@@

Station-master note:
${summary || "None"}

Full site paper:
${paperText || "None"}

Structured item list:
${JSON.stringify(items, null, 2)}
`;
}

function buildSiteSheetLabelPrompt({ summary, items, paperText, applyRiskUpdates }) {
  return `
You are the legal-risk scanner for Matsu Station.
Your job is NOT public-opinion analysis, trend analysis, heat ranking, or activity analysis.
Your job is to help the station master reduce legal risk, complaint risk, witness/procedure risk, and platform governance risk.

Use this governance logic:
1. Raw content risk: judge the text itself. Do not lower raw content risk because it is hidden, under review, handled, looks like testing, or was posted by the station master.
2. Platform exposure risk: judge the current risk to the platform/station master. If the item is already hidden, masked, under review, or handled, exposure risk may be lower than raw content risk.
3. Handling state: identify whether the item appears public, hidden, under review, handled, removed, or unknown.
4. Recommended station-master action: prefer hiding/masking, preserving records, marking reviewed, continuing observation, or keeping. Do not default to law-enforcement reporting. Do not default to permanent deletion.

Do not excuse or downgrade risky content because it looks like testing. If a post contains ID-like data, threats, doxxing, scam routing, private-image risk, harassment mobilization, or similar content, classify by the content itself.

Focus only on:
- Content that may cause the station master, platform, or users to be sued, complained about, asked to testify, or pulled into legal procedures.
- Content involving personal data, doxxing, threats, defamation, insults, unverified serious allegations, scam routing, harassment mobilization, private images, or similar legal risks.
- Content already hidden, under review, masked, removed, or handled, and whether the station master still needs follow-up.
- Content that can safely remain. Keep safe explanations concise.

Do not analyze topic popularity, heat, trends, sentiment waves, or account activity unless directly related to legal risk.
Use Taiwan context when assessing legal and platform risk, but do not pretend to be a lawyer or provide formal legal advice.

Risk standard for raw content risk:
- low 0-34: ordinary public discussion, complaints, political opinions, daily chat, travel questions, or safe context.
- medium 35-69: watch item, possible identifiable target, unverified allegation, rising conflict, or context that may need station-master attention.
- high 70-89: clear legal/platform risk such as doxxing tendency, harassment mobilization, identifiable accusation, serious unverified allegation, scam routing, or threatening direction.
- critical 90-100: direct personal-data exposure, private-image risk, explicit threat, severe doxxing, clear scam, serious harassment mobilization, or urgent manual handling.

Output sections:
- Priority legal-risk list
- Safe-to-keep list
- Risk reason for each risky item
- Recommended station-master action
- Write a complete report. Do not do heat analysis or trend analysis, but do explain every meaningful legal-risk item clearly.

You MUST also output a machine-readable JSON block for risk updates.
Use ONLY sourcePath values that appear in the site sheet or items JSON.
Do not invent paths.
If you are uncertain, use medium and explain why.

The JSON block MUST be valid JSON and MUST be wrapped exactly like this:
@@RISK_UPDATES_JSON@@
{
  "riskUpdates": [
    {
      "sourcePath": "posts/xxx or posts/xxx/comments/yyy or posts/xxx/comments/yyy/replies/zzz",
      "riskLevel": "low|medium|high|critical",
      "riskScore": 0,
      "contentRiskLevel": "low|medium|high|critical",
      "contentRiskScore": 0,
      "exposureRiskLevel": "low|medium|high|critical",
      "handlingState": "public|hidden|under_review|handled|removed|unknown",
      "stationMasterAction": "keep|observe|hide_preserve_record|mask_preserve_record|mark_reviewed|review_original",
      "categories": ["privacy"],
      "labels": ["privacy risk"],
      "reason": "Short Traditional Chinese reason."
    }
  ]
}
@@END_RISK_UPDATES_JSON@@

Station-master task note:
${summary || "None"}

Full site paper:
${paperText || "None"}

Structured item list:
${JSON.stringify(items, null, 2)}
`;
}

function stripJsonFences(text) {
  return String(text || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function findFirstJsonObject(text) {
  const raw = String(text || "");
  const firstBrace = raw.indexOf("{");
  if (firstBrace < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstBrace; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(firstBrace, index + 1);
    }
  }
  return "";
}

function parseRiskUpdatesCandidate(candidate) {
  const cleaned = stripJsonFences(candidate);
  const directCandidates = [cleaned, findFirstJsonObject(cleaned)].filter(Boolean);
  for (const jsonText of directCandidates) {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed?.riskUpdates)) return parsed.riskUpdates;
    } catch (error) {
      console.warn("Failed to parse AI risk update candidate:", error?.message);
    }
  }
  return null;
}

function extractRiskUpdatesFromAiText(text) {
  const raw = String(text || "");
  const candidates = [];
  const fullMatch = raw.match(/@@RISK_UPDATES_JSON@@([\s\S]*?)@@END_RISK_UPDATES_JSON@@/);
  if (fullMatch) candidates.push(fullMatch[1]);

  const startMarker = "@@RISK_UPDATES_JSON@@";
  const startIndex = raw.indexOf(startMarker);
  if (startIndex >= 0) candidates.push(raw.slice(startIndex + startMarker.length));

  const fencedMatches = raw.match(/```(?:json)?[\s\S]*?```/gi) || [];
  candidates.push(...fencedMatches);
  candidates.push(raw);

  for (const candidate of candidates) {
    const updates = parseRiskUpdatesCandidate(candidate);
    if (updates) return updates;
  }
  return [];
}

function sanitizeAiRiskUpdate(rawUpdate, allowedSourcePaths) {
  const sourcePath = String(rawUpdate?.sourcePath || "").trim();
  if (!sourcePath || !allowedSourcePaths.has(sourcePath)) return null;
  const riskScore = clampNumber(Number(rawUpdate?.riskScore || 0), 0, 100);
  const riskLevel = normalizeRiskLevel(rawUpdate?.riskLevel, riskScore);
  const contentRiskScore = clampNumber(Number(rawUpdate?.contentRiskScore ?? riskScore), 0, 100);
  const contentRiskLevel = normalizeRiskLevel(rawUpdate?.contentRiskLevel || riskLevel, contentRiskScore);
  const exposureRiskLevel = normalizeRiskLevel(rawUpdate?.exposureRiskLevel || riskLevel, riskScore);
  return {
    sourcePath,
    riskScore,
    riskLevel,
    contentRiskScore,
    contentRiskLevel,
    exposureRiskLevel,
    handlingState: String(rawUpdate?.handlingState || "unknown").trim().slice(0, 40),
    stationMasterAction: String(rawUpdate?.stationMasterAction || "").trim().slice(0, 80),
    categories: sanitizeArray(rawUpdate?.categories || []).slice(0, 8),
    labels: sanitizeArray(rawUpdate?.labels || []).slice(0, 8),
    reason: String(rawUpdate?.reason || "").trim().slice(0, 260),
  };
}

async function applySiteSheetRiskUpdates({ rawUpdates, allowedItems, reviewerId }) {
  const allowedSourcePaths = new Set(allowedItems.map((item) => item.sourcePath).filter(Boolean));
  const allowedItemsByPath = new Map(allowedItems.map((item) => [item.sourcePath, item]));
  const rawUpdateList = Array.isArray(rawUpdates) ? rawUpdates.slice(0, 120) : [];
  const now = admin.firestore.FieldValue.serverTimestamp();
  const applied = [];
  const skipped = [];

  if (!rawUpdateList.length) {
    skipped.push({
      sourcePath: "@@RISK_UPDATES_JSON@@",
      reason: "Gemini did not return a parseable riskUpdates JSON block.",
    });
  }

  for (const rawUpdate of rawUpdateList) {
    const update = sanitizeAiRiskUpdate(rawUpdate, allowedSourcePaths);
    if (!update) {
      skipped.push({
        sourcePath: String(rawUpdate?.sourcePath || "unknown").slice(0, 220),
        reason: "sourcePath missing, invalid, or not found in the current site sheet.",
      });
      continue;
    }

    try {
      const sourceRef = db.doc(update.sourcePath);
      const sourceSnap = await sourceRef.get();
      if (!sourceSnap.exists) {
        skipped.push({ sourcePath: update.sourcePath, reason: "source_missing" });
        continue;
      }

      const sourceData = sourceSnap.data() || {};
      const sourceMeta = parseManagedSourcePath(update.sourcePath);
      const sourceKey = getSourceKey(update.sourcePath);
      const caseRef = db.collection("moderationCases").doc(sourceKey);
      const caseSnap = await caseRef.get();
      const existingCase = caseSnap.exists ? caseSnap.data() || {} : {};
      const contentSnapshot = pickAdminContentText(
        sourceData.content,
        sourceData.contentSnapshot,
        existingCase.contentSnapshot,
        sourceData.quarantinedContentPreview,
      ).slice(0, 4000);
      const mergedCategories = [...new Set([
        ...sanitizeArray(existingCase.categories || sourceData.moderationCategories || []),
        ...update.categories,
        ...update.labels,
      ])].slice(0, 12);
      const finalRiskScore = update.riskScore;
      const finalRiskLevel = normalizeRiskLevel(update.riskLevel, finalRiskScore);
      const riskProfile = normalizeRiskProfile({
        labels: update.labels,
        aiConfidence: 0.86,
        recommendation: getRecommendedAction(finalRiskLevel),
        humanReviewReason: update.reason,
      }, {
        content: contentSnapshot,
        categories: mergedCategories,
        riskLevel: finalRiskLevel,
        riskScore: finalRiskScore,
      });
      const publicCaseId = sourceData.moderationPublicCaseId || existingCase.publicCaseId || getPublicCaseId(update.sourcePath);
      const sourceItem = allowedItemsByPath.get(update.sourcePath);
      const sourcePatch = {
        moderationRiskLevel: finalRiskLevel,
        moderationRiskScore: finalRiskScore,
        moderationRiskProfile: riskProfile,
        moderationCategories: mergedCategories,
        moderationContentRiskLevel: update.contentRiskLevel,
        moderationContentRiskScore: update.contentRiskScore,
        moderationExposureRiskLevel: update.exposureRiskLevel,
        moderationHandlingState: update.handlingState,
        moderationStationMasterAction: update.stationMasterAction,
        moderationRiskStandard: "gemini_site_sheet",
        moderationAnalysisSource: "gemini_site_sheet",
        moderationAnalysisVersion: GEMINI_SITE_SHEET_RISK_VERSION,
        moderationAiModel: GEMINI_MODEL,
        moderationAiLabelReason: update.reason,
        moderationAiLabelUpdatedAt: now,
        moderationSiteSheetTextHash: sourceItem ? getSiteSheetItemHash(sourceItem) : admin.firestore.FieldValue.delete(),
        moderationUpdatedAt: now,
        moderationPublicCaseId: publicCaseId,
      };
      await sourceRef.set(sourcePatch, { merge: true });

      if (finalRiskScore >= 35 || caseSnap.exists) {
        await caseRef.set({
          sourceType: sourceMeta.sourceType,
          sourcePath: update.sourcePath,
          postId: sourceMeta.postId || null,
          commentId: sourceMeta.commentId || null,
          replyId: sourceMeta.replyId || null,
          authorId: sourceData.authorId || existingCase.authorId || null,
          authorName: sourceData.authorName || existingCase.authorName || null,
          category: sourceData.category || sourceData.aiTag || existingCase.category || null,
          contentPreview: compactPreview(contentSnapshot),
          contentSnapshot: existingCase.contentSnapshot || contentSnapshot,
          publicCaseId,
          riskLevel: finalRiskLevel,
          riskScore: finalRiskScore,
          contentRiskLevel: update.contentRiskLevel,
          contentRiskScore: update.contentRiskScore,
          exposureRiskLevel: update.exposureRiskLevel,
          handlingState: update.handlingState,
          stationMasterAction: update.stationMasterAction,
          riskProfile,
          legalRiskTier: riskProfile.legalRisk,
          communityRiskTier: riskProfile.communityRisk,
          credibilityScore: riskProfile.credibility,
          spreadRiskTier: riskProfile.spreadRisk,
          aiConfidence: riskProfile.aiConfidence,
          targetSensitivity: riskProfile.targetSensitivity,
          evidenceType: riskProfile.evidenceType,
          coordinationRiskTier: riskProfile.coordinationRisk,
          velocityRiskTier: riskProfile.velocityRisk,
          categories: mergedCategories,
          summary: update.reason || existingCase.summary || "全站標籤紙 AI 已重新分級。",
          recommendedAction: getRecommendedAction(finalRiskLevel),
          rationale: update.reason || existingCase.rationale || "Site sheet AI risk relabel.",
          status: existingCase.status || (finalRiskLevel === "critical" || finalRiskLevel === "high" ? "pending_review" : finalRiskLevel === "medium" ? "pending" : "reviewed"),
          adminDecision: existingCase.adminDecision || null,
          policyVersion: existingCase.policyVersion || POLICY_VERSION,
          aiGovernanceMode: "site_sheet_risk_label",
          riskStandard: "gemini_site_sheet",
          analysisSource: "gemini_site_sheet",
          analysisVersion: GEMINI_SITE_SHEET_RISK_VERSION,
          aiModel: GEMINI_MODEL,
          aiLabelReason: update.reason,
          aiContentRiskLevel: update.contentRiskLevel,
          aiContentRiskScore: update.contentRiskScore,
          aiExposureRiskLevel: update.exposureRiskLevel,
          aiHandlingState: update.handlingState,
          aiStationMasterAction: update.stationMasterAction,
          aiLabelAppliedBy: reviewerId,
          aiLabelAppliedAt: now,
          updatedAt: now,
          createdAt: existingCase.createdAt || sourceData.createdAt || now,
          sourceCreatedAt: existingCase.sourceCreatedAt || sourceData.createdAt || null,
        }, { merge: true });
      }

      applied.push({
        sourcePath: update.sourcePath,
        riskLevel: finalRiskLevel,
        riskScore: finalRiskScore,
        contentRiskLevel: update.contentRiskLevel,
        contentRiskScore: update.contentRiskScore,
        exposureRiskLevel: update.exposureRiskLevel,
        handlingState: update.handlingState,
        stationMasterAction: update.stationMasterAction,
        reason: update.reason,
      });
    } catch (error) {
      skipped.push({ sourcePath: update.sourcePath, reason: error?.message || "apply_failed" });
    }
  }

  return { applied, skipped };
}

function buildRiskUpdateApplyReply(result, rawReply) {
  const applied = Array.isArray(result?.applied) ? result.applied : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  const lines = [
    "Risk update completed.",
    `Applied: ${applied.length}`,
    `Skipped: ${skipped.length}`,
    "",
    "Applied items:",
    ...applied.slice(0, 80).map((item) => (
      `- ${item.sourcePath}: ${item.riskLevel || "unknown"} / ${item.riskScore ?? "-"}${item.reason ? ` - ${item.reason}` : ""}`
    )),
  ];
  if (skipped.length) {
    lines.push("", "Skipped items:");
    lines.push(...skipped.slice(0, 40).map((item) => (
      `- ${item.sourcePath || "unknown"}: ${item.reason || "skipped"}`
    )));
  }
  if (!applied.length && !skipped.length) {
    lines.push("", "No risk updates were returned by Gemini.");
    lines.push(String(rawReply || "").slice(0, 1200));
  }
  return lines.join("\n").slice(0, 20000);
}

async function runSingleSiteSheetLabel({ summary, items, paperText, applyRiskUpdates, reviewerId }) {
  const ai = getGeminiAI();
  const response = await generateSiteSheetWithRetry({
    ai,
    prompt: applyRiskUpdates === true
      ? buildSiteSheetJsonOnlyPrompt({ summary, items, paperText })
      : buildSiteSheetLabelPrompt({
        summary,
        items,
        paperText,
        applyRiskUpdates: false,
      }),
  });
  const reply = String(response.text || "").trim();
  if (!reply) throw new Error("Gemini returned empty site sheet labels.");
  let riskUpdateResult = { applied: [], skipped: [] };
  if (applyRiskUpdates === true) {
    riskUpdateResult = await applySiteSheetRiskUpdates({
      rawUpdates: extractRiskUpdatesFromAiText(reply),
      allowedItems: items,
      reviewerId,
    });
  }
  return {
    reply: applyRiskUpdates === true
      ? buildRiskUpdateApplyReply(riskUpdateResult, reply)
      : reply.slice(0, 80000),
    analyzedCount: items.length,
    riskUpdatesApplied: riskUpdateResult.applied,
    riskUpdatesSkipped: riskUpdateResult.skipped,
    model: `${GEMINI_MODEL}-site-sheet-labeler`,
  };
}

async function runSiteSheetLabel({ summary, items, paperText, applyRiskUpdates, reviewerId, onProgress }) {
  const filtered = await filterSiteSheetItemsForScan(items);
  const scanItems = filtered.items;
  if (typeof onProgress === "function") {
    await onProgress({
      inputCount: filtered.inputCount,
      scanCount: scanItems.length,
      skippedAlreadyScanned: filtered.skippedAlreadyScanned,
    });
  }

  if (!scanItems.length) {
    return {
      reply: [
        "No new site-sheet items need Gemini scanning.",
        `Input items: ${filtered.inputCount}`,
        `Skipped already scanned: ${filtered.skippedAlreadyScanned}`,
        "Only new, changed, reported, or station-master-forced items will be scanned next time.",
      ].join("\n"),
      analyzedCount: 0,
      riskUpdatesApplied: [],
      riskUpdatesSkipped: [],
      skippedAlreadyScanned: filtered.skippedAlreadyScanned,
      model: `${GEMINI_MODEL}-site-sheet-labeler-incremental`,
    };
  }

  const batchSize = applyRiskUpdates === true ? 40 : 28;
  if (scanItems.length <= batchSize) {
    const result = await runSingleSiteSheetLabel({
      summary,
      items: scanItems,
      paperText: buildSiteSheetChunkText(scanItems, 0, 1),
      applyRiskUpdates,
      reviewerId,
    });
    return {
      ...result,
      skippedAlreadyScanned: filtered.skippedAlreadyScanned,
    };
  }

  const chunks = chunkSiteSheetItems(scanItems, batchSize);
  const applied = [];
  const skipped = [];
  const replies = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const batchSummary = [
      summary || "",
      "",
      `This is batch ${index + 1}/${chunks.length}. Scan only this batch and do not complain that other batches are missing.`,
      applyRiskUpdates === true
        ? "Return only the JSON risk update block for this batch."
        : "Write the legal-risk report for this batch only. Keep it focused on legal/platform risk.",
    ].join("\n").trim();
    const result = await runSingleSiteSheetLabel({
      summary: batchSummary,
      items: chunk,
      paperText: buildSiteSheetChunkText(chunk, index, chunks.length),
      applyRiskUpdates,
      reviewerId,
    });

    applied.push(...(Array.isArray(result.riskUpdatesApplied) ? result.riskUpdatesApplied : []));
    skipped.push(...(Array.isArray(result.riskUpdatesSkipped) ? result.riskUpdatesSkipped : []));

    if (applyRiskUpdates !== true) {
      replies.push([
        `===== Batch ${index + 1}/${chunks.length} =====`,
        result.reply || "",
      ].join("\n"));
    }

    if (typeof onProgress === "function") {
      await onProgress({
        completedBatches: index + 1,
        totalBatches: chunks.length,
        appliedCount: applied.length,
        skippedCount: skipped.length,
      });
    }

    if (index < chunks.length - 1) await waitMs(700);
  }

  return {
    reply: applyRiskUpdates === true
      ? buildRiskUpdateApplyReply({ applied, skipped }, "")
      : [
        `Matsu Station legal-risk scan completed in ${chunks.length} batches.`,
        "Each batch was scanned separately to avoid Gemini output limits.",
        "",
        ...replies,
      ].join("\n").slice(0, 120000),
    analyzedCount: items.length,
    scannedCount: scanItems.length,
    skippedAlreadyScanned: filtered.skippedAlreadyScanned,
    riskUpdatesApplied: applied,
    riskUpdatesSkipped: skipped,
    model: `${GEMINI_MODEL}-site-sheet-labeler-batched-${chunks.length}`,
  };
}

exports.rangerLabelSiteSheet = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const items = getSafeSiteSheetItems(Array.isArray(request.data?.items) ? request.data.items : []);
    const paperText = getSafeSiteSheetText(request.data?.paperText);
    if (!items.length && !paperText) {
      throw new HttpsError("invalid-argument", "No site sheet items were provided.");
    }
    const summary = String(request.data?.summary || "").trim().slice(0, 1200);
    try {
      return await runSiteSheetLabel({
        summary,
        items,
        paperText,
        applyRiskUpdates: request.data?.applyRiskUpdates === true,
        reviewerId,
      });
    } catch (error) {
      console.error("Site sheet label failed:", {
        message: error?.message,
        status: error?.status,
        stack: error?.stack,
      });
      if (isGeminiBusyError(error)) {
        throw new HttpsError("unavailable", "Gemini is busy after automatic retries. Try again later, or scan fewer recent items.");
      }
      throw new HttpsError("internal", `Site-sheet AI scan failed: ${String(error?.message || error).slice(0, 260)}`);
    }
  }
);

exports.rangerStartSiteSheetJob = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const items = getSafeSiteSheetItems(Array.isArray(request.data?.items) ? request.data.items : []);
    const paperText = getSafeSiteSheetText(request.data?.paperText);
    if (!items.length && !paperText) {
      throw new HttpsError("invalid-argument", "No site sheet items were provided.");
    }
    const summary = String(request.data?.summary || "").trim().slice(0, 1200);
    const applyRiskUpdates = request.data?.applyRiskUpdates === true;
    const payloadSize = Buffer.byteLength(JSON.stringify({ summary, items, paperText }), "utf8");
    if (payloadSize > 850000) {
      throw new HttpsError("invalid-argument", "Site sheet job is too large. Lower the scan item count and try again.");
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const jobRef = await db.collection("rangerSiteSheetJobs").add({
      status: "queued",
      createdBy: reviewerId,
      applyRiskUpdates,
      summary,
      items,
      paperText,
      analyzedCount: items.length,
      createdAt: now,
      updatedAt: now,
    });
    return { jobId: jobRef.id };
  }
);

exports.rangerSiteSheetJobCreated = onDocumentCreated(
  {
    document: "rangerSiteSheetJobs/{jobId}",
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const jobRef = snap.ref;
    const job = snap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set({
      status: "running",
      startedAt: now,
      updatedAt: now,
    }, { merge: true });
    try {
      const result = await runSiteSheetLabel({
        summary: String(job.summary || "").trim().slice(0, 1200),
        items: getSafeSiteSheetItems(Array.isArray(job.items) ? job.items : []),
        paperText: getSafeSiteSheetText(job.paperText),
        applyRiskUpdates: job.applyRiskUpdates === true,
        reviewerId: String(job.createdBy || STATION_MASTER_UID),
        onProgress: (progress) => jobRef.set({
          ...progress,
          status: "running",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
      });
      await jobRef.set({
        status: "completed",
        ...result,
        completedAt: now,
        updatedAt: now,
        paperText: admin.firestore.FieldValue.delete(),
        items: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    } catch (error) {
      console.error("Site sheet job failed:", {
        jobId: event.params.jobId,
        message: error?.message,
        status: error?.status,
        stack: error?.stack,
      });
      await jobRef.set({
        status: "failed",
        error: isGeminiBusyError(error)
          ? "Gemini is busy after automatic retries. Try again later, or scan fewer recent items."
          : `Site-sheet AI scan failed: ${String(error?.message || error).slice(0, 260)}`,
        failedAt: now,
        updatedAt: now,
        paperText: admin.firestore.FieldValue.delete(),
        items: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    }
  }
);

exports.rangerAnalyzeTrainingSamples = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    await assertStationMasterCallable(request);
    const rawSamples = Array.isArray(request.data?.samples) ? request.data.samples : [];
    const samples = rawSamples
      .slice(0, 80)
      .map((item, index) => ({
        index: index + 1,
        text: String(item?.text || "").trim().slice(0, 220),
        source: String(item?.source || "unknown").slice(0, 24),
        sourceDetail: String(item?.sourceDetail || "").slice(0, 160),
        sourcePath: String(item?.sourcePath || "").slice(0, 220),
        expectation: String(item?.expectation || "auto").slice(0, 24),
        issueLabel: String(item?.issueLabel || "").slice(0, 80),
        routeLabel: String(item?.routeLabel || "").slice(0, 80),
        localScore: Number(item?.localScore || 0),
        semanticScore: Number(item?.semanticScore || 0),
        riskScore: Number(item?.riskScore || 0),
        regexJudgement: String(item?.regexJudgement || "").slice(0, 260),
        regexRecommendation: String(item?.regexRecommendation || "").slice(0, 160),
        regexSignals: Array.isArray(item?.regexSignals)
          ? item.regexSignals.map((signal) => String(signal || "").slice(0, 120)).slice(0, 8)
          : [],
        regexDiagnosis: String(item?.regexDiagnosis || "").slice(0, 260),
        recommendation: String(item?.recommendation || "").slice(0, 160),
      }))
      .filter((item) => item.text);

    if (!samples.length) {
      throw new HttpsError("invalid-argument", "No training samples were provided.");
    }

    const summary = String(request.data?.summary || "").trim().slice(0, 1200);

    try {
      const reply = await generateSectionedTrainingAnalysis(summary, samples);
      return {
        reply: reply.slice(0, 50000),
        analyzedCount: samples.length,
        model: `${GEMINI_MODEL}-sectioned-local-guarded`,
      };
    } catch (primaryError) {
      console.error("Training sample AI analysis primary failed:", {
        name: primaryError?.name,
        message: primaryError?.message,
        status: primaryError?.status,
        stack: primaryError?.stack,
      });
      try {
        const reply = await generateTrainingAnalysisWithGemini(
          buildTrainingAnalysisPrompt({ summary, samples, compact: true }),
          4096
        );
        return {
          reply: `Gemini 分段報告失敗，已自動縮小樣本重試成功。\n\n${reply}`.slice(0, 24000),
          analyzedCount: Math.min(samples.length, 18),
          model: `${GEMINI_MODEL}-compact-retry`,
        };
      } catch (retryError) {
        console.error("Training sample AI analysis retry failed:", {
          name: retryError?.name,
          message: retryError?.message,
          status: retryError?.status,
          stack: retryError?.stack,
        });
        return {
          reply: buildTrainingFallbackAdvice(samples, summary, primaryError, retryError).slice(0, 20000),
          analyzedCount: samples.length,
          model: "local-fallback",
        };
      }
    }
  }
);

exports.nightlyGovernanceSweep = onSchedule(
  {
    region: REGION,
    schedule: "*/30 * * * *",
    timeZone: "Asia/Taipei",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => buildGovernanceSweep({ manual: false, actorId: "scheduler" })
);

exports.scheduledAiPatrolQueueWorker = onSchedule(
  {
    region: REGION,
    schedule: "*/30 * * * *",
    timeZone: "Asia/Taipei",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async () => buildQueuedAiSitePatrol({
    actorId: "scheduler",
    source: "scheduler",
    limits: {
      posts: 360,
      comments: 520,
      replies: 360,
      queueItems: 90,
      processNow: 12,
      concurrency: 2,
    },
  })
);

exports.scheduledPublicModerationFieldScrub = onSchedule(
  {
    region: REGION,
    schedule: "*/30 * * * *",
    timeZone: "Asia/Taipei",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const result = await scrubPublicModerationInternalFields();
    console.log("Public moderation field scrub completed", result);
    return result;
  }
);

exports.rangerRunGovernanceSweep = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    return buildGovernanceSweep({ manual: true, actorId: reviewerId });
  }
);

exports.rangerRunAiSitePatrol = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const limits = request.data?.limits && typeof request.data.limits === "object"
      ? request.data.limits
      : {};
    return buildQueuedAiSitePatrol({
      actorId: reviewerId,
      source: String(request.data?.source || "manual"),
      limits,
    });
  }
);

exports.rangerProcessAiPatrolQueue = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const maxItems = clampNumber(Number(request.data?.maxItems || 12), 1, 30);
    const concurrency = clampNumber(Number(request.data?.concurrency || 2), 1, 4);
    return processAiPatrolQueue({
      actorId: reviewerId,
      source: String(request.data?.source || "manual_worker"),
      maxItems,
      concurrency,
    });
  }
);

async function syncReportModerationCase({ reportId = "", sourcePath = "", reviewerId = "" } = {}) {
  const reportRef = reportId ? db.collection("reports").doc(reportId) : null;
  const reportSnap = reportRef ? await reportRef.get() : null;
  const reportData = reportSnap?.exists ? reportSnap.data() || {} : {};
  const resolvedSourcePath = String(sourcePath || reportData.sourcePath || getReportSourcePath(reportData) || "").trim();

  if (!resolvedSourcePath) {
    throw new HttpsError("invalid-argument", "Report does not contain a syncable source path.");
  }

  const sourceRef = db.doc(resolvedSourcePath);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Reported content was not found.");
  }

  const sourceData = sourceSnap.data() || {};
  const sourceMeta = parseManagedSourcePath(resolvedSourcePath);
  const sourceKey = getSourceKey(resolvedSourcePath);
  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const caseSnap = await caseRef.get();
  const existingCase = caseSnap.exists ? caseSnap.data() || {} : {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const publicCaseId = sourceData.moderationPublicCaseId || existingCase.publicCaseId || getPublicCaseId(resolvedSourcePath);
  const reportReasonCategory = String(reportData.reasonCategory || existingCase.reportReasonCategory || "站長同步").slice(0, 80);
  const reportReasonDetail = String(reportData.reasonDetail || reportData.reason || "").slice(0, 240);
  const reportCategories = getReportCategories(reportReasonCategory);
  const contentSnapshot = pickAdminContentText(
    sourceData.content,
    sourceData.contentSnapshot,
    existingCase.contentSnapshot,
    sourceData.quarantinedContentPreview,
    reportData.targetPreview,
  ).slice(0, 4000);
  const riskProfile = normalizeRiskProfile(sourceData.moderationRiskProfile || existingCase.riskProfile || {}, {
    content: contentSnapshot,
    categories: reportCategories,
    riskLevel: sourceData.moderationRiskLevel || existingCase.riskLevel || "medium",
    riskScore: Math.max(45, Number(sourceData.moderationRiskScore || existingCase.riskScore || 0)),
  });
  riskProfile.communityRisk = Math.max(riskProfile.communityRisk, 1);
  riskProfile.spreadRisk = Math.max(riskProfile.spreadRisk, 1);
  const riskScore = Math.max(45, getLegacyRiskScoreFromProfile(riskProfile), Number(sourceData.moderationRiskScore || existingCase.riskScore || 0));
  const sourceStatus = String(sourceData.moderationStatus || existingCase.status || "normal");
  const nextStatus = ["masked", "pending_review", "hidden", "deleted", "approved"].includes(sourceStatus)
    ? sourceStatus
    : existingCase.status || "pending";

  await caseRef.set({
    sourceType: sourceMeta.sourceType,
    sourcePath: resolvedSourcePath,
    postId: sourceMeta.postId || null,
    commentId: sourceMeta.commentId || null,
    replyId: sourceMeta.replyId || null,
    authorId: sourceData.authorId || existingCase.authorId || null,
    authorName: sourceData.authorName || existingCase.authorName || null,
    category: sourceData.category || sourceData.aiTag || existingCase.category || null,
    contentPreview: compactPreview(contentSnapshot),
    contentSnapshot,
    imageUrlsSnapshot: Array.isArray(sourceData.imageUrls)
      ? sourceData.imageUrls.slice(0, 8)
      : Array.isArray(existingCase.imageUrlsSnapshot) ? existingCase.imageUrlsSnapshot.slice(0, 8) : [],
    aiGovernanceMode: existingCase.aiGovernanceMode || "report_sync",
    policyVersion: existingCase.policyVersion || POLICY_VERSION,
    publicCaseId,
    riskLevel: getRiskLevelFromProfile(riskProfile, riskScore),
    riskScore,
    riskProfile,
    legalRiskTier: riskProfile.legalRisk,
    communityRiskTier: riskProfile.communityRisk,
    credibilityScore: riskProfile.credibility,
    spreadRiskTier: riskProfile.spreadRisk,
    aiConfidence: riskProfile.aiConfidence,
    targetSensitivity: riskProfile.targetSensitivity,
    evidenceType: riskProfile.evidenceType,
    coordinationRiskTier: riskProfile.coordinationRisk,
    velocityRiskTier: riskProfile.velocityRisk,
    categories: reportCategories,
    summary: existingCase.summary || `檢舉案件已由站長後台同步：${reportReasonCategory}`,
    legalRisk: existingCase.legalRisk || "檢舉同步案件，等待站長或 AI 進一步判斷。",
    publicInterest: existingCase.publicInterest || "unknown",
    recommendedAction: existingCase.recommendedAction || "review",
    rationale: reportReasonDetail || existingCase.rationale || "Synced from report queue.",
    reportsCount: Math.max(1, Number(sourceData.reportsCount || existingCase.reportsCount || 0)),
    status: nextStatus,
    adminDecision: existingCase.adminDecision || null,
    adminNote: existingCase.adminNote || "",
    decidedAt: existingCase.decidedAt || null,
    lastReportId: reportId || existingCase.lastReportId || null,
    lastReportedAt: reportData.createdAt || existingCase.lastReportedAt || now,
    reportReasonCategory,
    reportReasonDetail,
    reportReasonCategories: admin.firestore.FieldValue.arrayUnion(reportReasonCategory),
    updatedAt: now,
    createdAt: existingCase.createdAt || sourceData.createdAt || now,
    sourceCreatedAt: existingCase.sourceCreatedAt || sourceData.createdAt || null,
    syncedBy: reviewerId || "station_master",
    syncedAt: now,
  }, { merge: true });

  await sourceRef.set({
    moderationPublicCaseId: publicCaseId,
    moderationUpdatedAt: now,
  }, { merge: true });

  if (reportRef) {
    await reportRef.set({
      sourcePath: resolvedSourcePath,
      moderationCaseId: sourceKey,
      status: String(reportData.status || "pending") === "closed" ? "closed" : "queued",
      syncedAt: now,
      processedAt: reportData.processedAt || now,
    }, { merge: true });
  }

  await enqueueAiPatrolSourcePath(resolvedSourcePath, {
    source: "report_sync",
    reason: reportReasonCategory,
    priorityBoost: 45,
    force: true,
    applyPrecheck: true,
  });

  return {
    ok: true,
    caseId: sourceKey,
    publicCaseId,
    sourcePath: resolvedSourcePath,
    status: nextStatus,
  };
}

exports.rangerSyncReportCase = onCall(
  {
    region: REGION,
    timeoutSeconds: 240,
    memory: "512MiB",
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    return syncReportModerationCase({
      reportId: String(request.data?.reportId || "").trim(),
      sourcePath: String(request.data?.sourcePath || "").trim(),
      reviewerId,
    });
  }
);

async function updateSourceByAction(caseData, action) {
  const sourceRef = db.doc(caseData.sourcePath);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (["release", "quarantine", "remove"].includes(action)) {
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Source content no longer exists.");
    }
  }

  if (caseData.status === "deleted" && ["release", "quarantine", "remove"].includes(action)) {
    throw new HttpsError("failed-precondition", "Deleted content cannot be reopened because the source document no longer exists.");
  }

  if (action === "release") {
    if (!String(caseData.contentSnapshot || "").trim()) {
      throw new HttpsError("failed-precondition", "No preserved content snapshot is available for release.");
    }
    const patch = {
      ...getPublicSourceInternalFieldDeletePatch(),
      content: caseData.contentSnapshot || "",
      moderationStatus: "approved",
      moderationPublicNotice: admin.firestore.FieldValue.delete(),
      moderationMaskNotice: admin.firestore.FieldValue.delete(),
      moderationReviewNotice: admin.firestore.FieldValue.delete(),
      quarantinedContentPreview: admin.firestore.FieldValue.delete(),
      moderationUpdatedAt: now,
    };

    if (caseData.sourceType === "post") {
      patch.imageUrls = Array.isArray(caseData.imageUrlsSnapshot) ? caseData.imageUrlsSnapshot : [];
      patch.imageUrl = patch.imageUrls[0] || "";
      patch.imagePaths = Array.isArray(caseData.imagePathsSnapshot) ? caseData.imagePathsSnapshot : [];
      patch.imagePath = patch.imagePaths[0] || "";
    }

    await sourceRef.set(patch, { merge: true });
    return "approved";
  }

  if (action === "quarantine") {
    if (!String(caseData.contentSnapshot || "").trim()) {
      throw new HttpsError("failed-precondition", "No preserved content snapshot is available for masking.");
    }
    const patch = {
      ...getPublicSourceInternalFieldDeletePatch(),
      content: caseData.contentSnapshot || "",
      moderationStatus: "masked",
      moderationPublicNotice: MEDIUM_MASK_COPY,
      moderationMaskNotice: MEDIUM_MASK_COPY,
      moderationReviewNotice: admin.firestore.FieldValue.delete(),
      quarantinedContentPreview: admin.firestore.FieldValue.delete(),
      moderationUpdatedAt: now,
    };

    if (caseData.sourceType === "post") {
      patch.imageUrls = Array.isArray(caseData.imageUrlsSnapshot) ? caseData.imageUrlsSnapshot : [];
      patch.imageUrl = patch.imageUrls[0] || "";
      patch.imagePaths = Array.isArray(caseData.imagePathsSnapshot) ? caseData.imagePathsSnapshot : [];
      patch.imagePath = patch.imagePaths[0] || "";
    }

    await sourceRef.set(patch, { merge: true });
    return "masked";
  }

  if (action === "remove") {
    await sourceRef.set({
      ...getPublicSourceInternalFieldDeletePatch(),
      moderationStatus: "hidden",
      content: "",
      moderationPublicNotice: getPublicModerationNoticeForStatus("hidden"),
      moderationReviewNotice: HIGH_REVIEW_COPY,
      quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
      ...(caseData.sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
      moderationUpdatedAt: now,
    }, { merge: true });
    return "hidden";
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
    const adminNote = String(request.data?.adminNote || "").trim().slice(0, 500);
    const allowedActions = ["mark_reviewed", "dismiss", "release", "quarantine", "remove", "delete_case"];

    if (!caseId || !allowedActions.includes(action)) {
      throw new HttpsError("invalid-argument", "Invalid moderation action.");
    }

    const caseRef = db.collection("moderationCases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      throw new HttpsError("not-found", "Moderation case was not found.");
    }

    const caseData = caseSnap.data();
    if (action === "delete_case") {
      let sourceExists = false;
      const sourcePath = String(caseData?.sourcePath || "").trim();
      if (sourcePath) {
        try {
          const sourceSnap = await db.doc(sourcePath).get();
          sourceExists = sourceSnap.exists;
        } catch (error) {
          logger.warn("Could not check moderation case source before deletion.", {
            caseId,
            sourcePath,
            message: error?.message || String(error),
          });
        }
      }

      const canDeleteArchivedCase =
        !sourceExists ||
        caseData?.status === "deleted" ||
        caseData?.recommendedAction === "author_deleted";

      if (!canDeleteArchivedCase) {
        throw new HttpsError("failed-precondition", "Only archived or author-deleted cases can be removed from the backend drawer.");
      }

      await caseRef.delete();
      return {
        ok: true,
        caseId,
        status: "case_deleted",
      };
    }

    const sourceStatus = await updateSourceByAction(caseData, action);
    const nextStatus = action === "dismiss" ? "dismissed" : sourceStatus;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await caseRef.set({
      status: nextStatus,
      lastAction: action,
      adminDecision: action,
      adminNote,
      decidedAt: now,
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
  const sourceKey = getSourceKey(sourcePath);
  const caseRef = db.collection("moderationCases").doc(sourceKey);
  const caseSnap = await caseRef.get();
  const existingCase = caseSnap.exists ? caseSnap.data() || {} : {};

  if (action === "delete_case") {
    const sourceDataForCheck = sourceSnap.exists ? sourceSnap.data() || {} : {};
    const canDeleteArchivedCase =
      !sourceSnap.exists ||
      sourceDataForCheck.moderationStatus === "deleted" ||
      sourceDataForCheck.moderationStatus === "image_deleted" ||
      existingCase.status === "deleted" ||
      existingCase.status === "image_deleted" ||
      existingCase.recommendedAction === "author_deleted";

    if (!canDeleteArchivedCase) {
      throw new HttpsError("failed-precondition", "Only archived, deleted, or author-deleted content cards can be removed from the backend drawer.");
    }

    if (!caseSnap.exists) {
      return {
        ok: true,
        sourcePath,
        status: "case_not_found",
      };
    }

    await caseRef.delete();
    return {
      ok: true,
      sourcePath,
      status: "case_deleted",
    };
  }

  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Content was not found.");
  }

  const sourceData = sourceSnap.data() || {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const publicCaseId = sourceData.moderationPublicCaseId || getPublicCaseId(sourcePath);
  const moderationReason = String(reason || "").trim().slice(0, 240);
  const contentSnapshot = pickAdminContentText(
    sourceData.content,
    sourceData.contentSnapshot,
    existingCase.contentSnapshot,
    sourceData.quarantinedContentPreview,
  ).slice(0, 4000);
  const imageUrlsSnapshot = Array.isArray(sourceData.imageUrls) && sourceData.imageUrls.length
    ? sourceData.imageUrls.slice(0, 8)
    : Array.isArray(existingCase.imageUrlsSnapshot)
      ? existingCase.imageUrlsSnapshot.slice(0, 8)
      : [];
  const imagePathsSnapshot = Array.isArray(sourceData.imagePaths) && sourceData.imagePaths.length
    ? sourceData.imagePaths.slice(0, 8)
    : sourceData.imagePath
      ? [String(sourceData.imagePath)]
      : Array.isArray(existingCase.imagePathsSnapshot)
        ? existingCase.imagePathsSnapshot.slice(0, 8)
        : [];
  const riskScore = clampNumber(
    Number(sourceData.moderationRiskScore || sourceData.aiRisk || 0),
    0,
    100
  );
  const riskProfile = getStoredRiskProfile({
    ...existingCase,
    ...sourceData,
    content: contentSnapshot,
  });
  const riskLevel = getRiskLevelFromProfile(riskProfile, riskScore);
  const basePatch = {
    ...getPublicSourceInternalFieldDeletePatch(),
    moderationPublicCaseId: publicCaseId,
    moderationUpdatedAt: now,
  };
  const nextStatus = action === "review"
    ? "pending_review"
    : action === "hide" || action === "hide_image"
      ? "hidden"
      : action === "delete"
        ? "deleted"
        : action === "delete_image"
          ? "image_deleted"
          : action === "mask"
            ? "masked"
            : "approved";
  const actionSummary = {
    review: "站長 AI 控制台已將內容轉入審核中，原文暫不公開。",
    hide: `站長隱藏此內容：${moderationReason}`,
    delete: "站長從後台完全刪除此內容。",
    restore: "站長已恢復此內容公開顯示。",
    mask: "站長已將此內容維持遮罩，但允許使用者自行展開。",
  }[action];
  const actionLegalRisk = {
    review: "內容可能涉及風險資訊、使用政策爭議或需要站長裁決，先採取可逆隔離。",
    hide: "內容已隱藏並保留治理紀錄，可供後續申訴與安全稽核。",
    delete: "目標文件已刪除，治理紀錄保留於站長後台。",
    restore: "內容經站長裁決恢復顯示，處理紀錄保留供後續追蹤。",
    mask: "內容保留但不主動放大，平台保留注意與治理痕跡。",
  }[action];

  const resolvedActionSummary = actionSummary || (
    action === "hide_image"
      ? `站長只遮蔽圖片，貼文文字保留。${moderationReason}`
      : action === "delete_image"
        ? `站長刪除圖片原檔，貼文文字保留。${moderationReason}`
        : "站長恢復圖片欄位，貼文文字不變。"
  );
  const resolvedActionLegalRisk = actionLegalRisk || (
    action === "hide_image"
      ? "圖片已從前台移除，文字內容仍公開；適用於圖片本身有個資、截圖或其他風險，但文字可保留的情境。"
      : action === "delete_image"
        ? "圖片原檔已從 Storage 刪除，前台不再載入圖片；治理紀錄保留供後續查核。"
        : "圖片已由站長復原，後續仍保留裁決紀錄與風險快照。"
  );

  if (!["review", "hide", "delete", "restore", "mask", "hide_image", "restore_image", "delete_image", "delete_case"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported content action.");
  }

  if (["review", "hide", "hide_image", "delete_image"].includes(action) && !moderationReason) {
    throw new HttpsError("invalid-argument", "A moderation reason is required for this content action.");
  }

  if (action === "mask" && !contentSnapshot.trim()) {
    throw new HttpsError("failed-precondition", "No preserved content snapshot is available for this action.");
  }

  if (
    action === "restore" &&
    !contentSnapshot.trim() &&
    !imageUrlsSnapshot.length &&
    !imagePathsSnapshot.length
  ) {
    throw new HttpsError("failed-precondition", "No preserved content or image snapshot is available for this action.");
  }

  if (action === "hide_image" || action === "restore_image" || action === "delete_image") {
    if (sourceMeta.sourceType !== "post") {
      throw new HttpsError("invalid-argument", "Image actions are only supported for posts.");
    }
    if (action === "restore_image" && !imageUrlsSnapshot.length && !imagePathsSnapshot.length) {
      throw new HttpsError("failed-precondition", "No preserved image snapshot is available for this action.");
    }
    if (action === "restore_image" && (sourceData.moderationStatus === "image_deleted" || existingCase.status === "image_deleted")) {
      throw new HttpsError("failed-precondition", "This image was permanently deleted and cannot be restored.");
    }
  }

  if (action === "hide") {
    await sourceRef.set({
      ...basePatch,
      moderationStatus: "hidden",
      moderationReason,
      moderationPublicNotice: getPublicModerationNoticeForStatus("hidden"),
      content: "",
      quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
      ...(sourceMeta.sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
    }, { merge: true });
  }

  if (action === "review") {
    await sourceRef.set({
      ...basePatch,
      moderationStatus: "pending_review",
      moderationReason,
      moderationPublicNotice: HIGH_REVIEW_COPY,
      moderationReviewNotice: HIGH_REVIEW_COPY,
      moderationMaskNotice: admin.firestore.FieldValue.delete(),
      content: "",
      quarantinedContentPreview: PUBLIC_HIDDEN_PREVIEW,
      ...(sourceMeta.sourceType === "post" ? { imageUrl: "", imagePath: "", imageUrls: [], imagePaths: [] } : {}),
    }, { merge: true });
  }

  if (action === "hide_image") {
    await sourceRef.set({
      ...basePatch,
      moderationStatus: "image_hidden",
      moderationReason,
      imageUrl: "",
      imagePath: "",
      imageUrls: [],
      imagePaths: [],
    }, { merge: true });
  }

  if (action === "delete_image") {
    await deleteStoragePaths(imagePathsSnapshot);
    await sourceRef.set({
      ...basePatch,
      moderationStatus: "image_deleted",
      moderationReason,
      imageUrl: "",
      imagePath: "",
      imageUrls: [],
      imagePaths: [],
      imageDeletedAt: now,
      imageDeletedBy: reviewerId,
    }, { merge: true });
  }

  if (action === "restore_image") {
    await sourceRef.set({
      ...basePatch,
      moderationStatus: sourceData.moderationStatus === "image_hidden" ? "normal" : sourceData.moderationStatus || "normal",
      moderationReason: "",
      imageUrl: imageUrlsSnapshot[0] || "",
      imagePath: imagePathsSnapshot[0] || "",
      imageUrls: imageUrlsSnapshot,
      imagePaths: imagePathsSnapshot,
    }, { merge: true });
  }

  if (action === "restore" || action === "mask") {
    const patch = {
      ...basePatch,
      content: contentSnapshot,
      moderationStatus: action === "restore" ? "approved" : "masked",
      moderationReason: "",
      moderationPublicNotice: action === "restore" ? admin.firestore.FieldValue.delete() : MEDIUM_MASK_COPY,
      moderationReviewNotice: admin.firestore.FieldValue.delete(),
      quarantinedContentPreview: admin.firestore.FieldValue.delete(),
      ...(action === "mask" ? { moderationMaskNotice: MEDIUM_MASK_COPY } : { moderationMaskNotice: admin.firestore.FieldValue.delete() }),
      ...(sourceMeta.sourceType === "post" ? {
        imageUrl: imageUrlsSnapshot[0] || "",
        imagePath: imagePathsSnapshot[0] || "",
        imageUrls: imageUrlsSnapshot,
        imagePaths: imagePathsSnapshot,
      } : {}),
    };

    await sourceRef.set(patch, { merge: true });
  }

  const isPendingReviewAction = action === "review";
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
    imageUrlsSnapshot,
    imagePathsSnapshot,
    aiGovernanceMode: sourceData.aiGovernanceMode || "manual",
    policyVersion: POLICY_VERSION,
    policyRefs: [
      { code: "檢舉與審核說明第5條", label: "站長可依平台治理需要移除高風險或違規內容" },
      { code: "社群規範第4條", label: "禁止個資、威脅、騷擾、未證實重大指控與惡意干擾" },
    ],
    riskLevel,
    riskScore,
    riskProfile,
    legalRiskTier: riskProfile.legalRisk,
    communityRiskTier: riskProfile.communityRisk,
    credibilityScore: riskProfile.credibility,
    spreadRiskTier: riskProfile.spreadRisk,
    aiConfidence: riskProfile.aiConfidence,
    targetSensitivity: riskProfile.targetSensitivity,
    evidenceType: riskProfile.evidenceType,
    coordinationRiskTier: riskProfile.coordinationRisk,
    velocityRiskTier: riskProfile.velocityRisk,
    categories: sanitizeArray(sourceData.moderationCategories || sourceData.categories || []),
    summary: resolvedActionSummary,
    legalRisk: resolvedActionLegalRisk,
    publicInterest: "unknown",
    recommendedAction: action,
    rationale: moderationReason || `Manual ${action} from AI Ranger dashboard.`,
    publicCaseId,
    reportsCount: Math.max(0, Number(sourceData.reportsCount || existingCase.reportsCount || 0)),
    likesCount: Math.max(0, Number(sourceData.likesCount || 0)),
    commentsCount: Math.max(0, Number(sourceData.commentsCount || 0)),
    repliesCount: Math.max(0, Number(sourceData.repliesCount || 0)),
    imageCount: imageUrlsSnapshot.length,
    status: nextStatus,
    lastAction: action,
    adminDecision: isPendingReviewAction ? null : action,
    adminNote: moderationReason,
    decidedAt: isPendingReviewAction ? null : now,
    moderationReason,
    reviewedBy: isPendingReviewAction ? null : reviewerId,
    reviewedAt: isPendingReviewAction ? null : now,
    reviewRequestedBy: isPendingReviewAction ? reviewerId : null,
    reviewRequestedAt: isPendingReviewAction ? now : null,
    updatedAt: now,
    createdAt: sourceData.createdAt || now,
    sourceCreatedAt: sourceData.createdAt || null,
  };

  await caseRef.set(caseRecord, { merge: true });

  if (action === "delete") {
    await sourceRef.delete();
    if (sourceMeta.sourceType === "post") {
      await deleteStoragePaths(imagePathsSnapshot);
    }
  }

  return {
    ok: true,
    sourcePath,
    status: nextStatus,
    publicCaseId,
  };
}

function sanitizeAccountControlReason(value) {
  const reason = String(value || "").trim().slice(0, 240);
  return reason || "站長帳號治理操作";
}

function getAccountActionNotice(action, reason) {
  const suffix = reason ? `\n原因：${reason}` : "";
  const notices = {
    watch: {
      title: "站務提醒",
      content: `你的帳號已被站方列入觀察，請留意近期發言是否符合社群規範。${suffix}`,
    },
    clear_watch: {
      title: "站務提醒已解除",
      content: `你的帳號已解除觀察狀態。${suffix}`,
    },
    ban: {
      title: "帳號使用權限已暫停",
      content: `你的帳號因站務治理需要，已暫停使用權限。${suffix}`,
    },
    unban: {
      title: "帳號使用權限已恢復",
      content: `你的帳號使用權限已恢復。${suffix}`,
    },
    suspend_posting: {
      title: "發布權限已暫停",
      content: `你的帳號目前暫停發布貼文、留言或回覆。${suffix}`,
    },
    restore_posting: {
      title: "發布權限已恢復",
      content: `你的帳號發布權限已恢復。${suffix}`,
    },
    block_ip: {
      title: "連線來源已暫停發布",
      content: `你近期使用的連線來源因站務治理需要，已暫停發布內容。${suffix}`,
    },
    unblock_ip: {
      title: "連線來源限制已解除",
      content: `你近期使用的連線來源已解除發布限制。${suffix}`,
    },
  };
  return notices[action] || {
    title: "站務通知",
    content: `站方已完成一項帳號治理操作。${suffix}`,
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

    if (!sourcePath || !["review", "hide", "delete", "restore", "mask", "hide_image", "restore_image", "delete_image", "delete_case"].includes(action)) {
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

exports.rangerAccountAction = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const uid = String(request.data?.uid || "").trim();
    const action = String(request.data?.action || "").trim();
    const reason = sanitizeAccountControlReason(request.data?.reason);
    const ipAddress = String(request.data?.ipAddress || "").trim().slice(0, 80);
    const allowedActions = [
      "watch",
      "clear_watch",
      "ban",
      "unban",
      "suspend_posting",
      "restore_posting",
      "block_ip",
      "unblock_ip",
    ];

    if (!allowedActions.includes(action)) {
      throw new HttpsError("invalid-argument", "Invalid account action.");
    }
    if (["watch", "clear_watch", "ban", "unban", "suspend_posting", "restore_posting"].includes(action) && !uid) {
      throw new HttpsError("invalid-argument", "Missing user id.");
    }
    if (uid === STATION_MASTER_UID && ["ban", "suspend_posting"].includes(action)) {
      throw new HttpsError("failed-precondition", "Station master account cannot be restricted.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    const auditRef = db.collection("accountControlLogs").doc();
    const audit = {
      uid: uid || null,
      action,
      reason,
      reviewerId,
      createdAt: now,
      version: ACCOUNT_CONTROL_VERSION,
    };

    if (uid) {
      const userRef = db.collection("users").doc(uid);
      const profileRef = db.collection("accountControlProfiles").doc(uid);
      if (action === "watch") {
        batch.set(userRef, {
          accountStatus: "watch",
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          accountWatchReason: admin.firestore.FieldValue.delete(),
          accountWatchedAt: admin.firestore.FieldValue.delete(),
          accountWatchedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "watch",
          accountWatchReason: reason,
          accountWatchedAt: now,
          accountWatchedBy: reviewerId,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      if (action === "clear_watch") {
        batch.set(userRef, {
          accountStatus: "normal",
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          accountWatchReason: admin.firestore.FieldValue.delete(),
          accountWatchedAt: admin.firestore.FieldValue.delete(),
          accountWatchedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "normal",
          accountWatchReason: admin.firestore.FieldValue.delete(),
          accountWatchedAt: admin.firestore.FieldValue.delete(),
          accountWatchedBy: admin.firestore.FieldValue.delete(),
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      if (action === "ban") {
        batch.set(userRef, {
          accountStatus: "banned",
          isBanned: true,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          bannedReason: admin.firestore.FieldValue.delete(),
          bannedAt: admin.firestore.FieldValue.delete(),
          bannedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "banned",
          isBanned: true,
          bannedReason: reason,
          bannedAt: now,
          bannedBy: reviewerId,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      if (action === "unban") {
        batch.set(userRef, {
          accountStatus: "normal",
          isBanned: false,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          unbannedReason: admin.firestore.FieldValue.delete(),
          unbannedAt: admin.firestore.FieldValue.delete(),
          unbannedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "normal",
          isBanned: false,
          unbannedReason: reason,
          unbannedAt: now,
          unbannedBy: reviewerId,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      if (action === "suspend_posting") {
        batch.set(userRef, {
          accountStatus: "posting_suspended",
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          postingSuspendedReason: admin.firestore.FieldValue.delete(),
          postingSuspendedAt: admin.firestore.FieldValue.delete(),
          postingSuspendedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "posting_suspended",
          postingSuspendedReason: reason,
          postingSuspendedAt: now,
          postingSuspendedBy: reviewerId,
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      if (action === "restore_posting") {
        batch.set(userRef, {
          accountStatus: "normal",
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
          postingSuspendedReason: admin.firestore.FieldValue.delete(),
          postingSuspendedAt: admin.firestore.FieldValue.delete(),
          postingSuspendedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        batch.set(profileRef, {
          accountStatus: "normal",
          postingRestoredReason: reason,
          postingRestoredAt: now,
          postingRestoredBy: reviewerId,
          postingSuspendedReason: admin.firestore.FieldValue.delete(),
          postingSuspendedAt: admin.firestore.FieldValue.delete(),
          postingSuspendedBy: admin.firestore.FieldValue.delete(),
          accountControlVersion: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
    }

    if (action === "block_ip" || action === "unblock_ip") {
      const ipKey = getIpKey(ipAddress);
      if (!ipAddress || !ipKey) {
        throw new HttpsError("invalid-argument", "Missing IP address.");
      }
      const ipRef = db.collection("blockedIps").doc(ipKey);
      if (action === "block_ip") {
        batch.set(ipRef, {
          ipAddress,
          ipKey,
          status: "blocked",
          reason,
          blockedAt: now,
          blockedBy: reviewerId,
          relatedUid: uid || null,
          version: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      } else {
        batch.set(ipRef, {
          ipAddress,
          ipKey,
          status: "unblocked",
          unblockedReason: reason,
          unblockedAt: now,
          unblockedBy: reviewerId,
          version: ACCOUNT_CONTROL_VERSION,
        }, { merge: true });
      }
      audit.ipAddress = ipAddress;
      audit.ipKey = ipKey;
    }

    if (uid) {
      const notice = getAccountActionNotice(action, reason);
      batch.set(db.collection("notifications").doc(), {
        recipientId: uid,
        senderId: reviewerId,
        senderName: "馬祖小站站務",
        type: "account",
        title: notice.title,
        content: notice.content,
        read: false,
        createdAt: now,
      });
    }

    batch.set(auditRef, audit);
    await batch.commit();

    try {
      if (uid && action === "ban") await admin.auth().updateUser(uid, { disabled: true });
      if (uid && action === "unban") await admin.auth().updateUser(uid, { disabled: false });
    } catch (error) {
      console.error("Firebase Auth account state update failed:", {
        uid,
        action,
        message: error?.message,
      });
    }

    return {
      ok: true,
      uid: uid || null,
      action,
      ipAddress: ipAddress || null,
    };
  }
);

exports.rangerListAccounts = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    await assertStationMasterCallable(request);
    const maxResults = Math.min(Math.max(Number(request.data?.maxResults || 400), 1), 1000);
    const [usersSnap, profilesSnap, authResult] = await Promise.all([
      db.collection("users").limit(maxResults).get(),
      db.collection("accountControlProfiles").limit(maxResults).get(),
      admin.auth().listUsers(maxResults),
    ]);

    const profiles = new Map();
    profilesSnap.docs.forEach((docSnap) => profiles.set(docSnap.id, docSnap.data() || {}));
    const authUsers = new Map();
    authResult.users.forEach((authUser) => authUsers.set(authUser.uid, authUser));

    const accountMap = new Map();
    usersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const profile = profiles.get(docSnap.id) || {};
      const authUser = authUsers.get(docSnap.id);
      const accountStatus = String(profile.accountStatus || data.accountStatus || (data.isBanned ? "banned" : "normal"));
      accountMap.set(docSnap.id, {
        uid: docSnap.id,
        displayName: String(data.displayName || authUser?.displayName || profile.displayName || data.islanderId || "").slice(0, 80),
        islanderId: String(data.islanderId || "").slice(0, 40),
        email: String(authUser?.email || "").slice(0, 160),
        emailVerified: authUser?.emailVerified === true,
        role: String(data.role || "").slice(0, 40),
        photoURL: String(data.photoURL || authUser?.photoURL || "").slice(0, 500),
        accountStatus,
        isBanned: data.isBanned === true || profile.isBanned === true || authUser?.disabled === true || accountStatus === "banned",
        authDisabled: authUser?.disabled === true,
        createdAt: data.createdAt || null,
        lastSeenAt: profile.lastSeenAt || data.lastSeenAt || null,
        authCreatedAt: authUser?.metadata?.creationTime || "",
        authLastSignInAt: authUser?.metadata?.lastSignInTime || "",
        lastIpAddress: String(profile.lastIpAddress || "").slice(0, 80),
        lastIpKey: String(profile.lastIpKey || "").slice(0, 120),
        lastIpAt: profile.lastIpAt || null,
        reason: String(profile.bannedReason || profile.postingSuspendedReason || profile.accountWatchReason || data.accountWatchReason || "").slice(0, 500),
      });
    });

    authResult.users.forEach((authUser) => {
      if (accountMap.has(authUser.uid)) return;
      const profile = profiles.get(authUser.uid) || {};
      accountMap.set(authUser.uid, {
        uid: authUser.uid,
        displayName: String(authUser.displayName || "").slice(0, 80),
        islanderId: "",
        email: String(authUser.email || "").slice(0, 160),
        emailVerified: authUser.emailVerified === true,
        role: "",
        photoURL: String(authUser.photoURL || "").slice(0, 500),
        accountStatus: authUser.disabled ? "banned" : String(profile.accountStatus || "normal"),
        isBanned: authUser.disabled === true,
        authDisabled: authUser.disabled === true,
        createdAt: null,
        lastSeenAt: profile.lastSeenAt || null,
        authCreatedAt: authUser.metadata?.creationTime || "",
        authLastSignInAt: authUser.metadata?.lastSignInTime || "",
        lastIpAddress: String(profile.lastIpAddress || "").slice(0, 80),
        lastIpKey: String(profile.lastIpKey || "").slice(0, 120),
        lastIpAt: profile.lastIpAt || null,
        reason: String(profile.bannedReason || profile.postingSuspendedReason || profile.accountWatchReason || "").slice(0, 500),
      });
    });

    return {
      accounts: Array.from(accountMap.values()),
      count: accountMap.size,
    };
  }
);

exports.rangerExecuteAiControlPlan = onCall(
  {
    region: REGION,
    timeoutSeconds: 240,
    memory: "512MiB",
  },
  async (request) => {
    const reviewerId = await assertStationMasterCallable(request);
    const actions = Array.isArray(request.data?.actions) ? request.data.actions.slice(0, 20) : [];
    const deleteConfirmation = String(request.data?.deleteConfirmation || "");

    if (!actions.length) {
      throw new HttpsError("invalid-argument", "No AI control actions were provided.");
    }

    const deleteCount = actions.filter((item) => String(item?.action || "") === "delete").length;
    if (deleteCount > 0 && deleteConfirmation !== "DELETE") {
      throw new HttpsError("failed-precondition", "Deleting content requires explicit DELETE confirmation.");
    }
    if (deleteCount > 3) {
      throw new HttpsError("failed-precondition", "AI control batch can delete at most 3 items at once.");
    }

    const results = [];
    for (const item of actions) {
      const sourcePath = String(item?.sourcePath || "").trim();
      const action = String(item?.action || "").trim();
      const reason = String(item?.reason || item?.label || "Ranger AI 控制台批次治理").trim().slice(0, 240);

      try {
        if (!sourcePath || !["review", "hide", "delete", "restore", "mask"].includes(action)) {
          throw new HttpsError("invalid-argument", "Invalid AI control action.");
        }
        const result = await applyDirectContentAction({
          sourcePath,
          action,
          reviewerId,
          reason,
        });
        results.push({
          ok: true,
          sourcePath,
          action,
          status: result.status,
          publicCaseId: result.publicCaseId,
        });
      } catch (error) {
        console.error("AI control action failed:", {
          sourcePath,
          action,
          message: error?.message,
        });
        results.push({
          ok: false,
          sourcePath,
          action,
          error: error?.message || String(error),
        });
      }
    }

    return {
      ok: results.some((item) => item.ok),
      total: results.length,
      successCount: results.filter((item) => item.ok).length,
      failureCount: results.filter((item) => !item.ok).length,
      results,
    };
  }
);

const MATSU_AIRPORT_STATUS_URL = "https://msa.gov.tw/";
const MATSU_AIRPORT_NANGAN_FLIGHTS_URL = "https://msa.gov.tw/flights/nangan";
const MATSU_AIRPORT_BEIGAN_FLIGHTS_URL = "https://msa.gov.tw/flights/beigan";
const TAIMA_STAR_STATUS_URL = "https://www.alsealand.com/";
const MOTCMPB_FERRY_SCHEDULE_URL = "https://www.motcmpb.gov.tw/PassengerShip/Schedule?SiteId=1&NodeId=610&ShipLaneNo=C001";
const MOTCMPB_FERRY_SWITCH_PAGE_URL = "https://www.motcmpb.gov.tw/PassengerShip/SwitchPage?SiteId=1&NodeId=610&ShipLaneNo=C001";
const AOAWS_HOME_URL = "https://aoaws.anws.gov.tw/";
const AOAWS_METAR_URL = "https://aoaws.anws.gov.tw/Home/get_metar_data";

function decodeSimpleHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function htmlToVisibleLines(html) {
  return decodeSimpleHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/td>|<\/th>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseAirportFlightRows(sectionLines) {
  const rows = [];
  for (let index = 0; index < sectionLines.length - 4; index += 1) {
    const airline = sectionLines[index];
    const flightNo = sectionLines[index + 1];
    const place = sectionLines[index + 2];
    const time = sectionLines[index + 3];
    const status = sectionLines[index + 4];

    if (
      /^\d{3,5}$/.test(flightNo) &&
      /^\d{3,4}$/.test(time) &&
      !/^\d+$/.test(airline) &&
      !["Status", "狀態"].includes(status)
    ) {
      rows.push({
        airline: String(airline).slice(0, 40),
        flightNo: String(flightNo).slice(0, 12),
        place: String(place).slice(0, 40),
        time: String(time).replace(/^(\d{1,2})(\d{2})$/, "$1:$2"),
        status: String(status).slice(0, 40),
      });
      index += 4;
    }
  }
  return rows.slice(0, 24);
}


function isAirportFlightNo(value) {
  return /^[A-Z0-9]{1,3}\s?\d{3,5}$/.test(String(value || "").trim());
}

function isAirportFlightTime(value) {
  return /^\d{3,4}$/.test(String(value || "").trim());
}

function translateFlightStatus(status) {
  const text = String(status || "").trim();
  const lower = text.toLowerCase();
  if (lower.includes("cancel")) return "\u53d6\u6d88";
  if (lower.includes("ontime")) return "\u6e96\u6642";
  if (lower.includes("departed")) return "\u5df2\u98db";
  if (lower.includes("arrived")) return "\u5df2\u62b5\u9054";
  if (lower.includes("delayed")) return "\u5ef6\u8aa4";
  return text.slice(0, 40);
}

function translateAirlineName(airline) {
  const text = String(airline || "").trim();
  if (/Uni Airways/i.test(text)) return "\u7acb\u69ae";
  if (/Mandarin Airlines/i.test(text)) return "\u83ef\u4fe1";
  return text.slice(0, 40);
}

function normalizeFlightPlace(place) {
  return String(place || "")
    .replace(/\s+/g, " ")
    .replace(/Taipei\s*TSA/i, "\u53f0\u5317TSA")
    .replace(/TaipeiTSA/i, "\u53f0\u5317TSA")
    .replace(/Taichung\s*RMQ/i, "\u53f0\u4e2dRMQ")
    .replace(/TaichungRMQ/i, "\u53f0\u4e2dRMQ")
    .trim()
    .slice(0, 40);
}

function parseDirectAirportFlightRows(tableLines, direction) {
  const rows = [];
  for (let index = 0; index < tableLines.length - 4; index += 1) {
    const airline = tableLines[index];
    const flightNo = tableLines[index + 1];
    const place = tableLines[index + 2];
    const time = tableLines[index + 3];
    const status = tableLines[index + 4];

    if (
      isAirportFlightNo(flightNo) &&
      isAirportFlightTime(time) &&
      !/^Airline$/i.test(airline) &&
      !/^Status$/i.test(status)
    ) {
      rows.push({
        direction,
        directionText: direction === "departure" ? "\u96e2\u7ad9" : "\u5230\u7ad9",
        airline: translateAirlineName(airline),
        airlineOriginal: String(airline).slice(0, 40),
        flightNo: String(flightNo).replace(/\s+/g, " ").trim().slice(0, 12),
        place: normalizeFlightPlace(place),
        time: String(time).replace(/^(\d{1,2})(\d{2})$/, "$1:$2"),
        rawTime: String(time).slice(0, 8),
        status: translateFlightStatus(status),
        statusOriginal: String(status).slice(0, 40),
      });
      index += 4;
    }
  }
  return rows;
}

function parseDirectAirportFlightPage(lines) {
  const statusHeaderIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => {
      if (!/^Status$/i.test(line)) return false;
      const nearby = lines.slice(Math.max(0, index - 5), index + 1).join(" ");
      return /Flight No/i.test(nearby);
    })
    .map(({ index }) => index);

  const rows = [];
  statusHeaderIndexes.slice(0, 2).forEach((statusIndex, tableIndex) => {
    const end = lines.findIndex((line, index) => {
      if (index <= statusIndex) return false;
      return /^Airline$/i.test(line) || line === "?" || /^OPEN$/i.test(line);
    });
    const tableLines = lines.slice(statusIndex + 1, end > statusIndex ? end : undefined);
    rows.push(...parseDirectAirportFlightRows(tableLines, tableIndex === 0 ? "departure" : "arrival"));
  });

  return {
    rows: rows.slice(0, 32),
    departureRows: rows.filter((row) => row.direction === "departure").slice(0, 20),
    arrivalRows: rows.filter((row) => row.direction === "arrival").slice(0, 20),
    summary: getFlightSummary(rows),
  };
}

function getFlightSummary(rows) {
  const counts = rows.reduce(
    (acc, row) => {
      const rawStatus = String(row.status || "");
      const displayStatus = String(row.statusText || row.status || "");
      const status = `${rawStatus} ${displayStatus}`.toLowerCase();
      if (status.includes("cancel") || displayStatus.includes("??") || rawStatus.includes("??")) acc.cancelled += 1;
      else if (status.includes("closed") || displayStatus.includes("??") || rawStatus.includes("??")) acc.closed += 1;
      else if (status.includes("ontime") || displayStatus.includes("??") || displayStatus.includes("??") || displayStatus.includes("???")) acc.onTime += 1;
      else acc.other += 1;
      return acc;
    },
    { total: rows.length, onTime: 0, cancelled: 0, closed: 0, other: 0 }
  );

  return counts;
}

function parseAirportSection(lines, startTerms, endTerms) {
  const start = lines.findIndex((line) => startTerms.some((term) => line.includes(term)));
  if (start < 0) return { rows: [], summary: getFlightSummary([]) };
  const end = lines.findIndex((line, index) => index > start && endTerms.some((term) => line.includes(term)));
  const rows = parseAirportFlightRows(lines.slice(start, end > start ? end : undefined));
  return { rows, summary: getFlightSummary(rows) };
}

function getSetCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function toCookieHeader(setCookieValues) {
  return setCookieValues
    .map((value) => String(value || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function flattenAoawsAirportRows(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (Array.isArray(item) ? flattenAoawsAirportRows(item) : [item]));
}

function windDirectionText(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return "不明";
  const labels = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
  return labels[Math.round(value / 45) % 8];
}

function getAoawsWeatherIcon(weatherName) {
  const text = String(weatherName || "");
  if (/雷/.test(text)) return "CloudLightning";
  if (/雨|毛雨|陣雨/.test(text)) return "CloudRain";
  if (/雪|冰|雹|霰/.test(text)) return "Snowflake";
  if (/霧|靄|霾|煙/.test(text)) return "Cloud";
  if (/晴/.test(text) && !/多雲|陰/.test(text)) return "Sun";
  return "Cloud";
}

function normalizeAoawsAirport(row) {
  if (!row) return null;
  const visibility = Number(row.VIS);
  const ceiling = Number(row.CEILING);
  const weatherText = String(row.WEATHER?.CName || "天氣資料");
  return {
    stationId: String(row.STID || ""),
    stationName: String(row.STNM_C || row.location_ch || ""),
    iataCode: String(row.IATA_code || ""),
    observedAtIso: row.datatime || null,
    apiDataTime: String(row.API_DATA_TIME || ""),
    report: String(row.REPORT || ""),
    temp: Number.isFinite(Number(row.TEMP)) ? Number(row.TEMP) : null,
    text: weatherText,
    icon: getAoawsWeatherIcon(weatherText),
    windDirection: Number.isFinite(Number(row.WDIR)) ? Number(row.WDIR) : null,
    windDirectionText: windDirectionText(row.WDIR),
    windSpeedKt: Number.isFinite(Number(row.WDSD)) ? Number(row.WDSD) : null,
    windUnit: String(row.WDSD_UNIT || "KT"),
    visibilityMeters: Number.isFinite(visibility) ? visibility : null,
    visibilityText: visibility === 9999 ? "10 公里以上" : Number.isFinite(visibility) ? `${Math.round(visibility / 100) / 10} 公里` : "未提供",
    ceilingFt: Number.isFinite(ceiling) ? ceiling : null,
    ceilingText: Number.isFinite(ceiling) ? `${ceiling} 呎` : "未提供",
    visAllowed: Boolean(row.VIS_ALLOWED),
    flightAllowed: Boolean(row.FLIGHT_ALLOWED),
  };
}

async function fetchAoawsWeatherStatus() {
  const homeResponse = await fetch(AOAWS_HOME_URL, {
    headers: {
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.6",
      "user-agent": "MatsuStationBot/1.0 (+https://www.matsustation.com/)",
    },
  });
  if (!homeResponse.ok) {
    throw new Error(`AOAWS home fetch failed: ${homeResponse.status}`);
  }

  const cookieHeader = toCookieHeader(getSetCookieValues(homeResponse.headers));
  const metarResponse = await fetch(AOAWS_METAR_URL, {
    method: "POST",
    headers: {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.6",
      "origin": AOAWS_HOME_URL.replace(/\/$/, ""),
      "referer": AOAWS_HOME_URL,
      "user-agent": "MatsuStationBot/1.0 (+https://www.matsustation.com/)",
      "x-requested-with": "XMLHttpRequest",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
  if (!metarResponse.ok) {
    throw new Error(`AOAWS METAR fetch failed: ${metarResponse.status}`);
  }

  const text = await metarResponse.text();
  if (/Direct access is not allowed/i.test(text)) {
    throw new Error("AOAWS rejected request without browser session.");
  }

  const data = JSON.parse(text);
  const taiwanRows = [
    ...flattenAoawsAirportRows(data?.latest_airport_list?.Taiwan),
    ...flattenAoawsAirportRows(data?.airport_list?.Taiwan),
  ];
  const nangan = normalizeAoawsAirport(taiwanRows.find((item) => item?.STID === "RCFG"));
  const beigan = normalizeAoawsAirport(taiwanRows.find((item) => item?.STID === "RCMT"));
  const primary = nangan || beigan;

  return {
    ok: Boolean(primary),
    source: "民用航空局飛航服務總臺航空氣象服務網",
    sourceUrl: AOAWS_HOME_URL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    fetchedAtIso: new Date().toISOString(),
    error: admin.firestore.FieldValue.delete(),
    notice: "航空氣象資料供站內天氣資訊參考；實際飛航、起降與交通異動仍請以航空站及航空公司公告為準。",
    primaryStation: primary?.stationId || null,
    temp: primary?.temp ?? null,
    text: primary?.text || "航空氣象",
    icon: primary?.icon || "Cloud",
    windDirection: primary?.windDirection ?? null,
    windDirectionText: primary?.windDirectionText || "不明",
    windSpeedKt: primary?.windSpeedKt ?? null,
    visibilityText: primary?.visibilityText || "未提供",
    ceilingText: primary?.ceilingText || "未提供",
    flightAllowed: primary?.flightAllowed ?? null,
    airports: {
      nangan,
      beigan,
    },
  };
}

async function fetchMatsuAirportStatus() {
  const headers = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "MatsuStationBot/1.0 (+https://www.matsustation.com/)",
  };
  const [nanganResponse, beiganResponse] = await Promise.all([
    fetch(MATSU_AIRPORT_NANGAN_FLIGHTS_URL, { headers }),
    fetch(MATSU_AIRPORT_BEIGAN_FLIGHTS_URL, { headers }),
  ]);
  if (!nanganResponse.ok) {
    throw new Error(`Nangan flights fetch failed: ${nanganResponse.status}`);
  }
  if (!beiganResponse.ok) {
    throw new Error(`Beigan flights fetch failed: ${beiganResponse.status}`);
  }

  const [nanganHtml, beiganHtml] = await Promise.all([
    nanganResponse.text(),
    beiganResponse.text(),
  ]);
  const nangan = parseDirectAirportFlightPage(htmlToVisibleLines(nanganHtml));
  const beigan = parseDirectAirportFlightPage(htmlToVisibleLines(beiganHtml));

  return {
    ok: nangan.rows.length > 0 || beigan.rows.length > 0,
    source: "\u99ac\u7956\u822a\u7a7a\u7ad9",
    sourceUrl: MATSU_AIRPORT_NANGAN_FLIGHTS_URL,
    sourceUrls: {
      nangan: MATSU_AIRPORT_NANGAN_FLIGHTS_URL,
      beigan: MATSU_AIRPORT_BEIGAN_FLIGHTS_URL,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    fetchedAtIso: new Date().toISOString(),
    error: admin.firestore.FieldValue.delete(),
    notice: "\u822a\u73ed\u8cc7\u6599\u6bcf 5 \u5206\u9418\u7531\u99ac\u7956\u822a\u7a7a\u7ad9\u4eca\u65e5\u822a\u73ed\u9801\u5feb\u53d6\uff1b\u5be6\u969b\u8d77\u964d\u3001\u5ef6\u8aa4\u8207\u53d6\u6d88\u4ecd\u4ee5\u822a\u7a7a\u516c\u53f8\u53ca\u822a\u7a7a\u7ad9\u516c\u544a\u70ba\u6e96\u3002",
    airports: {
      nangan,
      beigan,
    },
  };
}

function extractAnnouncementTitles(html) {
  const withoutScripts = decodeSimpleHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return Array.from(withoutScripts.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi))
    .map((match) => match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractDataCell(rowHtml, dataTh) {
  const escaped = escapeRegExp(dataTh);
  const match = String(rowHtml || "").match(new RegExp(`<td\\b[^>]*data-th=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  return match ? match[1] : "";
}

function htmlCellToLines(html) {
  return htmlToVisibleLines(html)
    .map((line) => line.replace(/[↓→]/g, "").trim())
    .filter(Boolean);
}

function parseFerryDateTime(cellHtml) {
  const parts = htmlCellToLines(cellHtml);
  return {
    date: parts[0] || "",
    time: parts.find((part) => /^\d{1,2}:\d{2}$/.test(part)) || parts[1] || "",
  };
}

function parseMotcmpbFerryRows(html) {
  const fieldNames = {
    company: "\u71df\u904b\u516c\u53f8",
    contact: "\u806f\u7d61\u65b9\u5f0f",
    route: "\u822a\u7dda",
    ship: "\u8239\u8236",
    departure: "\u958b\u822a\u6642\u9593(\u7576\u5730\u6642\u9593)",
    arrival: "\u62b5\u9054\u6642\u9593(\u7576\u5730\u6642\u9593)",
    validity: "\u822a\u884c\u6709\u6548\u671f\u9650",
    ports: "\u51fa\u767c\u6e2f\u2192\u76ee\u7684\u6e2f",
    note: "\u5099\u8a3b",
  };

  return Array.from(String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => match[1])
    .map((rowHtml) => {
      const departure = parseFerryDateTime(extractDataCell(rowHtml, fieldNames.departure));
      const arrival = parseFerryDateTime(extractDataCell(rowHtml, fieldNames.arrival));
      const ports = htmlCellToLines(extractDataCell(rowHtml, fieldNames.ports));
      return {
        company: (htmlCellToLines(extractDataCell(rowHtml, fieldNames.company))[0] || "").slice(0, 60),
        contact: (htmlCellToLines(extractDataCell(rowHtml, fieldNames.contact))[0] || "").slice(0, 40),
        route: (htmlCellToLines(extractDataCell(rowHtml, fieldNames.route))[0] || "").slice(0, 80),
        ship: (htmlCellToLines(extractDataCell(rowHtml, fieldNames.ship))[0] || "").slice(0, 40),
        departureDate: departure.date.slice(0, 16),
        departureTime: departure.time.slice(0, 8),
        arrivalDate: arrival.date.slice(0, 16),
        arrivalTime: arrival.time.slice(0, 8),
        validUntil: (htmlCellToLines(extractDataCell(rowHtml, fieldNames.validity))[0] || "").slice(0, 40),
        from: (ports[0] || "").slice(0, 40),
        to: (ports[ports.length - 1] || "").slice(0, 40),
        note: htmlCellToLines(extractDataCell(rowHtml, fieldNames.note)).join(" ").slice(0, 120),
      };
    })
    .filter((row) => row.ship && row.departureDate && row.departureTime);
}

function getFerrySummary(rows) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.reduce(
    (acc, row) => {
      if (row.departureDate === today) acc.today += 1;
      if (/基隆/.test(row.from) || /基隆/.test(row.to)) acc.keelungMatsu += 1;
      if (/東引/.test(row.from) || /東引/.test(row.to)) acc.dongyin += 1;
      return acc;
    },
    { total: rows.length, today: 0, keelungMatsu: 0, dongyin: 0 }
  );
}

async function fetchMotcmpbFerrySchedule() {
  const headers = {
    "accept-language": "zh-TW,zh;q=0.9,en;q=0.6",
    "user-agent": "MatsuStationBot/1.0 (+https://www.matsustation.com/)",
  };
  const firstPageResponse = await fetch(MOTCMPB_FERRY_SCHEDULE_URL, { headers });
  if (!firstPageResponse.ok) {
    throw new Error(`MOTCMPB ferry schedule fetch failed: ${firstPageResponse.status}`);
  }

  const cookieHeader = toCookieHeader(getSetCookieValues(firstPageResponse.headers));
  const firstPageHtml = await firstPageResponse.text();
  const pageLinks = Array.from(firstPageHtml.matchAll(/PassengerShip\/SwitchPage\?[^"']*page=(\d+)/gi))
    .map((match) => Number(match[1]))
    .filter((page) => Number.isFinite(page) && page > 1);
  const maxPage = Math.min(Math.max(1, ...pageLinks), 8);
  const pageHtmlList = [firstPageHtml];

  for (let page = 2; page <= maxPage; page += 1) {
    const response = await fetch(`${MOTCMPB_FERRY_SWITCH_PAGE_URL}&page=${page}`, {
      method: "POST",
      headers: {
        ...headers,
        accept: "text/html, */*; q=0.01",
        referer: MOTCMPB_FERRY_SCHEDULE_URL,
        "x-requested-with": "XMLHttpRequest",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
    if (response.ok) {
      pageHtmlList.push(await response.text());
    }
  }

  const rows = pageHtmlList.flatMap((html) => parseMotcmpbFerryRows(html));
  const dedupedRows = Array.from(
    new Map(
      rows.map((row) => [
        [row.ship, row.departureDate, row.departureTime, row.from, row.to].join("|"),
        row,
      ])
    ).values()
  ).sort((a, b) => `${a.departureDate} ${a.departureTime}`.localeCompare(`${b.departureDate} ${b.departureTime}`));

  return {
    rows: dedupedRows.slice(0, 80),
    summary: getFerrySummary(dedupedRows),
  };
}

async function fetchTaimaStarAnnouncements() {
  const response = await fetch(TAIMA_STAR_STATUS_URL, {
    headers: {
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.6",
      "user-agent": "MatsuStationBot/1.0 (+https://www.matsustation.com/)",
    },
  });
  if (!response.ok) {
    throw new Error(`Taima Star fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const announcements = extractAnnouncementTitles(html);
  return {
    ok: announcements.length > 0,
    source: "臺馬之星／洋民集團",
    sourceUrl: TAIMA_STAR_STATUS_URL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    fetchedAtIso: new Date().toISOString(),
    notice: "船班公告由臺馬之星公開頁面擷取；實際航班、歲修、停航與替代航班請以船公司與官方訂位系統公告為準。",
    announcements,
  };
}

async function fetchMatsuFerryStatus() {
  const [scheduleResult, announcementResult] = await Promise.allSettled([
    fetchMotcmpbFerrySchedule(),
    fetchTaimaStarAnnouncements(),
  ]);

  if (scheduleResult.status !== "fulfilled") {
    throw scheduleResult.reason;
  }

  const schedule = scheduleResult.value;
  const announcementStatus = announcementResult.status === "fulfilled" ? announcementResult.value : null;
  return {
    ok: schedule.rows.length > 0,
    source: "\u4ea4\u901a\u90e8\u822a\u6e2f\u5c40",
    sourceUrl: MOTCMPB_FERRY_SCHEDULE_URL,
    announcementSource: "\u81fa\u99ac\u4e4b\u661f\uff0f\u6d0b\u6c11\u96c6\u5718",
    announcementSourceUrl: TAIMA_STAR_STATUS_URL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    fetchedAtIso: new Date().toISOString(),
    error: admin.firestore.FieldValue.delete(),
    notice: "\u8239\u73ed\u8868\u6bcf 5 \u5206\u9418\u7531\u4ea4\u901a\u90e8\u822a\u6e2f\u5c40\u57fa\u9686-\u99ac\u7956\u822a\u7dda\u9801\u5feb\u53d6\uff1b\u5b9a\u671f\u73ed\u8868\u50c5\u4f9b\u53c3\u8003\uff0c\u81e8\u6642\u7570\u52d5\u3001\u505c\u822a\u8207\u8a02\u4f4d\u4ecd\u4ee5\u8239\u516c\u53f8\u53ca\u5b98\u65b9\u516c\u544a\u70ba\u6e96\u3002",
    rows: schedule.rows,
    summary: schedule.summary,
    announcements: Array.isArray(announcementStatus?.announcements) ? announcementStatus.announcements : [],
    announcementError: announcementResult.status === "rejected"
      ? String(announcementResult.reason?.message || announcementResult.reason).slice(0, 300)
      : admin.firestore.FieldValue.delete(),
  };
}

async function refreshPublicTransportStatus() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const [flightResult, ferryResult, weatherResult] = await Promise.allSettled([
    fetchMatsuAirportStatus(),
    fetchMatsuFerryStatus(),
    fetchAoawsWeatherStatus(),
  ]);

  const batch = db.batch();
  const flightRef = db.collection("transportStatus").doc("flight");
  const ferryRef = db.collection("transportStatus").doc("ferry");
  const weatherRef = db.collection("transportStatus").doc("weather");

  if (flightResult.status === "fulfilled") {
    batch.set(flightRef, flightResult.value, { merge: true });
  } else {
    batch.set(
      flightRef,
      {
        ok: false,
        source: "馬祖航空站",
        sourceUrl: MATSU_AIRPORT_STATUS_URL,
        updatedAt: now,
        fetchedAtIso: new Date().toISOString(),
        error: String(flightResult.reason?.message || flightResult.reason).slice(0, 300),
      },
      { merge: true }
    );
  }

  if (ferryResult.status === "fulfilled") {
    batch.set(ferryRef, ferryResult.value, { merge: true });
  } else {
    batch.set(
      ferryRef,
      {
        ok: false,
        source: "交通部航港局",
        sourceUrl: MOTCMPB_FERRY_SCHEDULE_URL,
        updatedAt: now,
        fetchedAtIso: new Date().toISOString(),
        error: String(ferryResult.reason?.message || ferryResult.reason).slice(0, 300),
      },
      { merge: true }
    );
  }

  if (weatherResult.status === "fulfilled") {
    batch.set(weatherRef, weatherResult.value, { merge: true });
  } else {
    batch.set(
      weatherRef,
      {
        ok: false,
        source: "民用航空局飛航服務總臺航空氣象服務網",
        sourceUrl: AOAWS_HOME_URL,
        updatedAt: now,
        fetchedAtIso: new Date().toISOString(),
        error: String(weatherResult.reason?.message || weatherResult.reason).slice(0, 300),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return {
    flightOk: flightResult.status === "fulfilled" && flightResult.value.ok,
    ferryOk: ferryResult.status === "fulfilled" && ferryResult.value.ok,
    weatherOk: weatherResult.status === "fulfilled" && weatherResult.value.ok,
  };
}

exports.scheduledPublicTransportStatusRefresh = onSchedule(
  {
    region: REGION,
    schedule: "every 5 minutes",
    timeZone: "Asia/Taipei",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async () => refreshPublicTransportStatus()
);

exports.rangerRefreshPublicTransportStatus = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    await assertStationMasterCallable(request);
    return refreshPublicTransportStatus();
  }
);
