import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  getFirestore,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Cpu,
  Eye,
  FileWarning,
  Filter,
  Gavel,
  Network,
  Radar,
  RefreshCw,
  RotateCcw,
  Shield,
  Tags,
  TerminalSquare,
  UserCircle2,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import './styles.css';

type GraphMode = 'social' | 'topics';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type CaseStatusFilter = 'active' | 'all' | 'fight' | 'escalated' | 'downgraded' | 'pending' | 'quarantined' | 'released' | 'removed' | 'dismissed';
type RangerAction = 'mark_reviewed' | 'dismiss' | 'release' | 'quarantine' | 'remove';
type ContentAction = 'hide' | 'delete';
type SourceType = 'post' | 'comment' | 'reply';

interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'topic';
  role?: string;
  weight: number;
  risk: number;
  cluster: string;
  color: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface RiskTimelineBucket {
  label: string;
  start: number;
  end: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  fight: number;
  total: number;
}

interface CategoryMetric {
  id: string;
  label: string;
  count: number;
  riskScore: number;
  tone: string;
}

interface OpsMetric {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone: string;
}

interface ContentWatchItem {
  id: string;
  sourceType: SourceType;
  sourcePath: string;
  postId: string;
  commentId?: string;
  replyId?: string;
  authorId: string;
  authorName: string;
  category?: string;
  contentPreview: string;
  riskLevel: RiskLevel;
  riskScore: number;
  fightMode: boolean;
  moderationStatus?: string;
  judgement: string;
  recommendation: string;
  createdAt?: unknown;
}

interface LabData {
  socialNodes: GraphNode[];
  socialLinks: GraphLink[];
  topicNodes: GraphNode[];
  topicLinks: GraphLink[];
  postsScanned: number;
  interactions: number;
  usersSeen: number;
  topicCount: number;
  riskCounts: Record<string, number>;
  patrolFeed: PatrolCase[];
  riskTimeline: RiskTimelineBucket[];
  categoryMetrics: CategoryMetric[];
  opsMetrics: OpsMetric[];
  fightContentCount: number;
  contentItems: ContentWatchItem[];
  consoleLines: string[];
  caseReadError?: string;
  caseReadAuthUid?: string | null;
}

interface PatrolCase {
  id: string;
  publicCaseId?: string;
  riskLevel?: RiskLevel | string;
  riskScore?: number;
  categories?: string[];
  summary?: string;
  legalRisk?: string;
  publicInterest?: string;
  recommendedAction?: string;
  rationale?: string;
  sourceType?: string;
  sourcePath?: string;
  postId?: string;
  commentId?: string;
  replyId?: string;
  authorId?: string;
  authorName?: string;
  category?: string;
  status?: string;
  contentPreview?: string;
  contentSnapshot?: string;
  fightMode?: boolean;
  userRiskLabel?: string;
  aiGovernanceMode?: string;
  policyVersion?: string;
  policyRefs?: Array<{ code: string; label: string }>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface UserMeta {
  uid: string;
  label: string;
  role?: string;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const functions = getFunctions(app, 'asia-east1');
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const STATION_MASTER_UID = 'gHHxF8p1DnbMkoeVmU5XpB18Elz2';

const EMPTY_DATA: LabData = {
  socialNodes: [],
  socialLinks: [],
  topicNodes: [],
  topicLinks: [],
  postsScanned: 0,
  interactions: 0,
  usersSeen: 0,
  topicCount: 0,
  riskCounts: {},
  patrolFeed: [],
  riskTimeline: [],
  categoryMetrics: [],
  opsMetrics: [],
  fightContentCount: 0,
  contentItems: [],
  consoleLines: ['AI 游騎兵本地後台已就緒。未登入時會先掃描公開資料。'],
};

const KNOWN_TOPICS = [
  '藍眼淚',
  '閒聊',
  '在地生活',
  '政治論壇',
  '交通',
  '船班',
  '航班',
  '馬祖氣象',
  '美景分享',
  '馬祖鬼故事',
  '野生動物',
  '馬祖UFO',
  '美食',
  '公告',
  '求助',
  '抱怨',
];

const STATION_MASTER_NODE_COLOR = '#e8fcff';
const USER_COLORS = ['#00d9e8', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#14b8a6', '#2dd4bf'];
const TOPIC_COLORS = ['#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#14b8a6', '#2dd4bf'];

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
}

function getRiskTone(level?: string) {
  if (level === 'critical') return '#ff2d55';
  if (level === 'high') return '#ff7a18';
  if (level === 'medium') return '#facc15';
  return '#30f2a2';
}

function getRiskLabel(level?: string) {
  if (level === 'critical') return '極高風險';
  if (level === 'high') return '高風險';
  if (level === 'medium') return '中風險';
  return '低風險';
}

function getNodeRiskTone(risk: number, fallbackColor: string) {
  if (risk >= 90) return getRiskTone('critical');
  if (risk >= 70) return getRiskTone('high');
  if (risk >= 35) return getRiskTone('medium');
  return fallbackColor;
}

function getRiskBandLabel(risk: number) {
  if (risk >= 90) return '極高';
  if (risk >= 70) return '高';
  if (risk >= 35) return '中';
  return '低';
}

function getRiskLevelFromScore(risk: number): RiskLevel {
  if (risk >= 90) return 'critical';
  if (risk >= 70) return 'high';
  if (risk >= 35) return 'medium';
  return 'low';
}

function getStoredRiskScore(data: DocumentData) {
  const moderationRiskScore = Number(data.moderationRiskScore || 0);
  if (Number.isFinite(moderationRiskScore) && moderationRiskScore > 0) return moderationRiskScore;

  const aiRisk = Number(data.aiRisk || 0);
  if (!Number.isFinite(aiRisk) || aiRisk <= 0) return 0;
  return aiRisk <= 10 ? aiRisk * 10 : aiRisk;
}

function getStatusLabel(status?: string) {
  if (status === 'downgraded') return 'AI 降級';
  if (status === 'quarantined') return '已隔離';
  if (status === 'released') return '已放行';
  if (status === 'removed') return '已移除';
  if (status === 'dismissed') return '已忽略';
  if (status === 'reviewed') return '已審核';
  return '待處理';
}

function getSourceLabel(sourceType?: string) {
  if (sourceType === 'post') return '貼文';
  if (sourceType === 'comment') return '留言';
  if (sourceType === 'reply') return '留言回覆';
  return '內容';
}

function getGovernanceLabel(mode?: string) {
  if (mode === 'fight') return 'Fight 監管';
  if (mode === 'downgraded') return 'AI 降級';
  if (mode === 'escalated') return 'AI 升級';
  return '一般巡邏';
}

function getActionLabel(action: RangerAction) {
  return {
    mark_reviewed: '標記已審',
    dismiss: '忽略案件',
    release: '放行內容',
    quarantine: '隔離內容',
    remove: '移除內容',
  }[action];
}

function getAuthErrorCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
}

function formatAuthError(error: unknown) {
  const code = getAuthErrorCode(error);
  if (code === 'auth/unauthorized-domain') {
    return 'Firebase Auth 尚未授權目前網域。請用 http://localhost:4321 開啟本地後台，或到 Firebase Auth 的「授權網域」加入目前網域。';
  }
  if (code === 'auth/popup-blocked') {
    return '瀏覽器阻擋 Google 登入視窗，已改用重新導向登入。';
  }
  if (code === 'auth/popup-closed-by-user') {
    return '登入視窗已關閉，尚未完成登入。';
  }
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : '';
  return `Google 登入失敗：${message || code || '請稍後再試。'}`;
}

function formatReadError(error: unknown) {
  const code = getAuthErrorCode(error);
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : '';
  return [code, message].filter(Boolean).join(' / ') || String(error);
}

function isActiveCase(item: PatrolCase) {
  return !item.status || item.status === 'pending' || item.status === 'quarantined';
}

function matchesCaseFilter(item: PatrolCase, filter: CaseStatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') return isActiveCase(item);
  if (filter === 'fight') return item.aiGovernanceMode === 'fight';
  if (filter === 'escalated') return item.aiGovernanceMode === 'escalated';
  if (filter === 'downgraded') return item.aiGovernanceMode === 'downgraded' || item.status === 'downgraded';
  return (item.status || 'pending') === filter;
}

function getCaseTime(item: PatrolCase) {
  return toMillis(item.updatedAt) || toMillis(item.createdAt);
}

function getCaseSortScore(item: PatrolCase) {
  const activeBoost = isActiveCase(item) ? 1000000 : 0;
  return activeBoost + Number(item.riskScore || 0) * 1000 + getCaseTime(item) / 1000000000;
}

function compactUid(uid: string) {
  if (!uid) return 'unknown';
  return uid.length > 10 ? `${uid.slice(0, 4)}-${uid.slice(-4)}` : uid;
}

function safeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactPathId(path: string) {
  return path.replace(/[\/]/g, '__');
}

function isFightMarked(data: DocumentData | PatrolCase) {
  return Boolean(
    data.fightMode ||
    data.userRiskLabel === 'fight' ||
    data.aiGovernanceMode === 'fight',
  );
}

function createTimelineBuckets(now = Date.now()) {
  const bucketMs = 60 * 60 * 1000;
  const bucketCount = 12;
  const currentHour = Math.floor(now / bucketMs) * bucketMs;
  return Array.from({ length: bucketCount }, (_, index) => {
    const start = currentHour - (bucketCount - 1 - index) * bucketMs;
    const date = new Date(start);
    return {
      label: `${String(date.getHours()).padStart(2, '0')}:00`,
      start,
      end: start + bucketMs,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      fight: 0,
      total: 0,
    };
  });
}

function addTimelineEvent(buckets: RiskTimelineBucket[], timeValue: unknown, riskScore: number, fightMode: boolean) {
  const time = toMillis(timeValue);
  if (!time) return;
  const bucket = buckets.find(item => time >= item.start && time < item.end);
  if (!bucket) return;
  const level = getRiskLevelFromScore(riskScore);
  bucket[level] += 1;
  bucket.total += 1;
  if (fightMode) bucket.fight += 1;
}

function normalizeCategoryLabel(value: unknown) {
  const raw = safeText(value).toLowerCase();
  if (!raw) return '未分類';

  const categoryMap: Record<string, string> = {
    personal_data: '個資風險',
    privacy: '隱私風險',
    threat: '威脅安全',
    violence: '威脅安全',
    harassment: '騷擾圍剿',
    insult: '人身攻擊',
    defamation: '名譽風險',
    unverified_accusation: '未證實指控',
    accusation: '未證實指控',
    spam: '洗版干擾',
    scam: '詐騙風險',
    fraud: '詐騙風險',
    sexual_image: '私密影像',
    public_issue: '公共議題',
    politics: '公共議題',
    fight: 'Fight 討論',
  };

  return categoryMap[raw] || safeText(value).replace(/^#/, '') || '未分類';
}

function addCategoryStat(
  map: Map<string, { label: string; count: number; riskTotal: number; maxRisk: number }>,
  value: unknown,
  riskScore: number,
  weight = 1,
) {
  const label = normalizeCategoryLabel(value);
  const key = label.toLowerCase();
  const next = map.get(key) || { label, count: 0, riskTotal: 0, maxRisk: 0 };
  next.count += weight;
  next.riskTotal += riskScore * weight;
  next.maxRisk = Math.max(next.maxRisk, riskScore);
  map.set(key, next);
}

function getLocalJudgement(content: unknown, fightMode: boolean, storedRiskScore: number) {
  const text = safeText(content);
  const hasTarget = /(他|她|那個|某人|某店|老闆|議員|鄉長|主任|老師|醫生|警察|公務員|店家|公司|單位|[A-Z][0-9]|@[^\s]+)/i.test(text);
  const personalData = /(身分證|電話|手機|地址|住址|個資|肉搜|車牌|私人LINE|銀行帳戶|病歷|家裡|住哪裡|0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4})/i.test(text);
  const threat = /(殺|打死|弄死|放火|砸店|堵你|找你算帳|威脅|恐嚇|去你家|讓你出事)/.test(text);
  const seriousClaim = /(貪污|收賄|收回扣|詐騙|偷竊|性侵|販毒|吸毒|洗錢|黑道|外遇|偽造|侵占公款|拿好處)/.test(text);
  const rumor = /(聽說|有人說|疑似|好像|爆料|未證實|沒證據|大家都知道)/.test(text);
  const harassment = /(大家去|一起去|抵制他|圍剿|出征|公布他|讓他紅|不要讓他混)/.test(text);
  const insult = hasTarget && /(垃圾|爛人|騙子|白癡|智障|不要臉|噁心)/.test(text);
  const heated = /(很扯|太誇張|黑箱|有問題|不合理|氣死|離譜|靠北|幹|爛)/.test(text);

  let localScore = fightMode ? 38 : 12;
  let judgement = fightMode ? 'Fight 標記：提高討論容忍度，同時保留完整判斷紀錄。' : '一般內容：目前未見明顯高風險訊號。';
  let recommendation = fightMode ? '觀察討論脈絡' : '正常放行';

  if (personalData || threat) {
    localScore = 95;
    judgement = personalData ? '疑似個資、肉搜或私人識別資訊，需要優先處理。' : '疑似威脅或人身安全風險，需要優先處理。';
    recommendation = '建議立即隔離或移除';
  } else if (hasTarget && seriousClaim) {
    localScore = 78;
    judgement = '對可識別對象提出重大未證實指控，名譽與法律風險偏高。';
    recommendation = '建議人工覆核';
  } else if (hasTarget && harassment) {
    localScore = 74;
    judgement = '疑似引導群體針對特定對象行動，需防止騷擾或圍剿。';
    recommendation = '建議人工覆核';
  } else if (hasTarget && rumor) {
    localScore = fightMode ? 50 : 58;
    judgement = '內容含傳聞或影射，尚未達立即移除，但需要站長觀察。';
    recommendation = '觀察後續發展';
  } else if (insult) {
    localScore = 46;
    judgement = '含針對可識別對象的辱罵或人身攻擊語氣。';
    recommendation = '觀察或提醒';
  } else if (heated || fightMode) {
    localScore = fightMode ? 38 : 28;
    judgement = fightMode ? 'Fight 討論可保留較高討論容忍度，目前未見明確個資、威脅或重大指控。' : '語氣較強，但目前較像一般意見或抱怨。';
    recommendation = fightMode ? '觀察討論脈絡' : '正常放行';
  }

  const riskScore = Math.max(Math.round(storedRiskScore || 0), localScore);
  return {
    riskScore,
    riskLevel: getRiskLevelFromScore(riskScore),
    judgement,
    recommendation,
  };
}

function createContentWatchItem({
  sourceType,
  sourcePath,
  postId,
  commentId,
  replyId,
  data,
  fallbackCategory,
}: {
  sourceType: SourceType;
  sourcePath: string;
  postId: string;
  commentId?: string;
  replyId?: string;
  data: DocumentData;
  fallbackCategory?: string;
}): ContentWatchItem {
  const fightMode = isFightMarked(data);
  const preview = safeText(data.content || data.quarantinedContentPreview || data.contentPreview || data.aiSummary);
  const storedRiskScore = Number(data.moderationRiskScore || getStoredRiskScore(data) || 0);
  const localJudgement = getLocalJudgement(preview, fightMode, storedRiskScore);
  const moderationRiskLevel = String(data.moderationRiskLevel || '');
  const riskLevel = ['critical', 'high', 'medium', 'low'].includes(moderationRiskLevel)
    ? moderationRiskLevel as RiskLevel
    : localJudgement.riskLevel;
  const riskScore = Math.max(localJudgement.riskScore, Math.round(storedRiskScore || 0));
  const moderationStatus = safeText(data.moderationStatus);

  return {
    id: compactPathId(sourcePath),
    sourceType,
    sourcePath,
    postId,
    commentId,
    replyId,
    authorId: safeText(data.authorId),
    authorName: safeText(data.authorName || compactUid(safeText(data.authorId))),
    category: safeText(data.category || data.aiTag || fallbackCategory),
    contentPreview: preview || (moderationStatus === 'removed' ? '內容已被移除。' : '無內容預覽。'),
    riskLevel,
    riskScore,
    fightMode,
    moderationStatus,
    judgement: moderationStatus === 'removed' ? '此內容已被站長或系統移除。' : localJudgement.judgement,
    recommendation: moderationStatus === 'removed' ? '已移除' : localJudgement.recommendation,
    createdAt: data.createdAt,
  };
}

async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} 讀取逾時`)), ms);
  });

  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function extractTopics(...parts: Array<unknown>) {
  const text = parts.map(part => safeText(part)).join(' ');
  const topics = new Set<string>();
  const hashMatches = text.match(/#[\p{L}\p{N}_-]+/gu) || [];
  hashMatches.forEach(match => topics.add(match.replace(/^#/, '')));
  KNOWN_TOPICS.forEach(topic => {
    if (text.includes(topic)) topics.add(topic);
  });
  return Array.from(topics).slice(0, 8);
}

function addWeightedEdge(map: Map<string, GraphLink>, source: string, target: string, weight: number, type: string) {
  if (!source || !target || source === target) return;
  const [a, b] = source < target ? [source, target] : [target, source];
  const key = `${a}::${b}::${type}`;
  const existing = map.get(key);
  if (existing) {
    existing.weight += weight;
  } else {
    map.set(key, { source: a, target: b, weight, type });
  }
}

function addTopicEdges(map: Map<string, GraphLink>, topics: string[], weight: number, type: string) {
  for (let i = 0; i < topics.length; i += 1) {
    for (let j = i + 1; j < topics.length; j += 1) {
      addWeightedEdge(map, topics[i], topics[j], weight, type);
    }
  }
}

function getComponentClusters(nodes: GraphNode[], links: GraphLink[]) {
  const adjacency = new Map<string, string[]>();
  nodes.forEach(node => adjacency.set(node.id, []));
  links.forEach(link => {
    adjacency.get(link.source)?.push(link.target);
    adjacency.get(link.target)?.push(link.source);
  });

  const clusters = new Map<string, string>();
  let clusterIndex = 0;

  nodes.forEach(node => {
    if (clusters.has(node.id)) return;
    const clusterId = `c${clusterIndex}`;
    clusterIndex += 1;
    const stack = [node.id];
    clusters.set(node.id, clusterId);
    while (stack.length) {
      const current = stack.pop() as string;
      (adjacency.get(current) || []).forEach(next => {
        if (clusters.has(next)) return;
        clusters.set(next, clusterId);
        stack.push(next);
      });
    }
  });

  return clusters;
}

async function loadUsers() {
  const users = new Map<string, UserMeta>();
  try {
    const snapshot = await withTimeout(getDocs(collection(db, 'users')), 8000, 'users');
    snapshot.docs.forEach(userDoc => {
      const data = userDoc.data();
      users.set(userDoc.id, {
        uid: userDoc.id,
        label: safeText(data.displayName || data.islanderId || compactUid(userDoc.id)),
        role: data.role,
      });
    });
  } catch (error) {
    console.warn('Users read failed:', error);
  }
  return users;
}

async function loadPatrolCases() {
  const authUid = auth.currentUser?.uid || null;
  try {
    const snapshot = await withTimeout(
      getDocs(query(collection(db, 'moderationCases'), orderBy('createdAt', 'desc'), firestoreLimit(80))),
      8000,
      'moderationCases',
    );
    return {
      authUid,
      cases: snapshot.docs.map(caseDoc => ({ id: caseDoc.id, ...caseDoc.data() } as PatrolCase)),
    };
  } catch (error) {
    console.warn('Moderation cases read failed:', error);
    return {
      authUid,
      cases: [] as PatrolCase[],
      error: formatReadError(error),
    };
  }
}

async function collectLabData(scanLimit: number): Promise<LabData> {
  const startedAt = Date.now();
  const users = await loadUsers();
  const postsSnapshot = await withTimeout(
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), firestoreLimit(scanLimit))),
    10000,
    'posts',
  );
  const patrolCaseResult = await loadPatrolCases();
  const patrolFeed = patrolCaseResult.cases.sort((a, b) => getCaseSortScore(b) - getCaseSortScore(a));

  const userWeights = new Map<string, number>();
  const userRisk = new Map<string, number>();
  const edgeMap = new Map<string, GraphLink>();
  const topicWeights = new Map<string, number>();
  const topicRisk = new Map<string, number>();
  const topicEdgeMap = new Map<string, GraphLink>();
  const riskTimeline = createTimelineBuckets(startedAt);
  const categoryStats = new Map<string, { label: string; count: number; riskTotal: number; maxRisk: number }>();
  const contentItems: ContentWatchItem[] = [];
  const consoleLines: string[] = [
    `Firebase 專案 ${firebaseConfig.projectId} / 資料庫 ${firebaseConfig.firestoreDatabaseId || '(default)'}。`,
  ];
  let interactions = 0;
  let fightContentCount = 0;

  for (const postDoc of postsSnapshot.docs) {
    const post = postDoc.data();
    const postId = postDoc.id;
    const authorId = safeText(post.authorId);
    const riskScore = getStoredRiskScore(post);
    const postFightMode = isFightMarked(post);
    if (postFightMode) fightContentCount += 1;
    addTimelineEvent(riskTimeline, post.createdAt, riskScore, postFightMode);
    addCategoryStat(categoryStats, post.category || post.aiTag || '貼文', riskScore, 1);
    contentItems.push(createContentWatchItem({
      sourceType: 'post',
      sourcePath: `posts/${postId}`,
      postId,
      data: post,
      fallbackCategory: '貼文',
    }));
    if (authorId) {
      userWeights.set(authorId, (userWeights.get(authorId) || 0) + 4);
      userRisk.set(authorId, Math.max(userRisk.get(authorId) || 0, riskScore));
      if (!users.has(authorId)) {
        users.set(authorId, { uid: authorId, label: safeText(post.authorName || compactUid(authorId)) });
      }
    }

    const postTopics = extractTopics(post.category, post.aiTag, post.content);
    postTopics.forEach(topic => {
      topicWeights.set(topic, (topicWeights.get(topic) || 0) + 3);
      topicRisk.set(topic, Math.max(topicRisk.get(topic) || 0, riskScore));
      addCategoryStat(categoryStats, topic, riskScore, 1);
    });
    addTopicEdges(topicEdgeMap, postTopics, 2, 'post-context');

    try {
      const [postLikesSnapshot, commentsSnapshot] = await Promise.all([
        withTimeout(getDocs(collection(db, 'posts', postId, 'likes')), 6000, `post likes ${postId}`),
        withTimeout(getDocs(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'))), 6000, `post comments ${postId}`),
      ]);

      postLikesSnapshot.docs.forEach(likeDoc => {
        interactions += 1;
        userWeights.set(likeDoc.id, (userWeights.get(likeDoc.id) || 0) + 1);
        addWeightedEdge(edgeMap, authorId, likeDoc.id, 1, 'post-like');
      });

      for (const commentDoc of commentsSnapshot.docs) {
        const comment = commentDoc.data();
        const commenterId = safeText(comment.authorId);
        const commentRisk = getStoredRiskScore(comment);
        const commentFightMode = isFightMarked(comment);
        if (commentFightMode) fightContentCount += 1;
        addTimelineEvent(riskTimeline, comment.createdAt, commentRisk, commentFightMode);
        addCategoryStat(categoryStats, post.category || '留言', commentRisk, 1);
        contentItems.push(createContentWatchItem({
          sourceType: 'comment',
          sourcePath: `posts/${postId}/comments/${commentDoc.id}`,
          postId,
          commentId: commentDoc.id,
          data: comment,
          fallbackCategory: safeText(post.category || '留言'),
        }));
        interactions += 1;
        userWeights.set(commenterId, (userWeights.get(commenterId) || 0) + 3);
        userRisk.set(commenterId, Math.max(userRisk.get(commenterId) || 0, commentRisk));
        if (!users.has(commenterId)) {
          users.set(commenterId, { uid: commenterId, label: safeText(comment.authorName || compactUid(commenterId)) });
        }
        addWeightedEdge(edgeMap, authorId, commenterId, 3, 'comment');

        const commentTopics = extractTopics(post.category, post.aiTag, post.content, comment.content);
        commentTopics.forEach(topic => {
          topicWeights.set(topic, (topicWeights.get(topic) || 0) + 1);
          topicRisk.set(topic, Math.max(topicRisk.get(topic) || 0, commentRisk));
          addCategoryStat(categoryStats, topic, commentRisk, 1);
        });
        addTopicEdges(topicEdgeMap, commentTopics, 1, 'comment-context');

        const [commentLikesSnapshot, repliesSnapshot] = await Promise.all([
          withTimeout(getDocs(collection(db, 'posts', postId, 'comments', commentDoc.id, 'likes')), 6000, `comment likes ${commentDoc.id}`),
          withTimeout(getDocs(query(collection(db, 'posts', postId, 'comments', commentDoc.id, 'replies'), orderBy('createdAt', 'asc'))), 6000, `comment replies ${commentDoc.id}`),
        ]);

        commentLikesSnapshot.docs.forEach(likeDoc => {
          interactions += 1;
          userWeights.set(likeDoc.id, (userWeights.get(likeDoc.id) || 0) + 1);
          addWeightedEdge(edgeMap, commenterId, likeDoc.id, 1, 'comment-like');
        });

        for (const replyDoc of repliesSnapshot.docs) {
          const reply = replyDoc.data();
          const replyAuthorId = safeText(reply.authorId);
          const replyRisk = getStoredRiskScore(reply);
          const replyFightMode = isFightMarked(reply);
          if (replyFightMode) fightContentCount += 1;
          addTimelineEvent(riskTimeline, reply.createdAt, replyRisk, replyFightMode);
          addCategoryStat(categoryStats, post.category || '留言回覆', replyRisk, 1);
          contentItems.push(createContentWatchItem({
            sourceType: 'reply',
            sourcePath: `posts/${postId}/comments/${commentDoc.id}/replies/${replyDoc.id}`,
            postId,
            commentId: commentDoc.id,
            replyId: replyDoc.id,
            data: reply,
            fallbackCategory: safeText(post.category || '留言回覆'),
          }));
          interactions += 1;
          userWeights.set(replyAuthorId, (userWeights.get(replyAuthorId) || 0) + 2);
          userRisk.set(replyAuthorId, Math.max(userRisk.get(replyAuthorId) || 0, replyRisk));
          if (!users.has(replyAuthorId)) {
            users.set(replyAuthorId, { uid: replyAuthorId, label: safeText(reply.authorName || compactUid(replyAuthorId)) });
          }
          addWeightedEdge(edgeMap, commenterId, replyAuthorId, 2, 'reply');

          const replyTopics = extractTopics(post.category, post.aiTag, post.content, comment.content, reply.content);
          replyTopics.forEach(topic => {
            topicWeights.set(topic, (topicWeights.get(topic) || 0) + 1);
            topicRisk.set(topic, Math.max(topicRisk.get(topic) || 0, replyRisk));
            addCategoryStat(categoryStats, topic, replyRisk, 1);
          });
          addTopicEdges(topicEdgeMap, replyTopics, 1, 'reply-context');
        }
      }
    } catch (error) {
      console.warn('Interaction scan failed:', postId, error);
    }
  }

  const socialLinks = Array.from(edgeMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 220);
  const socialIds = new Set<string>();
  socialLinks.forEach(link => {
    socialIds.add(link.source);
    socialIds.add(link.target);
  });
  Array.from(userWeights.keys()).slice(0, 40).forEach(uid => socialIds.add(uid));

  const socialNodes = Array.from(socialIds).map(uid => {
    const meta = users.get(uid);
    const weight = userWeights.get(uid) || 1;
    const risk = userRisk.get(uid) || 0;
    return {
      id: uid,
      label: meta?.label || compactUid(uid),
      type: 'user' as const,
      role: meta?.role,
      weight,
      risk,
      cluster: 'c0',
      color: meta?.role === 'admin' ? STATION_MASTER_NODE_COLOR : USER_COLORS[Math.abs(uid.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % USER_COLORS.length],
    };
  });
  const socialClusters = getComponentClusters(socialNodes, socialLinks);
  socialNodes.forEach(node => {
    node.cluster = socialClusters.get(node.id) || 'c0';
  });

  const topicLinks = Array.from(topicEdgeMap.values())
    .filter(link => topicWeights.has(link.source) && topicWeights.has(link.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 180);
  const topicIds = new Set<string>();
  topicLinks.forEach(link => {
    topicIds.add(link.source);
    topicIds.add(link.target);
  });
  Array.from(topicWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .forEach(([topic]) => topicIds.add(topic));

  const topicNodes = Array.from(topicIds).map(topic => {
    const weight = topicWeights.get(topic) || 1;
    const risk = topicRisk.get(topic) || 0;
    return {
      id: topic,
      label: `#${topic}`,
      type: 'topic' as const,
      weight,
      risk,
      cluster: 'topic',
      color: TOPIC_COLORS[Math.abs(topic.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % TOPIC_COLORS.length],
    };
  });

  patrolFeed.forEach(item => {
    const riskScore = Number(item.riskScore || 0);
    addTimelineEvent(riskTimeline, item.createdAt || item.updatedAt, riskScore, isFightMarked(item));
    if (item.categories?.length) {
      item.categories.forEach(category => addCategoryStat(categoryStats, category, riskScore, 1));
    } else {
      addCategoryStat(categoryStats, item.category || item.sourceType || 'AI 案件', riskScore, 1);
    }
  });

  const riskCounts = patrolFeed.reduce((counts, item) => {
    const level = ['critical', 'high', 'medium', 'low'].includes(String(item.riskLevel))
      ? String(item.riskLevel)
      : getRiskLevelFromScore(Number(item.riskScore || 0));
    counts[level] = (counts[level] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const caseFightCount = patrolFeed.filter(isFightMarked).length;
  const visibleFightContentCount = Math.max(fightContentCount, caseFightCount);
  const sortedContentItems = contentItems
    .sort((a, b) => {
      const riskDelta = b.riskScore - a.riskScore;
      if (riskDelta) return riskDelta;
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    })
    .slice(0, 160);
  const activeCaseCount = patrolFeed.filter(isActiveCase).length;
  const highRiskCaseCount = patrolFeed.filter(item => {
    const level = ['critical', 'high', 'medium', 'low'].includes(String(item.riskLevel))
      ? String(item.riskLevel)
      : getRiskLevelFromScore(Number(item.riskScore || 0));
    return level === 'critical' || level === 'high';
  }).length;
  const recentEventCount = riskTimeline.slice(-3).reduce((sum, item) => sum + item.total, 0);
  const categoryMetrics = Array.from(categoryStats.entries()).map(([id, stat]) => {
    const averageRisk = stat.count ? stat.riskTotal / stat.count : 0;
    const riskScore = Math.round(Math.max(averageRisk, stat.maxRisk));
    return {
      id,
      label: stat.label,
      count: stat.count,
      riskScore,
      tone: getRiskTone(getRiskLevelFromScore(riskScore)),
    };
  }).sort((a, b) => (b.riskScore + b.count * 2) - (a.riskScore + a.count * 2)).slice(0, 8);
  const opsMetrics: OpsMetric[] = [
    {
      id: 'active-cases',
      label: '待處理案件',
      value: String(activeCaseCount),
      hint: activeCaseCount ? '先看右側案件列' : '目前無明顯積壓',
      tone: getRiskTone(activeCaseCount ? 'medium' : 'low'),
    },
    {
      id: 'high-risk',
      label: '高風險以上',
      value: String(highRiskCaseCount),
      hint: highRiskCaseCount ? '建議優先人工覆核' : '目前風險曲線平穩',
      tone: getRiskTone(highRiskCaseCount ? 'high' : 'low'),
    },
    {
      id: 'fight-content',
      label: 'Fight 內容',
      value: String(visibleFightContentCount),
      hint: visibleFightContentCount ? '需要較高治理密度' : '目前沒有標記內容',
      tone: getRiskTone(visibleFightContentCount ? 'medium' : 'low'),
    },
    {
      id: 'recent-pulse',
      label: '近 3 小時聲量',
      value: String(recentEventCount),
      hint: recentEventCount > 12 ? '討論正在升溫' : '聲量維持可控',
      tone: getRiskTone(recentEventCount > 12 ? 'medium' : 'low'),
    },
    {
      id: 'content-watch',
      label: '內容判斷',
      value: String(sortedContentItems.length),
      hint: sortedContentItems.length ? '一般貼文也已納入後台' : '等待內容同步',
      tone: '#38bdf8',
    },
  ];

  consoleLines.push(`已掃描 ${postsSnapshot.size} 篇貼文，耗時 ${Date.now() - startedAt}ms。`);
  consoleLines.push(`已建立 ${socialNodes.length} 個島民節點與 ${socialLinks.length} 條互動連線。`);
  consoleLines.push(`已建立 ${topicNodes.length} 個話題節點與 ${topicLinks.length} 條語意連線。`);
  consoleLines.push(`已整理 ${sortedContentItems.length} 筆貼文、留言與回覆判斷項目。`);
  if (patrolCaseResult.error) {
    consoleLines.push(`AI 案件讀取失敗：${patrolCaseResult.error}`);
  } else if (!patrolCaseResult.authUid) {
    consoleLines.push('尚未登入站長帳號，因此只顯示公開掃描資料。');
  } else if (patrolCaseResult.authUid !== STATION_MASTER_UID) {
    consoleLines.push(`目前登入 UID ${compactUid(patrolCaseResult.authUid)} 不是站長 UID，無法讀取全部 AI 案件。`);
  } else if (!patrolFeed.length) {
    consoleLines.push('站長權限已確認，但目前 moderationCases 沒有可顯示案件。請確認後端巡邏功能已產生案件。');
  } else {
    consoleLines.push(`已讀取 ${patrolFeed.length} 筆 AI 案件。`);
  }

  return {
    socialNodes,
    socialLinks,
    topicNodes,
    topicLinks,
    postsScanned: postsSnapshot.size,
    interactions,
    usersSeen: socialNodes.length,
    topicCount: topicNodes.length,
    riskCounts,
    patrolFeed,
    riskTimeline,
    categoryMetrics,
    opsMetrics,
    fightContentCount: visibleFightContentCount,
    contentItems: sortedContentItems,
    consoleLines,
    caseReadError: patrolCaseResult.error,
    caseReadAuthUid: patrolCaseResult.authUid,
  };
}

function ForceGraph({ nodes, links, mode }: { nodes: GraphNode[]; links: GraphLink[]; mode: GraphMode }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = React.useState<GraphNode | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    let animationId = 0;
    const nodeMap = new Map<string, GraphNode>();
    const graphNodes = nodes.map((node, index) => ({
      ...node,
      x: canvas.clientWidth / 2 + Math.cos(index) * 160 + Math.random() * 40,
      y: canvas.clientHeight / 2 + Math.sin(index) * 160 + Math.random() * 40,
      vx: 0,
      vy: 0,
    }));
    graphNodes.forEach(node => nodeMap.set(node.id, node));

    const graphLinks = links
      .map(link => ({
        ...link,
        sourceNode: nodeMap.get(link.source),
        targetNode: nodeMap.get(link.target),
      }))
      .filter(link => link.sourceNode && link.targetNode);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      frame += 1;

      for (let i = 0; i < graphNodes.length; i += 1) {
        const a = graphNodes[i];
        for (let j = i + 1; j < graphNodes.length; j += 1) {
          const b = graphNodes[j];
          const dx = (a.x || 0) - (b.x || 0);
          const dy = (a.y || 0) - (b.y || 0);
          const distanceSq = Math.max(80, dx * dx + dy * dy);
          const force = mode === 'social' ? 520 / distanceSq : 720 / distanceSq;
          const fx = dx * force;
          const fy = dy * force;
          a.vx = (a.vx || 0) + fx;
          a.vy = (a.vy || 0) + fy;
          b.vx = (b.vx || 0) - fx;
          b.vy = (b.vy || 0) - fy;
        }
      }

      graphLinks.forEach(link => {
        const source = link.sourceNode as GraphNode;
        const target = link.targetNode as GraphNode;
        const dx = (target.x || 0) - (source.x || 0);
        const dy = (target.y || 0) - (source.y || 0);
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const desired = Math.max(70, 180 - Math.min(95, link.weight * 12));
        const pull = (distance - desired) * 0.0028 * Math.min(5, link.weight);
        const fx = (dx / distance) * pull;
        const fy = (dy / distance) * pull;
        source.vx = (source.vx || 0) + fx;
        source.vy = (source.vy || 0) + fy;
        target.vx = (target.vx || 0) - fx;
        target.vy = (target.vy || 0) - fy;
      });

      graphNodes.forEach(node => {
        const centerPull = mode === 'social' ? 0.006 : 0.008;
        node.vx = ((node.vx || 0) + (width / 2 - (node.x || 0)) * centerPull) * 0.86;
        node.vy = ((node.vy || 0) + (height / 2 - (node.y || 0)) * centerPull) * 0.86;
        node.x = Math.max(28, Math.min(width - 28, (node.x || width / 2) + node.vx));
        node.y = Math.max(28, Math.min(height - 28, (node.y || height / 2) + node.vy));
      });

      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, Math.max(width, height) * 0.65);
      gradient.addColorStop(0, 'rgba(0, 217, 232, 0.11)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      graphLinks.forEach(link => {
        const source = link.sourceNode as GraphNode;
        const target = link.targetNode as GraphNode;
        const alpha = Math.min(0.55, 0.08 + link.weight * 0.035);
        ctx.strokeStyle = mode === 'social'
          ? `rgba(0, 217, 232, ${alpha})`
          : `rgba(249, 115, 22, ${alpha})`;
        ctx.lineWidth = Math.min(5, 0.5 + link.weight * 0.35);
        ctx.beginPath();
        ctx.moveTo(source.x || 0, source.y || 0);
        ctx.lineTo(target.x || 0, target.y || 0);
        ctx.stroke();
      });
      ctx.restore();

      graphNodes.forEach(node => {
        const radius = Math.max(4, Math.min(18, 4 + Math.sqrt(node.weight) * 2.2));
        const pulse = Math.sin(frame / 18 + radius) * 0.8;
        const nodeTone = getNodeRiskTone(node.risk, node.color);
        ctx.save();
        ctx.shadowColor = nodeTone;
        ctx.shadowBlur = node.risk >= 35 ? 24 : 14;
        ctx.fillStyle = nodeTone;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = node.role === 'admin' ? 'rgba(0, 217, 232, 0.95)' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = node.role === 'admin' ? 2.5 : 1;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius + 4, 0, Math.PI * 2);
        ctx.stroke();

        if (node.role === 'admin') {
          ctx.fillStyle = 'rgba(0, 217, 232, 0.92)';
          ctx.font = '900 10px Inter, system-ui, sans-serif';
          ctx.fillText('站長', (node.x || 0) - 11, (node.y || 0) - radius - 8);
        }

        if (node.weight >= 6 || node.risk >= 35) {
          ctx.fillStyle = 'rgba(232, 252, 255, 0.82)';
          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.fillText(node.label.slice(0, 18), (node.x || 0) + radius + 7, (node.y || 0) + 4);
        }
      });

      animationId = requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let nearest: GraphNode | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      graphNodes.forEach(node => {
        const dx = (node.x || 0) - x;
        const dy = (node.y || 0) - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearestDistance && distance < 26) {
          nearest = node;
          nearestDistance = distance;
        }
      });
      setHovered(nearest);
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', resize);
    };
  }, [nodes, links, mode]);

  return (
    <div className="graph-shell">
      <canvas ref={canvasRef} className="force-canvas" />
      <div className="scan-ring scan-ring-one" />
      <div className="scan-ring scan-ring-two" />
      {hovered && (
        <div className="node-tooltip">
          <span>{hovered.type === 'user' ? '島民 UID' : '話題'}</span>
          <strong>{hovered.label}</strong>
          <em>權重 {Math.round(hovered.weight)} | {getRiskBandLabel(hovered.risk)}風險 {Math.round(hovered.risk)}</em>
        </div>
      )}
    </div>
  );
}

function OpsDeck({ metrics }: { metrics: OpsMetric[] }) {
  const visibleMetrics = metrics.length ? metrics : [
    { id: 'boot-scan', label: '掃描狀態', value: '--', hint: '等待第一次資料同步', tone: '#00d9e8' },
    { id: 'boot-case', label: '案件狀態', value: '--', hint: '登入後讀取站長案件', tone: '#38bdf8' },
    { id: 'boot-topic', label: '熱區狀態', value: '--', hint: '正在建立話題雷達', tone: '#a78bfa' },
    { id: 'boot-pulse', label: '聲量狀態', value: '--', hint: '同步後顯示近 3 小時', tone: '#30f2a2' },
  ];

  return (
    <section className="ops-deck" aria-label="戰情總覽">
      <div className="ops-deck-title">
        <span>戰情總覽</span>
        <strong>即時治理脈搏</strong>
      </div>
      {visibleMetrics.map(metric => (
        <article key={metric.id} className="ops-card" style={{ '--tone': metric.tone } as React.CSSProperties}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.hint}</p>
        </article>
      ))}
    </section>
  );
}

function RiskTimeline({ buckets }: { buckets: RiskTimelineBucket[] }) {
  const maxTotal = Math.max(1, ...buckets.map(bucket => bucket.total));
  const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

  return (
    <section className="insight-panel timeline-panel">
      <div className="insight-head">
        <span>風險時間線</span>
        <strong>近 12 小時</strong>
      </div>
      <div className="timeline-chart">
        {buckets.map(bucket => {
          const barHeight = bucket.total ? Math.max(8, Math.round((bucket.total / maxTotal) * 100)) : 2;
          return (
            <div key={bucket.start} className="timeline-column">
              <div
                className="timeline-bar"
                style={{ height: `${barHeight}%` }}
                title={`${bucket.label} / ${bucket.total} 筆 / Fight ${bucket.fight} 筆`}
              >
                {levels.map(level => {
                  const value = bucket[level];
                  if (!value) return null;
                  return (
                    <i
                      key={level}
                      style={{
                        flex: value,
                        background: getRiskTone(level),
                      }}
                    />
                  );
                })}
              </div>
              <span>{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <div className="timeline-legend">
        {levels.map(level => (
          <span key={level}><i style={{ background: getRiskTone(level) }} />{getRiskLabel(level)}</span>
        ))}
      </div>
    </section>
  );
}

function CategoryRadar({ metrics }: { metrics: CategoryMetric[] }) {
  const maxCount = Math.max(1, ...metrics.map(metric => metric.count));

  return (
    <section className="insight-panel">
      <div className="insight-head">
        <span>言論熱區雷達</span>
        <strong>話題與風險交會</strong>
      </div>
      <div className="radar-list">
        {metrics.length ? metrics.map(metric => (
          <article key={metric.id} className="radar-row" style={{ '--tone': metric.tone } as React.CSSProperties}>
            <div>
              <strong>{metric.label}</strong>
              <span>{metric.count} 筆 / 峰值 {metric.riskScore}</span>
            </div>
            <div className="radar-track">
              <i style={{ width: `${Math.max(8, (metric.count / maxCount) * 100)}%` }} />
            </div>
          </article>
        )) : (
          <div className="insight-empty">目前還沒有足夠資料形成熱區。</div>
        )}
      </div>
    </section>
  );
}

function CommanderBrief({
  selectedCase,
  activeCaseCount,
  highRiskCaseCount,
  fightContentCount,
}: {
  selectedCase: PatrolCase | null;
  activeCaseCount: number;
  highRiskCaseCount: number;
  fightContentCount: number;
}) {
  const selectedRisk = Number(selectedCase?.riskScore || 0);
  let headline = '目前站況平穩';
  let detail = '可以先看互動圖與熱區雷達，確認是否有突然聚集的討論脈絡。';

  if (selectedCase && selectedRisk >= 70) {
    headline = '優先處理選取案件';
    detail = `${selectedCase.publicCaseId || selectedCase.id} 已達 ${Math.round(selectedRisk)}/100，建議先確認內容脈絡再決定放行、隔離或移除。`;
  } else if (highRiskCaseCount) {
    headline = '高風險案件需要人工覆核';
    detail = `目前有 ${highRiskCaseCount} 筆高風險以上案件，建議先處理右側案件列最上方項目。`;
  } else if (activeCaseCount) {
    headline = '案件量可控，適合批次整理';
    detail = `目前 ${activeCaseCount} 筆處理中案件，可依狀態逐筆放行、隔離或標記已審。`;
  } else if (fightContentCount) {
    headline = 'Fight 討論存在，但尚未升高';
    detail = `目前掃到 ${fightContentCount} 筆 Fight 內容，建議觀察是否開始集中在同一話題。`;
  }

  return (
    <section className="insight-panel commander-brief">
      <div className="insight-head">
        <span>站長決策提示</span>
        <strong>下一步建議</strong>
      </div>
      <div className="brief-core">
        <Shield size={26} />
        <div>
          <strong>{headline}</strong>
          <p>{detail}</p>
        </div>
      </div>
      <div className="brief-pills">
        <span>處理中 {activeCaseCount}</span>
        <span>高風險 {highRiskCaseCount}</span>
        <span>Fight {fightContentCount}</span>
      </div>
    </section>
  );
}

function AccessGate({
  user,
  authReady,
  isSigningIn,
  authMessage,
  onLogin,
}: {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authMessage: string;
  onLogin: () => void;
}) {
  return (
    <main className="lab-root gate-root">
      <div className="hud-grid" />
      <section className="gate-card">
        <div className="brand-orb"><Shield size={24} /></div>
        <p>MATSU STATION</p>
        <h1>站長後台</h1>
        <span>此系統只允許站長 Google 帳號進入。</span>
        {authMessage && <div className="gate-message">{authMessage}</div>}
        {!authReady ? (
          <button className="primary" disabled>確認登入狀態中...</button>
        ) : (
          <button className="primary gate-login" disabled={isSigningIn} onClick={onLogin}>
            {isSigningIn ? 'Google 登入中...' : 'Google 登入'}
          </button>
        )}
        {user && user.uid !== STATION_MASTER_UID && (
          <small>目前帳號沒有權限，系統會自動登出並返回登入頁。</small>
        )}
      </section>
    </main>
  );
}

function ContentWatchDesk({
  items,
  actionState,
  onAction,
}: {
  items: ContentWatchItem[];
  actionState: { itemId: string; action: ContentAction } | null;
  onAction: (item: ContentWatchItem, action: ContentAction) => void;
}) {
  const visibleItems = items.slice(0, 36);

  return (
    <section className="content-watch-panel">
      <div className="content-watch-head">
        <div>
          <span className="eyebrow">全站內容判斷台</span>
          <h2>貼文、留言、回覆都納入治理視野</h2>
        </div>
        <div className="content-watch-stats">
          <span>顯示 {visibleItems.length}</span>
          <span>總判斷 {items.length}</span>
        </div>
      </div>

      <div className="content-watch-list">
        {visibleItems.length ? visibleItems.map(item => {
          const isRemoved = item.moderationStatus === 'removed';
          const sourceLabel = getSourceLabel(item.sourceType);
          return (
            <article key={item.id} className={`content-watch-item ${isRemoved ? 'removed' : ''}`}>
              <div className="content-watch-main">
                <div className="content-watch-line">
                  <span style={{ color: getRiskTone(item.riskLevel) }}>{getRiskLabel(item.riskLevel)} {Math.round(item.riskScore)}</span>
                  <em>{sourceLabel}</em>
                  {item.fightMode && <em className="fight-chip">FIGHT</em>}
                  {item.moderationStatus && <em>{getStatusLabel(item.moderationStatus)}</em>}
                </div>
                <strong>{item.authorName || compactUid(item.authorId)} / {item.category || '未分類'}</strong>
                <p>{item.contentPreview}</p>
                <small>{item.judgement}</small>
              </div>
              <div className="content-watch-action">
                <span>{item.recommendation}</span>
                <button
                  className="warn"
                  disabled={Boolean(actionState) || isRemoved}
                  onClick={() => onAction(item, 'hide')}
                >
                  <CircleSlash size={14} />
                  遮蔽
                </button>
                <button
                  className="danger"
                  disabled={Boolean(actionState)}
                  onClick={() => onAction(item, 'delete')}
                >
                  <CircleSlash size={14} />
                  完全移除
                </button>
              </div>
            </article>
          );
        }) : (
          <div className="content-watch-empty">
            <Activity size={22} />
            <p>還沒有讀到可判斷的貼文、留言或回覆。登入站長帳號後會自動同步。</p>
          </div>
        )}
      </div>
    </section>
  );
}

class LabErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    console.error('Ranger lab runtime error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="lab-root">
        <div className="hud-grid" />
        <section className="case-empty runtime-crash">
          <AlertTriangle size={22} />
          <span>本地後台發生瀏覽器端錯誤，已阻止整頁閃退。</span>
          <code>{this.state.error}</code>
          <button onClick={() => window.location.reload()}>重新整理</button>
        </section>
      </main>
    );
  }
}

function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [mode, setMode] = React.useState<GraphMode>('social');
  const [caseFilter, setCaseFilter] = React.useState<CaseStatusFilter>('active');
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null);
  const [actionState, setActionState] = React.useState<{ caseId: string; action: RangerAction } | null>(null);
  const [contentActionState, setContentActionState] = React.useState<{ itemId: string; action: ContentAction } | null>(null);
  const [scanLimit, setScanLimit] = React.useState(60);
  const [data, setData] = React.useState<LabData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState('');
  const [lastLoadedAt, setLastLoadedAt] = React.useState<Date | null>(null);
  const [liveStatus, setLiveStatus] = React.useState('即時監看準備中');
  const isLoadInFlightRef = React.useRef(false);
  const queuedLoadRef = React.useRef(false);
  const queuedReasonRef = React.useRef('背景同步');
  const liveRefreshTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      setAuthReady(true);
      setAuthMessage('登入狀態確認較久，已先啟動本地後台；若 AI 案件仍未出現，請重新登入站長帳號。');
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      settled = true;
      window.clearTimeout(timer);
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) setAuthMessage('');
    });

    return () => {
      settled = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    void getRedirectResult(auth).catch(error => {
      setAuthMessage(formatAuthError(error));
    });
  }, []);

  React.useEffect(() => {
    if (!authReady || !user || user.uid === STATION_MASTER_UID) return;
    setAuthMessage(`此 Google 帳號沒有站長權限，已拒絕進入：${user.email || compactUid(user.uid)}`);
    void signOut(auth);
  }, [authReady, user]);

  const loadData = React.useCallback(async (reason = '手動刷新') => {
    if (isLoadInFlightRef.current) {
      queuedLoadRef.current = true;
      queuedReasonRef.current = reason;
      setLiveStatus(`${reason} 已排入下一輪同步`);
      return;
    }

    isLoadInFlightRef.current = true;
    setIsLoading(true);
    setLiveStatus(`${reason}中...`);
    try {
      const nextData = await withTimeout(collectLabData(scanLimit), 18000, '本地掃描');
      setData(nextData);
      setLastLoadedAt(new Date());
      setLiveStatus('即時監看中');
    } catch (error) {
      console.error(error);
      setLiveStatus('同步失敗，等待下一輪更新');
      setData(previous => ({
        ...previous,
        consoleLines: ['掃描失敗，請檢查 Firebase 權限與網路。', String(error)],
      }));
    } finally {
      setIsLoading(false);
      isLoadInFlightRef.current = false;
      if (queuedLoadRef.current) {
        const nextReason = queuedReasonRef.current;
        queuedLoadRef.current = false;
        window.setTimeout(() => void loadData(nextReason), 350);
      }
    }
  }, [scanLimit]);

  React.useEffect(() => {
    if (!authReady || user?.uid !== STATION_MASTER_UID) return;
    void loadData('初始同步');
  }, [authReady, user?.uid, loadData]);

  React.useEffect(() => {
    if (!authReady || user?.uid !== STATION_MASTER_UID) return;

    const scheduleLiveRefresh = (reason: string, delay = 900) => {
      setLiveStatus(`${reason}，等待同步`);
      if (liveRefreshTimerRef.current) {
        window.clearTimeout(liveRefreshTimerRef.current);
      }
      liveRefreshTimerRef.current = window.setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void loadData(reason);
      }, delay);
    };

    const unsubscribeList: Array<() => void> = [];

    let skippedInitialPosts = false;
    unsubscribeList.push(onSnapshot(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), firestoreLimit(scanLimit)),
      () => {
        if (!skippedInitialPosts) {
          skippedInitialPosts = true;
          setLiveStatus('即時監看中');
          return;
        }
        scheduleLiveRefresh('前台內容更新');
      },
      error => {
        console.warn('Posts live listener failed:', error);
        setLiveStatus(`前台監看暫停：${formatReadError(error)}`);
      },
    ));

    let skippedInitialCases = false;
    unsubscribeList.push(onSnapshot(
      query(collection(db, 'moderationCases'), orderBy('createdAt', 'desc'), firestoreLimit(80)),
      () => {
        if (!skippedInitialCases) {
          skippedInitialCases = true;
          setLiveStatus('站長案件監看中');
          return;
        }
        scheduleLiveRefresh('AI 案件更新');
      },
      error => {
        console.warn('Moderation cases live listener failed:', error);
        setLiveStatus(`AI 案件監看暫停：${formatReadError(error)}`);
      },
    ));

    const intervalId = window.setInterval(() => {
      scheduleLiveRefresh('定時同步', 250);
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleLiveRefresh('回到後台', 250);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeList.forEach(unsubscribe => unsubscribe());
      window.clearInterval(intervalId);
      if (liveRefreshTimerRef.current) {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authReady, user?.uid, scanLimit, loadData]);

  const nodes = mode === 'social' ? data.socialNodes : data.topicNodes;
  const links = mode === 'social' ? data.socialLinks : data.topicLinks;
  const highestRisk = Math.max(0, ...data.patrolFeed.map(item => Number(item.riskScore || 0)));
  const filteredCases = data.patrolFeed.filter(item => matchesCaseFilter(item, caseFilter));
  const selectedCase = data.patrolFeed.find(item => item.id === selectedCaseId) || filteredCases[0] || null;
  const activeCaseCount = data.patrolFeed.filter(isActiveCase).length;
  const highRiskCaseCount = data.patrolFeed.filter(item => {
    const level = ['critical', 'high', 'medium', 'low'].includes(String(item.riskLevel))
      ? String(item.riskLevel)
      : getRiskLevelFromScore(Number(item.riskScore || 0));
    return level === 'critical' || level === 'high';
  }).length;

  React.useEffect(() => {
    if (!selectedCaseId && filteredCases[0]) {
      setSelectedCaseId(filteredCases[0].id);
    }
    if (selectedCaseId && !data.patrolFeed.some(item => item.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0]?.id || null);
    }
  }, [data.patrolFeed, filteredCases, selectedCaseId]);

  const handleLogin = React.useCallback(async () => {
    setAuthMessage('');
    if (window.location.hostname === '127.0.0.1') {
      const port = window.location.port || '4321';
      const nextUrl = `http://localhost:${port}${window.location.pathname}${window.location.search}${window.location.hash}`;
      setAuthMessage('Google 登入需要使用 localhost，正在切換網址。');
      window.location.assign(nextUrl);
      return;
    }

    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (getAuthErrorCode(error) === 'auth/popup-blocked') {
        setAuthMessage(formatAuthError(error));
        await signInWithRedirect(auth, provider);
        return;
      }
      setAuthMessage(formatAuthError(error));
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const runCaseAction = React.useCallback(async (caseItem: PatrolCase, action: RangerAction) => {
    if (!user) return;

    const actionLabel = getActionLabel(action);

    if ((action === 'remove' || action === 'release') && !window.confirm(`確定要「${actionLabel}」案件 ${caseItem.publicCaseId || caseItem.id} 嗎？`)) {
      return;
    }

    setActionState({ caseId: caseItem.id, action });
    try {
      const callable = httpsCallable(functions, 'rangerModerationAction');
      await callable({ caseId: caseItem.id, action });
      setData(previous => ({
        ...previous,
        consoleLines: [
          `已完成「${actionLabel}」：${caseItem.publicCaseId || caseItem.id}。`,
          ...previous.consoleLines,
        ].slice(0, 8),
      }));
      await loadData('處置後同步');
    } catch (error) {
      console.error(error);
      setData(previous => ({
        ...previous,
        consoleLines: [
          `執行「${actionLabel}」失敗：${caseItem.publicCaseId || caseItem.id}。`,
          String(error),
          ...previous.consoleLines,
        ].slice(0, 8),
      }));
    } finally {
      setActionState(null);
    }
  }, [loadData, user]);

  const runContentAction = React.useCallback(async (item: ContentWatchItem, action: ContentAction) => {
    if (!user || user.uid !== STATION_MASTER_UID) return;

    const sourceLabel = getSourceLabel(item.sourceType);
    let reason = '';

    if (action === 'hide') {
      const input = window.prompt(`請輸入遮蔽這筆${sourceLabel}的原因：`, item.judgement);
      if (!input || !input.trim()) return;
      reason = input.trim().slice(0, 240);
    }

    if (action === 'delete' && !window.confirm(`確定要完全移除這筆${sourceLabel}嗎？\n\n這會刪除目標文件，前台不會再顯示墓碑。\n\n${item.contentPreview.slice(0, 90)}`)) {
      return;
    }

    setContentActionState({ itemId: item.id, action });
    try {
      const callable = httpsCallable(functions, 'rangerContentAction');
      await callable({
        sourcePath: item.sourcePath,
        action,
        reason,
      });
      const actionLabel = action === 'hide' ? '已遮蔽' : '已完全移除';
      setData(previous => ({
        ...previous,
        consoleLines: [
          `${actionLabel}：${item.sourcePath}。`,
          ...previous.consoleLines,
        ].slice(0, 8),
      }));
      await loadData(action === 'hide' ? '遮蔽後同步' : '完全移除後同步');
    } catch (error) {
      console.error(error);
      setData(previous => ({
        ...previous,
        consoleLines: [
          `${action === 'hide' ? '遮蔽' : '完全移除'}失敗：${item.sourcePath}。`,
          String(error),
          ...previous.consoleLines,
        ].slice(0, 8),
      }));
    } finally {
      setContentActionState(null);
    }
  }, [loadData, user]);

  if (!authReady || user?.uid !== STATION_MASTER_UID) {
    return (
      <AccessGate
        user={user}
        authReady={authReady}
        isSigningIn={isSigningIn}
        authMessage={authMessage}
        onLogin={() => void handleLogin()}
      />
    );
  }

  return (
    <main className="lab-root">
      <div className="hud-grid" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-orb"><Cpu size={22} /></div>
          <div>
            <p>MATSU STATION</p>
            <h1>AI 游騎兵本地後台</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-badge">本機限定</span>
          <span className="local-badge live-badge">{liveStatus}</span>
          {user ? (
            <>
              <span className="user-chip"><UserCircle2 size={15} />{user.displayName || user.email}</span>
              <button onClick={() => void signOut(auth)}>登出</button>
            </>
          ) : (
            <button className="primary" disabled={isSigningIn} onClick={() => void handleLogin()}>
              {isSigningIn ? '登入中...' : 'Google 登入'}
            </button>
          )}
        </div>
      </header>
      {authMessage && <div className="auth-message">{authMessage}</div>}
      <OpsDeck metrics={data.opsMetrics} />

      <section className="lab-layout">
        <aside className="panel left-panel">
          <div className="panel-title">
            <Radar size={18} />
            <span>游騎兵遙測</span>
          </div>
          <div className="metric-grid">
            <div><strong>{data.postsScanned}</strong><span>掃描貼文</span></div>
            <div><strong>{data.interactions}</strong><span>互動連線</span></div>
            <div><strong>{data.usersSeen}</strong><span>島民節點</span></div>
            <div><strong>{data.topicCount}</strong><span>話題節點</span></div>
          </div>

          <div className="connection-card">
            <span>Firebase 連線</span>
            <strong>{firebaseConfig.projectId}</strong>
            <em>{firebaseConfig.firestoreDatabaseId || '(default)'}</em>
            <p>
              {!authReady
                ? '正在確認登入狀態...'
                : !user
                  ? '目前使用公開讀取掃描；請登入站長帳號解鎖 AI 案件。'
                  : user.uid === STATION_MASTER_UID
                    ? '站長帳號已登入；可讀 AI 案件與執行處置。'
                    : `目前登入的不是站長帳號：${user.email || compactUid(user.uid)}`}
            </p>
          </div>

          <div className="control-block">
            <label>圖譜模式</label>
            <div className="segmented">
              <button className={mode === 'social' ? 'active' : ''} onClick={() => setMode('social')}>
                <Network size={15} /> 島民網絡
              </button>
              <button className={mode === 'topics' ? 'active' : ''} onClick={() => setMode('topics')}>
                <Tags size={15} /> 話題脈絡
              </button>
            </div>
          </div>

          <div className="control-block">
            <label>掃描深度：{scanLimit} 篇貼文</label>
            <input
              type="range"
              min="20"
              max="140"
              step="20"
              value={scanLimit}
              onChange={event => setScanLimit(Number(event.target.value))}
            />
          </div>

          <button className="wide-action" disabled={isLoading} onClick={() => void loadData()}>
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            {isLoading ? '掃描中' : '重新掃描'}
          </button>

          <div className="risk-stack">
            {(['critical', 'high', 'medium', 'low'] as const).map(level => (
              <div key={level}>
                <span style={{ color: getRiskTone(level) }}>{getRiskLabel(level)}</span>
                <strong>{data.riskCounts[level] || 0}</strong>
              </div>
            ))}
          </div>

          <div className="mission-note">
            <TerminalSquare size={15} />
            <p>本地後台只跑在你的電腦上。公開前台不會顯示這些站長操作。</p>
          </div>
        </aside>

        <section className="graph-panel">
          <div className="graph-status">
            <span><Eye size={15} /> {mode === 'social' ? '力導向島民互動圖' : '話題語意脈絡圖'}</span>
            <span>{nodes.length} 節點 / {links.length} 連線</span>
          </div>
          <div className="graph-legend" aria-label="圖例">
            <span><i style={{ background: '#ff2d55' }} />極高 90+</span>
            <span><i style={{ background: '#ff7a18' }} />高 70-89</span>
            <span><i style={{ background: '#facc15' }} />中 35-69</span>
            <span><i className="rainbow-dot" />低風險：冷色分群</span>
            <span><i className="station-dot" />站長節點</span>
          </div>
          <ForceGraph nodes={nodes} links={links} mode={mode} />
        </section>

        <aside className="panel right-panel">
          <div className="panel-title">
            <Shield size={18} />
            <span>AI 巡邏案件</span>
          </div>
          <div className="threat-card">
            <span>最高風險</span>
            <strong>{highestRisk}</strong>
            <em>/100</em>
          </div>

          <div className="case-filter">
            <Filter size={14} />
            {(['active', 'all', 'fight', 'escalated', 'downgraded', 'pending', 'quarantined', 'released', 'removed'] as CaseStatusFilter[]).map(filter => (
              <button
                key={filter}
                className={caseFilter === filter ? 'active' : ''}
                onClick={() => setCaseFilter(filter)}
              >
                {filter === 'active'
                  ? '處理中'
                  : filter === 'all'
                    ? '全部'
                    : filter === 'fight' || filter === 'escalated'
                      ? getGovernanceLabel(filter)
                      : getStatusLabel(filter)}
              </button>
            ))}
          </div>

          <div className="case-summary-strip">
            <div>
              <span>處理中</span>
              <strong>{activeCaseCount}</strong>
            </div>
            <div>
              <span>目前顯示</span>
              <strong>{filteredCases.length}</strong>
            </div>
          </div>

          <div className="feed-list">
            {filteredCases.length ? filteredCases.slice(0, 12).map(item => (
              <button
                key={item.id}
                className={`feed-item case-card ${selectedCase?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedCaseId(item.id)}
              >
                <div>
                  <span style={{ color: getRiskTone(item.riskLevel) }}>{getRiskLabel(item.riskLevel)}</span>
                  <em>{item.publicCaseId || item.id.slice(0, 12)}</em>
                </div>
                <small>
                  {getSourceLabel(item.sourceType)} / {getStatusLabel(item.status)} / {getGovernanceLabel(item.aiGovernanceMode)}
                  {item.fightMode ? ' / FIGHT' : ''}
                </small>
                <p>{item.summary || item.contentPreview || 'AI 案件尚無摘要'}</p>
              </button>
            )) : (
              <div className="empty-feed">
                <Activity size={22} />
                <p>
                  {!authReady
                    ? '正在確認登入狀態，稍後會自動讀取 AI 案件。'
                    : data.caseReadError
                      ? `AI 案件讀取失敗：${data.caseReadError}`
                      : !user
                        ? '請先登入站長帳號以讀取 AI 案件。'
                        : user.uid !== STATION_MASTER_UID
                          ? '目前登入的不是站長帳號，無法讀取全部 AI 案件。'
                          : '站長權限已確認，但目前沒有可顯示的 AI 案件。請確認後端巡邏功能已產生 moderationCases。'}
                </p>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="insight-grid">
        <RiskTimeline buckets={data.riskTimeline} />
        <CategoryRadar metrics={data.categoryMetrics} />
        <CommanderBrief
          selectedCase={selectedCase}
          activeCaseCount={activeCaseCount}
          highRiskCaseCount={highRiskCaseCount}
          fightContentCount={data.fightContentCount}
        />
      </section>

      <ContentWatchDesk
        items={data.contentItems}
        actionState={contentActionState}
        onAction={(item, action) => void runContentAction(item, action)}
      />

      <section className="case-inspector">
        {selectedCase ? (
          <>
            <div className="case-inspector-head">
              <div>
                <span className="eyebrow">案件檢視</span>
                <h2>{selectedCase.publicCaseId || selectedCase.id}</h2>
              </div>
              <div className="case-badges">
                <span style={{ borderColor: getRiskTone(selectedCase.riskLevel), color: getRiskTone(selectedCase.riskLevel) }}>
                  {getRiskLabel(selectedCase.riskLevel)} {Math.round(Number(selectedCase.riskScore || 0))}/100
                </span>
                <span>{getSourceLabel(selectedCase.sourceType)}</span>
                <span>{getStatusLabel(selectedCase.status)}</span>
                <span>{getGovernanceLabel(selectedCase.aiGovernanceMode)}</span>
                {selectedCase.fightMode && <span>FIGHT</span>}
              </div>
            </div>

            <div className="case-detail-grid">
              <div className="case-text">
                <label>AI 摘要</label>
                <p>{selectedCase.summary || '尚無摘要。'}</p>
              </div>
              <div className="case-text">
                <label>內容預覽</label>
                <p>{selectedCase.contentPreview || selectedCase.contentSnapshot || '內容已被遮罩或尚未同步。'}</p>
              </div>
              <div className="case-text">
                <label>法律風險</label>
                <p>{selectedCase.legalRisk || '未提供。'}</p>
              </div>
              <div className="case-text">
                <label>AI 建議</label>
                <p>{selectedCase.recommendedAction || selectedCase.rationale || '未提供。'}</p>
              </div>
            </div>

            <div className="case-meta-row">
              <span>作者：{selectedCase.authorName || compactUid(selectedCase.authorId || '')}</span>
              <span>分類：{selectedCase.category || '未分類'}</span>
              <span>模式：{getGovernanceLabel(selectedCase.aiGovernanceMode)}</span>
              {selectedCase.policyVersion && <span>規範版本：{selectedCase.policyVersion}</span>}
              <span>路徑：{selectedCase.sourcePath || 'unknown'}</span>
              {selectedCase.categories?.slice(0, 5).map(label => (
                <em key={label}>{label}</em>
              ))}
              {selectedCase.policyRefs?.map(ref => (
                <em key={`${selectedCase.id}-${ref.code}`}>{ref.code}：{ref.label}</em>
              ))}
            </div>

            <div className="case-actions">
              <button disabled={Boolean(actionState)} onClick={() => void runCaseAction(selectedCase, 'release')} className="ok">
                <CheckCircle2 size={15} /> 放行
              </button>
              <button disabled={Boolean(actionState)} onClick={() => void runCaseAction(selectedCase, 'quarantine')} className="warn">
                <FileWarning size={15} /> 隔離
              </button>
              <button disabled={Boolean(actionState)} onClick={() => void runCaseAction(selectedCase, 'remove')} className="danger">
                <CircleSlash size={15} /> 移除
              </button>
              <button disabled={Boolean(actionState)} onClick={() => void runCaseAction(selectedCase, 'mark_reviewed')}>
                <Gavel size={15} /> 已審
              </button>
              <button disabled={Boolean(actionState)} onClick={() => void runCaseAction(selectedCase, 'dismiss')}>
                <RotateCcw size={15} /> 忽略
              </button>
              {actionState && (
                <span className="action-state">
                  <RefreshCw size={14} className="spin" />
                  {getActionLabel(actionState.action)} / {actionState.caseId.slice(0, 10)}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="case-empty">
            <AlertTriangle size={18} />
            <span>尚未選取案件。</span>
          </div>
        )}
      </section>

      <footer className="console-panel">
        <div>
          <span>游騎兵主控台</span>
          <em>{lastLoadedAt ? lastLoadedAt.toLocaleTimeString() : '待命'}</em>
        </div>
        <pre>{data.consoleLines.join('\n')}</pre>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LabErrorBoundary>
      <App />
    </LabErrorBoundary>
  </React.StrictMode>,
);
