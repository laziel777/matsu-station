import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  FileWarning,
  Gavel,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import './styles.css';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type SourceType = 'post' | 'comment' | 'reply';
type CaseAction = 'mark_reviewed' | 'dismiss' | 'release' | 'quarantine' | 'remove';
type ContentAction = 'review' | 'hide' | 'mask' | 'delete' | 'restore';
type AccountAction = 'watch' | 'clear_watch' | 'ban' | 'unban' | 'suspend_posting' | 'restore_posting';
type DrawerKey = 'cockpit' | 'accounts' | 'articles' | 'reports' | 'aiSheet' | 'cases';
type ContentSortKey = 'risk_desc' | 'risk_asc' | 'newest' | 'oldest' | 'author' | 'type';
type ContentDecisionFilter = 'all' | 'open' | 'decided' | 'hidden' | 'masked' | 'approved' | 'deleted';
type CaseStatusFilter = 'open' | 'all' | 'masked' | 'hidden' | 'approved' | 'dismissed' | 'reviewed' | 'deleted';
type AccountSortKey = 'risk_desc' | 'newest' | 'oldest' | 'status' | 'name';

interface SiteItem {
  id: string;
  sourceType: SourceType;
  sourcePath: string;
  postId: string;
  commentId?: string;
  replyId?: string;
  authorId: string;
  authorName: string;
  category: string;
  text: string;
  imageUrl?: string;
  imagePath?: string;
  imageCount: number;
  createdAt?: unknown;
  createdAtText: string;
  currentRiskLabel: RiskLevel;
  currentRiskScore: number;
  status: string;
  localLabels: string[];
  usesAdminSnapshot?: boolean;
  authorIpAddress?: string;
  authorIpKey?: string;
  ipSource?: 'content' | 'account' | 'none';
}

interface ModerationCase {
  id: string;
  publicCaseId?: string;
  sourcePath?: string;
  sourceType?: SourceType;
  authorId?: string;
  authorName?: string;
  category?: string;
  contentPreview?: string;
  contentSnapshot?: string;
  summary?: string;
  legalRisk?: string;
  recommendedAction?: string;
  rationale?: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface ReportItem {
  id: string;
  sourcePath?: string;
  targetType?: string;
  targetId?: string;
  postId?: string;
  commentId?: string;
  replyId?: string;
  reporterId?: string;
  reason?: string;
  status?: string;
  createdAt?: unknown;
}

interface LabelResult {
  reply?: string;
  analyzedCount?: number;
  scannedCount?: number;
  skippedAlreadyScanned?: number;
  riskUpdatesApplied?: Array<{ sourcePath: string; riskLevel?: string; riskScore?: number; reason?: string }>;
  riskUpdatesSkipped?: Array<{ sourcePath: string; reason?: string }>;
  model?: string;
}

interface AccountItem {
  uid: string;
  displayName: string;
  islanderId: string;
  email?: string;
  emailVerified?: boolean;
  role?: string;
  photoURL?: string;
  accountStatus: string;
  isBanned: boolean;
  authDisabled?: boolean;
  postCount: number;
  commentCount: number;
  replyCount: number;
  maxRisk: number;
  lastSeenAt?: unknown;
  createdAt?: unknown;
  authCreatedAt?: unknown;
  authLastSignInAt?: unknown;
  lastIpAddress?: string;
  lastIpKey?: string;
  lastIpAt?: unknown;
  reason?: string;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const functions = getFunctions(app, 'asia-east1');
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const STATION_MASTER_UID = 'gHHxF8p1DnbMkoeVmU5XpB18Elz2';
const MAX_POSTS = 260;
const MAX_COMMENTS = 700;
const MAX_REPLIES = 500;

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

function timeText(value: unknown) {
  const time = toMillis(value);
  if (!time) return '未記錄';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

function fullTimeText(value: unknown) {
  const time = toMillis(value);
  if (!time && typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Intl.DateTimeFormat('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(parsed));
    }
  }
  if (!time) return '未記錄';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

function compactUid(uid = '') {
  if (!uid) return 'unknown';
  return uid.length > 10 ? `${uid.slice(0, 4)}-${uid.slice(-4)}` : uid;
}

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function riskFromScore(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function riskTone(level?: string) {
  if (level === 'critical') return '#ff2d55';
  if (level === 'high') return '#ff7a18';
  if (level === 'medium') return '#facc15';
  return '#30f2a2';
}

function riskLabel(level?: string) {
  if (level === 'critical') return '\u6975\u9ad8';
  if (level === 'high') return '\u9ad8';
  if (level === 'medium') return '\u4e2d';
  return '\u4f4e';
}

function sourceLabel(type?: string) {
  if (type === 'post') return '\u8cbc\u6587';
  if (type === 'comment') return '\u7559\u8a00';
  if (type === 'reply') return '\u56de\u8986';
  return '\u5167\u5bb9';
}

function statusLabel(status?: string) {
  if (status === 'approved' || status === 'released') return '\u5df2\u653e\u884c';
  if (status === 'masked' || status === 'quarantined' || status === 'pending_review') return '\u5be9\u6838\u4e2d';
  if (status === 'hidden' || status === 'removed') return '\u5df2\u96b1\u85cf';
  if (status === 'deleted') return '\u5df2\u522a\u9664';
  if (status === 'dismissed') return '\u5df2\u7d50\u6848';
  if (status === 'reviewed') return '\u5df2\u67e5\u770b';
  if (status === 'pending') return '\u5f85\u8655\u7406';
  if (status === 'normal') return '\u6b63\u5e38';
  return status || '\u672a\u77e5';
}

function handlingState(status?: string) {
  if (status === 'approved' || status === 'released') return '\u7ad9\u52d9\u5df2\u653e\u884c';
  if (status === 'hidden' || status === 'removed') return '\u524d\u53f0\u5df2\u96b1\u85cf';
  if (status === 'deleted') return '\u5df2\u522a\u9664';
  if (status === 'dismissed') return '\u5df2\u7d50\u6848';
  if (status === 'reviewed') return '\u7ad9\u9577\u5df2\u67e5\u770b';
  if (status === 'masked' || status === 'quarantined' || status === 'pending_review') return '\u5be9\u6838\u4e2d';
  if (status === 'pending') return '\u5f85\u8655\u7406';
  if (status === 'normal') return '\u6b63\u5e38';
  return '\u672a\u77e5';
}

function contentDecisionFilterLabel(filter: ContentDecisionFilter) {
  if (filter === 'open') return '待裁決';
  if (filter === 'decided') return '已裁決';
  if (filter === 'hidden') return '已隱藏';
  if (filter === 'masked') return '已遮蔽';
  if (filter === 'approved') return '已放行';
  if (filter === 'deleted') return '已刪除';
  return '全部裁決';
}

function getContentDecisionFilter(status?: string): ContentDecisionFilter {
  if (status === 'hidden' || status === 'removed') return 'hidden';
  if (status === 'masked' || status === 'quarantined') return 'masked';
  if (status === 'approved' || status === 'released') return 'approved';
  if (status === 'deleted') return 'deleted';
  if (status === 'pending_review' || status === 'pending') return 'open';
  if (status === 'reviewed' || status === 'dismissed') return 'decided';
  return 'open';
}

function isContentDecisionMatch(status: string | undefined, filter: ContentDecisionFilter) {
  if (filter === 'all') return true;
  const bucket = getContentDecisionFilter(status);
  if (filter === 'decided') return ['hidden', 'masked', 'approved', 'deleted', 'decided'].includes(bucket);
  return bucket === filter;
}

function caseStatusFilterLabel(filter: CaseStatusFilter) {
  if (filter === 'open') return '待裁決';
  if (filter === 'masked') return '已遮蔽';
  if (filter === 'hidden') return '已隱藏';
  if (filter === 'approved') return '已放行';
  if (filter === 'dismissed') return '已結案';
  if (filter === 'reviewed') return '已查看';
  if (filter === 'deleted') return '已刪除 / 來源不存在';
  return '全部案件';
}

function getCaseStatusFilter(status?: string, sourceMissing = false): CaseStatusFilter {
  if (sourceMissing) return 'deleted';
  if (status === 'masked' || status === 'quarantined') return 'masked';
  if (status === 'hidden' || status === 'removed') return 'hidden';
  if (status === 'deleted') return 'deleted';
  if (status === 'approved' || status === 'released') return 'approved';
  if (status === 'dismissed') return 'dismissed';
  if (status === 'reviewed') return 'reviewed';
  return 'open';
}

function isCaseStatusMatch(status: string | undefined, filter: CaseStatusFilter, sourceMissing = false) {
  if (filter === 'all') return true;
  return getCaseStatusFilter(status, sourceMissing) === filter;
}

function accountStatusLabel(status?: string, isBanned = false) {
  if (isBanned || status === 'banned') return '已停權';
  if (status === 'posting_suspended') return '發文暫停';
  if (status === 'watch') return '觀察中';
  if (status === 'admin') return '站務';
  return '正常';
}

function accountStatusTone(status?: string, isBanned = false) {
  if (isBanned || status === 'banned') return '#ff2d55';
  if (status === 'posting_suspended') return '#ff7a18';
  if (status === 'watch') return '#facc15';
  return '#30f2a2';
}

function casePriority(item: ModerationCase) {
  const openBoost = !item.status || ['pending', 'masked', 'quarantined', 'pending_review'].includes(item.status) ? 100000 : 0;
  return openBoost + Number(item.riskScore || 0) * 100 + Math.floor(toMillis(item.updatedAt || item.createdAt) / 100000);
}

function sourcePathFromReport(report: ReportItem) {
  if (report.sourcePath) return report.sourcePath;
  if (report.targetType === 'post' && report.targetId) return `posts/${report.targetId}`;
  if (report.targetType === 'comment' && report.postId && (report.commentId || report.targetId)) {
    return `posts/${report.postId}/comments/${report.commentId || report.targetId}`;
  }
  if (report.targetType === 'reply' && report.postId && report.commentId && (report.replyId || report.targetId)) {
    return `posts/${report.postId}/comments/${report.commentId}/replies/${report.replyId || report.targetId}`;
  }
  return '';
}

function getContentText(data: DocumentData, caseData?: DocumentData) {
  return cleanText(
    caseData?.contentSnapshot ||
      caseData?.contentPreview ||
      data.contentSnapshot ||
      data.content ||
      data.text ||
      data.body ||
      data.contentPreview ||
      data.quarantinedContentPreview ||
      data.moderationPublicNotice ||
      '',
  );
}

function getStoredRisk(data: DocumentData) {
  const score = Number(data.moderationRiskScore || data.riskScore || data.aiRisk || 0);
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score <= 10 && score > 0 ? score * 10 : score)) : 0;
  const level = String(data.moderationRiskLevel || data.riskLevel || '') as RiskLevel;
  return {
    score: normalizedScore,
    level: ['low', 'medium', 'high', 'critical'].includes(level) ? level : riskFromScore(normalizedScore),
  };
}

function localLabelsFor(text: string) {
  const labels: string[] = [];
  if (/https?:\/\/|line\.me|lin\.ee|加line|私訊|填資料|匯款/i.test(text)) labels.push('導流');
  if (/09\d{2}|身分證|車牌|住址|電話|個資|肉搜|公開.*資料/.test(text)) labels.push('個資');
  if (/圍住|堵人|砸|拖出來|報復|不道歉就/.test(text)) labels.push('安全風險');
  if (/黑箱|收錢|貪污|包庇|派系|帶風向|未查證|聽說/.test(text)) labels.push('未證實指控');
  if (/白痴|低能|垃圾|去死|封殺/.test(text)) labels.push('攻擊語氣');
  return labels;
}

function makeSiteItem(
  sourceType: SourceType,
  sourcePath: string,
  data: DocumentData,
  caseData?: DocumentData,
  ipData?: DocumentData,
  accountData?: DocumentData,
): SiteItem | null {
  const imageUrls = [
    ...(cleanText(data.imageUrl) ? [cleanText(data.imageUrl)] : []),
    ...(Array.isArray(data.imageUrls) ? data.imageUrls.map(cleanText) : []),
    ...(Array.isArray(caseData?.imageUrlsSnapshot) ? caseData.imageUrlsSnapshot.map(cleanText) : []),
  ].filter(Boolean);
  const imagePaths = [
    ...(cleanText(data.imagePath) ? [cleanText(data.imagePath)] : []),
    ...(Array.isArray(data.imagePaths) ? data.imagePaths.map(cleanText) : []),
    ...(Array.isArray(caseData?.imagePathsSnapshot) ? caseData.imagePathsSnapshot.map(cleanText) : []),
  ].filter(Boolean);
  const text = getContentText(data, caseData) || (imageUrls.length || imagePaths.length ? '[圖片貼文]' : '');
  if (!text) return null;
  const parts = sourcePath.split('/');
  const mergedData = { ...data, ...(caseData || {}) };
  const risk = getStoredRisk(mergedData);
  const usesAdminSnapshot = Boolean(cleanText(caseData?.contentSnapshot || caseData?.contentPreview));
  const authorIpAddress = cleanText(ipData?.ipAddress || accountData?.lastIpAddress);
  const authorIpKey = cleanText(ipData?.ipKey || accountData?.lastIpKey);
  return {
    id: sourcePath.replace(/[^\w-]+/g, '__'),
    sourceType,
    sourcePath,
    postId: parts[1] || String(data.postId || ''),
    commentId: sourceType !== 'post' ? parts[3] : undefined,
    replyId: sourceType === 'reply' ? parts[5] : undefined,
    authorId: cleanText(mergedData.authorId || mergedData.uid || mergedData.userId),
    authorName: cleanText(mergedData.authorName || mergedData.displayName || mergedData.islanderId || compactUid(mergedData.authorId)),
    category: cleanText(mergedData.category || mergedData.aiTag || '???'),
    text,
    imageUrl: imageUrls[0] || '',
    imagePath: imagePaths[0] || '',
    imageCount: Math.max(imageUrls.length, imagePaths.length, Number(mergedData.imageCount || 0)),
    createdAt: data.createdAt || caseData?.sourceCreatedAt || caseData?.createdAt,
    createdAtText: timeText(data.createdAt || caseData?.sourceCreatedAt || caseData?.createdAt),
    currentRiskLabel: risk.level,
    currentRiskScore: risk.score,
    status: cleanText(mergedData.moderationStatus || mergedData.status || 'normal'),
    localLabels: [...localLabelsFor(text), ...(usesAdminSnapshot ? ['後台原文'] : [])],
    usesAdminSnapshot,
    authorIpAddress,
    authorIpKey,
    ipSource: ipData?.ipAddress || ipData?.ipKey ? 'content' : authorIpAddress || authorIpKey ? 'account' : 'none',
  };
}

async function loadSiteItems() {
  const [postSnap, commentSnap, replySnap, caseSnap, accessSnap, accountSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), firestoreLimit(MAX_POSTS))),
    getDocs(query(collectionGroup(db, 'comments'), firestoreLimit(MAX_COMMENTS))),
    getDocs(query(collectionGroup(db, 'replies'), firestoreLimit(MAX_REPLIES))),
    getDocs(query(collection(db, 'moderationCases'), orderBy('updatedAt', 'desc'), firestoreLimit(600))),
    getDocs(query(collection(db, 'contentAccessLogs'), orderBy('createdAt', 'desc'), firestoreLimit(1200))),
    getDocs(query(collection(db, 'accountControlProfiles'), firestoreLimit(1200))),
  ]);

  const casesBySourcePath = new Map<string, DocumentData>();
  caseSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const sourcePath = cleanText(data.sourcePath);
    if (sourcePath) casesBySourcePath.set(sourcePath, data);
  });

  const accessBySourcePath = new Map<string, DocumentData>();
  accessSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const sourcePath = cleanText(data.sourcePath);
    if (sourcePath) accessBySourcePath.set(sourcePath, data);
  });

  const accountByUid = new Map<string, DocumentData>();
  accountSnap.docs.forEach(docSnap => accountByUid.set(docSnap.id, docSnap.data()));

  const items: SiteItem[] = [];
  postSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const item = makeSiteItem('post', docSnap.ref.path, data, casesBySourcePath.get(docSnap.ref.path), accessBySourcePath.get(docSnap.ref.path), accountByUid.get(cleanText(data.authorId)));
    if (item) items.push(item);
  });
  commentSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const item = makeSiteItem('comment', docSnap.ref.path, data, casesBySourcePath.get(docSnap.ref.path), accessBySourcePath.get(docSnap.ref.path), accountByUid.get(cleanText(data.authorId)));
    if (item) items.push(item);
  });
  replySnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const item = makeSiteItem('reply', docSnap.ref.path, data, casesBySourcePath.get(docSnap.ref.path), accessBySourcePath.get(docSnap.ref.path), accountByUid.get(cleanText(data.authorId)));
    if (item) items.push(item);
  });

  return items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

async function loadAccountItems(): Promise<AccountItem[]> {
  const callable = httpsCallable(functions, 'rangerListAccounts', { timeout: 600000 });
  const response = await callable({ maxResults: 1000 });
  const rawAccounts = Array.isArray((response.data as { accounts?: unknown[] })?.accounts)
    ? (response.data as { accounts: Record<string, unknown>[] }).accounts
    : [];
  return rawAccounts.map(account => ({
    uid: cleanText(account.uid),
    displayName: cleanText(account.displayName),
    islanderId: cleanText(account.islanderId),
    email: cleanText(account.email),
    emailVerified: account.emailVerified === true,
    role: cleanText(account.role),
    photoURL: cleanText(account.photoURL),
    accountStatus: cleanText(account.accountStatus || 'normal'),
    isBanned: account.isBanned === true,
    authDisabled: account.authDisabled === true,
    postCount: 0,
    commentCount: 0,
    replyCount: 0,
    maxRisk: 0,
    lastSeenAt: account.lastSeenAt,
    createdAt: account.createdAt,
    authCreatedAt: account.authCreatedAt,
    authLastSignInAt: account.authLastSignInAt,
    lastIpAddress: cleanText(account.lastIpAddress),
    lastIpKey: cleanText(account.lastIpKey),
    lastIpAt: account.lastIpAt,
    reason: cleanText(account.reason),
  }));
}

function buildPaperText(items: SiteItem[]) {
  const postItems = items
    .filter(item => item.sourceType === 'post')
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  const commentItems = items
    .filter(item => item.sourceType === 'comment')
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  const replyItems = items
    .filter(item => item.sourceType === 'reply')
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  const lines: string[] = [
    '馬祖小站｜全站貼文紙',
    `產生時間：${new Date().toLocaleString('zh-TW')}`,
    `排序：貼文由新到舊，貼文底下留言與回覆由舊到新`,
    `內容數：${items.length}，貼文 ${postItems.length}，留言 ${commentItems.length}，回覆 ${replyItems.length}`,
    '用途：請 AI 掃描全站脈絡，從網站、站長處置、用戶行為等角度做法律與社群風險判斷，必要時回寫 riskLevel / riskScore。',
    '重要：每段都保留 sourcePath。AI 回覆 JSON 必須使用 sourcePath，站長後台才可準確更新風險。',
    '',
  ];

  postItems.forEach((post, index) => {
    const postNo = `P${String(index + 1).padStart(3, '0')}`;
    lines.push(`===== ${postNo}｜貼文｜${post.sourcePath} =====`);
    lines.push(`作者：${post.authorName || compactUid(post.authorId)} / UID：${post.authorId || 'unknown'}`);
    lines.push(`分類：${post.category} / 狀態：${statusLabel(post.status)} / 站務處理：${handlingState(post.status)} / 發布時間：${fullTimeText(post.createdAt)}`);
    lines.push(`目前風險：${riskLabel(post.currentRiskLabel)} ${post.currentRiskScore} / 後台原文快照：${post.usesAdminSnapshot ? '是' : '否'} / 本地提示：${post.localLabels.join('、') || '無'}`);
    lines.push(`內容：${post.text}`);
    const comments = commentItems.filter(item => item.sourcePath.startsWith(`${post.sourcePath}/comments/`));
    if (!comments.length) {
      lines.push('留言：無');
    }
    comments.forEach((comment, commentIndex) => {
      const commentNo = `${postNo}-C${String(commentIndex + 1).padStart(2, '0')}`;
      lines.push(`  --- ${commentNo}｜留言｜${comment.sourcePath}`);
      lines.push(`  作者：${comment.authorName || compactUid(comment.authorId)} / UID：${comment.authorId || 'unknown'}`);
      lines.push(`  時間：${fullTimeText(comment.createdAt)} / 狀態：${statusLabel(comment.status)} / 站務處理：${handlingState(comment.status)} / 後台原文快照：${comment.usesAdminSnapshot ? '是' : '否'} / 目前風險：${riskLabel(comment.currentRiskLabel)} ${comment.currentRiskScore}`);
      lines.push(`  內容：${comment.text}`);
      const replies = replyItems.filter(item => item.sourcePath.startsWith(`${comment.sourcePath}/replies/`));
      replies.forEach((reply, replyIndex) => {
        lines.push(`    - ${commentNo}-R${String(replyIndex + 1).padStart(2, '0')}｜回覆｜${reply.sourcePath}`);
        lines.push(`      作者：${reply.authorName || compactUid(reply.authorId)} / UID：${reply.authorId || 'unknown'} / 時間：${fullTimeText(reply.createdAt)} / 站務處理：${handlingState(reply.status)} / 後台原文快照：${reply.usesAdminSnapshot ? '是' : '否'} / 風險：${riskLabel(reply.currentRiskLabel)} ${reply.currentRiskScore}`);
        lines.push(`      內容：${reply.text}`);
      });
    });
    lines.push('');
  });

  return lines.join('\n').slice(0, 120000);
}

class LabErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="lab-root gate-root">
        <section className="gate-card">
          <div className="brand-orb"><AlertTriangle size={24} /></div>
          <p>MATSU STATION</p>
          <h1>本地後台發生瀏覽器端錯誤，已阻止整頁閃退。</h1>
          <span>{this.state.error}</span>
        </section>
      </main>
    );
  }
}

function useStationAuth() {
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(false);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => onAuthStateChanged(auth, nextUser => {
    setUser(nextUser);
    setReady(true);
  }), []);

  const login = React.useCallback(async () => {
    setMessage('');
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code === 'auth/popup-blocked' || code === 'auth/unauthorized-domain') {
        await signInWithRedirect(auth, provider);
        return;
      }
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return { user, ready, message, login };
}

function AccessGate({ user, ready, message, onLogin }: {
  user: User | null;
  ready: boolean;
  message: string;
  onLogin: () => void;
}) {
  return (
    <main className="lab-root gate-root">
      <div className="hud-grid" />
      <section className="gate-card">
        <div className="brand-orb"><Shield size={24} /></div>
        <p>MATSU STATION</p>
        <h1>AI 游騎兵站長後台</h1>
        <span>只有站長 Google 帳號可以進入。其他帳號會被擋在這裡。</span>
        {message && <div className="gate-message">{message}</div>}
        {!ready ? (
          <button className="primary" disabled><Loader2 size={16} className="spin" /> 確認登入狀態</button>
        ) : (
          <button className="primary gate-login" onClick={onLogin}>Google 登入</button>
        )}
        {user && user.uid !== STATION_MASTER_UID && (
          <small>目前登入的不是站長帳號：{user.email || compactUid(user.uid)}</small>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value, hint, tone = '#38bdf8' }: {
  label: string;
  value: string | number;
  hint: string;
  tone?: string;
}) {
  return (
    <article className="ops-card" style={{ '--tone': tone } as React.CSSProperties}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

function DrawerCabinet({ activeDrawer, counts, onChange }: {
  activeDrawer: DrawerKey;
  counts: Record<DrawerKey, number>;
  onChange: (drawer: DrawerKey) => void;
}) {
  const drawers: Array<{ key: DrawerKey; label: string; hint: string }> = [
    { key: 'cockpit', label: '站長駕駛艙', hint: '總覽' },
    { key: 'accounts', label: '帳號抽屜', hint: '管理' },
    { key: 'articles', label: '文章抽屜', hint: '全站內容' },
    { key: 'reports', label: '檢舉通報', hint: '回報' },
    { key: 'aiSheet', label: 'AI 掃描紙', hint: '標籤' },
    { key: 'cases', label: '治理案件', hint: '裁決' },
  ];

  return (
    <nav className="drawer-cabinet" aria-label="後台資料抽屜">
      {drawers.map(drawer => (
        <button
          key={drawer.key}
          className={activeDrawer === drawer.key ? 'active' : ''}
          onClick={() => onChange(drawer.key)}
        >
          <span>{drawer.hint}</span>
          <strong>{drawer.label}</strong>
          <em>{counts[drawer.key] || 0}</em>
        </button>
      ))}
    </nav>
  );
}

function SiteSheetPanel({ items, onReload }: { items: SiteItem[]; onReload: () => Promise<void> }) {
  const [paperText, setPaperText] = React.useState('');
  const [summary, setSummary] = React.useState("Matsu Station legal-risk scan only.\n\nDo not do public-opinion heat analysis, trend analysis, topic popularity analysis, or account activity analysis unless directly related to legal/platform risk.\n\nFocus only on:\n1. Content that may cause the station master, platform, or users to be sued, complained about, asked to testify, or pulled into legal procedures.\n2. Personal data, doxxing, threats, defamation, insults, unverified serious allegations, scam routing, harassment mobilization, private images, or similar risks.\n3. Hidden, under-review, masked, removed, or handled content, and whether station-master follow-up is still needed.\n4. Content that can safely remain. Keep safe explanations short.\n\nOutput:\n- Priority legal-risk list\n- Safe-to-keep list\n- Risk reason for each risky item\n- Recommended station-master action\n- @@RISK_UPDATES_JSON@@ with valid JSON riskUpdates");
  const [isRunning, setIsRunning] = React.useState(false);
  const [isApplyingRisk, setIsApplyingRisk] = React.useState(false);
  const [result, setResult] = React.useState<LabelResult | null>(null);
  const [error, setError] = React.useState('');
  const [scanLimit, setScanLimit] = React.useState(120);

  const rebuildPaper = React.useCallback(() => {
    setPaperText(buildPaperText(items));
  }, [items]);

  React.useEffect(() => {
    rebuildPaper();
  }, [rebuildPaper]);

  const createPayload = (applyRiskUpdates: boolean) => ({
    summary,
    paperText: buildPaperText(items.slice(0, scanLimit)),
    applyRiskUpdates,
    items: items.slice(0, scanLimit).map(item => ({
      sourceType: item.sourceType,
      sourcePath: item.sourcePath,
      authorName: item.authorName,
      category: item.category,
      createdAtText: item.createdAtText,
      currentRiskLabel: item.currentRiskLabel,
      currentRiskScore: item.currentRiskScore,
      localLabels: item.localLabels,
      text: item.text,
    })),
  });

  const waitForSiteSheetJob = (jobId: string) => new Promise<LabelResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error('掃描任務仍在背景執行，稍後回來重新整理即可看到結果。'));
    }, 620000);
    const unsubscribe = onSnapshot(doc(db, 'rangerSiteSheetJobs', jobId), snapshot => {
      const data = snapshot.data() as (LabelResult & { status?: string; error?: string }) | undefined;
      if (!data) return;
      if (data.status === 'completed') {
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(data);
      }
      if (data.status === 'failed') {
        window.clearTimeout(timeout);
        unsubscribe();
        reject(new Error(data.error || '掃描任務失敗。'));
      }
    }, nextError => {
      window.clearTimeout(timeout);
      unsubscribe();
      reject(nextError);
    });
  });

  const runSiteSheetJob = async (applyRiskUpdates: boolean) => {
    const callable = httpsCallable(functions, 'rangerStartSiteSheetJob', { timeout: 600000 });
    const response = await callable(createPayload(applyRiskUpdates));
    const jobId = String((response.data as { jobId?: string }).jobId || '');
    if (!jobId) throw new Error('掃描任務沒有回傳 jobId。');
    return waitForSiteSheetJob(jobId);
  };

  const scanOnly = async () => {
    setIsRunning(true);
    setError('');
    setResult(null);
    try {
      const response = await runSiteSheetJob(false);
      setResult(response);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsRunning(false);
    }
  };

  const applyRiskUpdate = async () => {
    setIsApplyingRisk(true);
    setError('');
    try {
      const response = await runSiteSheetJob(true);
      setResult(response);
      await onReload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsApplyingRisk(false);
    }
  };

  return (
    <section className="content-watch-panel site-sheet-panel">
      <div className="content-watch-head">
        <div>
          <span className="eyebrow cyber-yellow">全站貼文紙</span>
          <h2>把貼文與附帶留言排序成一張紙，交給 Gemini 掃描、貼標籤、更新風險</h2>
        </div>
        <div className="content-watch-stats">
          <span>內容 {items.length}</span>
          <span>紙面 {paperText.length.toLocaleString()} 字</span>
        </div>
      </div>

      <div className="site-sheet-toolbar">
        <label className="site-sheet-limit">
          <span>{'\u6383\u63cf\u7b46\u6578'}</span>
          <select value={scanLimit} onChange={event => setScanLimit(Number(event.target.value))} disabled={isRunning || isApplyingRisk}>
            {[60, 120, 240, 480, 900].map(limit => (
              <option key={limit} value={limit}>{limit}</option>
            ))}
          </select>
        </label>
        <button onClick={() => void onReload()} disabled={isRunning || isApplyingRisk}><RefreshCw size={15} /> {'\u91cd\u65b0\u8b80\u53d6\u5168\u7ad9\u5167\u5bb9'}</button>
        <button onClick={rebuildPaper} disabled={isRunning || isApplyingRisk}><LayoutDashboard size={15} /> {'\u91cd\u65b0\u6574\u7406\u7d19\u9762'}</button>
        <button className="primary" onClick={() => void scanOnly()} disabled={isRunning || isApplyingRisk || !paperText.trim()}>
          {isRunning ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {'\u6383\u63cf\u5b8c\u6574\u5831\u544a'}
        </button>
        <button className="warn" onClick={() => void applyRiskUpdate()} disabled={isRunning || isApplyingRisk || !paperText.trim()}>
          {isApplyingRisk ? <Loader2 size={15} className="spin" /> : <FileWarning size={15} />}
          {'\u66f4\u65b0\u98a8\u96aa\u6a19\u7c64'}
        </button>
        <span>{'\u6383\u63cf\u6703\u7522\u751f\u5b8c\u6574\u5831\u544a\uff1b\u66f4\u65b0\u98a8\u96aa\u53ea\u56de\u5beb\u6a19\u7c64\u8207\u5206\u6578\u3002'}</span>
      </div>

      <div className="site-sheet-grid">
        <div className="case-text">
          <label>{'\u6383\u63cf\u4efb\u52d9\u8aaa\u660e'}</label>
          <textarea value={summary} onChange={event => setSummary(event.target.value)} rows={12} />
        </div>
        <div className="site-sheet-report mega">
          <div>
            <strong>{'Gemini 掃描報告'}</strong>
            <span>{result?.model || '尚未執行'}</span>
          </div>
          <pre>{result?.reply || error || '\u5c1a\u672a\u57f7\u884c\u3002\u6309\u4e0b\u6383\u63cf\u5b8c\u6574\u5831\u544a\u5f8c\uff0cGemini \u6703\u56de\u50b3\u6cd5\u5f8b\u98a8\u96aa\u5831\u544a\u8207 JSON\u3002'}</pre>
        </div>
      </div>

      <textarea
        className="site-sheet-textarea cyber-paper"
        value={paperText}
        onChange={event => setPaperText(event.target.value)}
        rows={22}
      />
      {result && (
        <>
          <div className="case-meta-row">
            <span>{'\u6a21\u578b\uff1a'}{result.model || 'unknown'}</span>
            <span>{'\u9001\u6383\uff1a'}{result.scannedCount ?? result.analyzedCount ?? 0} {'\u7b46'}</span>
            <span>{'\u8df3\u904e\u5df2\u6a19\u904e\uff1a'}{result.skippedAlreadyScanned || 0} {'\u7b46'}</span>
            <span>{'\u5df2\u5957\u7528\uff1a'}{result.riskUpdatesApplied?.length || 0}</span>
            <span>{'\u7565\u904e\uff1a'}{result.riskUpdatesSkipped?.length || 0}</span>
          </div>

          {Boolean(result.riskUpdatesApplied?.length || result.riskUpdatesSkipped?.length) && (
            <div className="site-sheet-apply-log">
              {result.riskUpdatesApplied?.length ? (
                <div>
                  <strong>{'\u5df2\u5957\u7528\u98a8\u96aa\u66f4\u65b0'}</strong>
                  {result.riskUpdatesApplied.map((update, index) => (
                    <article key={`applied-${update.sourcePath}-${index}`} className="applied">
                      <b>{update.sourcePath}</b>
                      <span>{update.riskLevel || 'unknown'} / {update.riskScore ?? '-'}</span>
                      <p>{update.reason || '\u0047\u0065\u006d\u0069\u006e\u0069 \u5df2\u66f4\u65b0\u6b64\u9805\u98a8\u96aa\u6a19\u7c64\u3002'}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {result.riskUpdatesSkipped?.length ? (
                <div>
                  <strong>{'\u672a\u5957\u7528\u9805\u76ee'}</strong>
                  {result.riskUpdatesSkipped.map((update, index) => (
                    <article key={`skipped-${update.sourcePath}-${index}`} className="skipped">
                      <b>{update.sourcePath}</b>
                      <p>{update.reason || '\u672a\u5957\u7528\u3002'}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReportsPanel({ reports, onSync, onViewTarget }: {
  reports: ReportItem[];
  onSync: (report: ReportItem) => Promise<void>;
  onViewTarget: (sourcePath: string) => void;
}) {
  const [busyId, setBusyId] = React.useState('');

  const sync = async (report: ReportItem) => {
    setBusyId(report.id);
    try {
      await onSync(report);
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="content-watch-panel">
      <div className="content-watch-head">
        <div>
          <span className="eyebrow">檢舉通報</span>
          <h2>使用者送出的檢舉會集中在這裡，必要時同步成治理案件</h2>
        </div>
        <div className="content-watch-stats"><span>{reports.length} 筆</span></div>
      </div>

      <div className="content-watch-list">
        {reports.length ? reports.slice(0, 30).map(report => {
          const path = sourcePathFromReport(report);
          return (
            <article key={report.id} className="content-watch-item">
              <div className="content-watch-main">
                <div className="content-watch-line">
                  <em>{sourceLabel(report.targetType)}</em>
                  <em>{statusLabel(report.status)}</em>
                  <span>{timeText(report.createdAt)}</span>
                </div>
                <strong>{path || report.targetId || report.id}</strong>
                <p>{report.reason || '使用者未填寫原因。'}</p>
                <small>檢舉者：{compactUid(report.reporterId)}</small>
              </div>
              <div className="content-watch-action">
                <button disabled={!path} onClick={() => onViewTarget(path)}>
                  <Search size={14} />
                  查看目標
                </button>
                <button disabled={busyId === report.id || !path} onClick={() => void sync(report)}>
                  {busyId === report.id ? <Loader2 size={14} className="spin" /> : <Gavel size={14} />}
                  同步案件
                </button>
              </div>
            </article>
          );
        }) : (
          <div className="empty-feed"><CheckCircle2 size={20} /><p>目前沒有檢舉通報。</p></div>
        )}
      </div>
    </section>
  );
}

function CasePanel({ cases, selected, sourcePaths, onSelect, onAction }: {
  cases: ModerationCase[];
  selected: ModerationCase | null;
  sourcePaths: Set<string>;
  onSelect: (id: string) => void;
  onAction: (item: ModerationCase, action: CaseAction) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState('');
  const [queryText, setQueryText] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<CaseStatusFilter>('open');
  const isSourceMissing = React.useCallback((item: ModerationCase) => Boolean(item.sourcePath && !sourcePaths.has(item.sourcePath)), [sourcePaths]);
  const visibleCases = cases
    .filter(item => {
      const sourceMissing = isSourceMissing(item);
      if (!isCaseStatusMatch(item.status, statusFilter, sourceMissing)) return false;
      const text = [
        item.publicCaseId,
        item.sourcePath,
        item.authorName,
        item.summary,
        item.contentPreview,
        item.contentSnapshot,
        statusLabel(item.status),
        caseStatusFilterLabel(getCaseStatusFilter(item.status, sourceMissing)),
      ].join(' ').toLowerCase();
      return !queryText || text.includes(queryText.toLowerCase());
    })
    .slice(0, 80);

  const visibleSelected = selected && visibleCases.some(item => item.id === selected.id) ? selected : visibleCases[0] || null;

  React.useEffect(() => {
    if (visibleSelected && selected?.id !== visibleSelected.id) {
      onSelect(visibleSelected.id);
    }
  }, [onSelect, selected?.id, visibleSelected]);

  const run = async (item: ModerationCase, action: CaseAction) => {
    const confirmations: Partial<Record<CaseAction, string>> = {
      release: '確定要放行 / 恢復這筆內容公開顯示？',
      quarantine: '確定要遮蔽這筆內容並保留審核原因？',
      remove: '確定要隱藏這筆內容？原文會保留在後台治理紀錄。',
      dismiss: '確定要將此案件結案？',
    };
    const message = confirmations[action];
    if (message && !window.confirm(message)) return;
    setBusy(`${item.id}:${action}`);
    try {
      await onAction(item, action);
    } catch (error) {
      window.alert(`案件操作失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
    }
  };

  const selectedBucket = visibleSelected ? getCaseStatusFilter(visibleSelected.status, isSourceMissing(visibleSelected)) : 'open';
  const isBusy = Boolean(busy);

  return (
    <section className="lab-layout">
      <aside className="panel right-panel">
        <div className="panel-title"><Shield size={18} /><span>治理案件</span></div>
        <div className="case-search">
          <Search size={15} />
          <input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="搜尋案件、作者、來源路徑、狀態" />
        </div>
        <div className="case-filter-row">
          {(['open', 'masked', 'hidden', 'approved', 'reviewed', 'dismissed', 'deleted', 'all'] as CaseStatusFilter[]).map(filter => (
            <button
              key={filter}
              className={statusFilter === filter ? 'active' : ''}
              onClick={() => setStatusFilter(filter)}
            >
              {caseStatusFilterLabel(filter)}
            </button>
          ))}
        </div>
        <div className="feed-list">
          {visibleCases.length ? visibleCases.map(item => (
            <button
              key={item.id}
              className={`feed-item case-card ${visibleSelected?.id === item.id ? 'selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div>
                <span style={{ color: riskTone(item.riskLevel) }}>{riskLabel(item.riskLevel)}</span>
                <em>{item.publicCaseId || item.id.slice(0, 12)}</em>
                <em>{caseStatusFilterLabel(getCaseStatusFilter(item.status, isSourceMissing(item)))}</em>
              </div>
              <small>{sourceLabel(item.sourceType)} / {statusLabel(item.status)} / {timeText(item.updatedAt || item.createdAt)}</small>
              <p>{item.summary || item.contentPreview || item.contentSnapshot || '尚無摘要。'}</p>
            </button>
          )) : (
            <div className="empty-feed"><Activity size={20} /><p>目前沒有符合條件的案件。</p></div>
          )}
        </div>
      </aside>

      <section className="case-inspector">
        {visibleSelected ? (
          <>
            <div className="case-inspector-head">
              <div>
                <span className="eyebrow">案件檢視</span>
                <h2>{visibleSelected.publicCaseId || visibleSelected.id}</h2>
              </div>
              <div className="case-badges">
                <span style={{ borderColor: riskTone(visibleSelected.riskLevel), color: riskTone(visibleSelected.riskLevel) }}>
                  {riskLabel(visibleSelected.riskLevel)} {Math.round(Number(visibleSelected.riskScore || 0))}/100
                </span>
                <span>{sourceLabel(visibleSelected.sourceType)}</span>
                <span>{statusLabel(visibleSelected.status)}</span>
              </div>
            </div>

            <div className="case-detail-grid">
              <div className="case-text"><label>AI 摘要</label><p>{visibleSelected.summary || '尚無摘要。'}</p></div>
              <div className="case-text"><label>內容預覽</label><p>{visibleSelected.contentPreview || visibleSelected.contentSnapshot || '沒有可顯示的內容。'}</p></div>
              <div className="case-text"><label>法律 / 社群風險</label><p>{visibleSelected.legalRisk || visibleSelected.rationale || '未提供。'}</p></div>
              <div className="case-text"><label>建議動作</label><p>{visibleSelected.recommendedAction || '未提供。'}</p></div>
            </div>

            <div className="case-meta-row">
              <span>作者：{visibleSelected.authorName || compactUid(visibleSelected.authorId)}</span>
              <span>分類：{visibleSelected.category || '未分類'}</span>
              <span>來源：{visibleSelected.sourcePath || 'unknown'}</span>
              <span>更新：{timeText(visibleSelected.updatedAt || visibleSelected.createdAt)}</span>
            </div>

            <div className="case-actions case-action-grid">
              <button className="ok" disabled={isBusy || !visibleSelected.contentSnapshot || selectedBucket === 'approved'} onClick={() => void run(visibleSelected, 'release')} title="恢復或放行內容">
                <CheckCircle2 size={15} /> {selectedBucket === 'approved' ? '已放行' : '放行 / 恢復'}
              </button>
              <button className="warn" disabled={isBusy || !visibleSelected.contentSnapshot || selectedBucket === 'masked'} onClick={() => void run(visibleSelected, 'quarantine')} title="遮蔽內容，但保留後台原文與治理紀錄">
                <FileWarning size={15} /> {selectedBucket === 'masked' ? '已遮蔽' : '遮蔽留紀錄'}
              </button>
              <button className="danger" disabled={isBusy || selectedBucket === 'hidden' || selectedBucket === 'deleted'} onClick={() => void run(visibleSelected, 'remove')} title="前台隱藏，不刪除治理紀錄">
                <CircleSlash size={15} /> {selectedBucket === 'hidden' ? '已隱藏' : selectedBucket === 'deleted' ? '已刪除' : '隱藏不公開'}
              </button>
              <button disabled={isBusy || selectedBucket === 'reviewed'} onClick={() => void run(visibleSelected, 'mark_reviewed')} title="站長已查看，保留案件">
                <Gavel size={15} /> {selectedBucket === 'reviewed' ? '已查看' : '標記已看'}
              </button>
              <button disabled={isBusy || selectedBucket === 'dismissed'} onClick={() => void run(visibleSelected, 'dismiss')} title="完成處理，案件結案">
                <RefreshCw size={15} /> {selectedBucket === 'dismissed' ? '已結案' : '結案'}
              </button>
              {busy && <span className="action-state"><Loader2 size={14} className="spin" /> 處理中</span>}
            </div>
          </>
        ) : (
          <div className="case-empty"><AlertTriangle size={18} /><span>尚未選取案件。</span></div>
        )}
      </section>
    </section>
  );
}

function ContentTable({ items, selectedPath, onAction }: {
  items: SiteItem[];
  selectedPath: string;
  onAction: (item: SiteItem, action: ContentAction) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState('');
  const [queryText, setQueryText] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<'all' | SourceType>('all');
  const [decisionFilter, setDecisionFilter] = React.useState<ContentDecisionFilter>('all');
  const [sortKey, setSortKey] = React.useState<ContentSortKey>('risk_desc');

  React.useEffect(() => {
    if (selectedPath) setQueryText(selectedPath);
  }, [selectedPath]);

  const visible = items
    .filter(item => {
      if (typeFilter !== 'all' && item.sourceType !== typeFilter) return false;
      if (!isContentDecisionMatch(item.status, decisionFilter)) return false;
      const text = [
        item.sourcePath,
        item.authorName,
        item.authorId,
        item.authorIpAddress,
        item.authorIpKey,
        item.imageUrl,
        item.imagePath,
        item.imageCount ? 'has image 有圖片 圖片' : 'no image 無圖片',
        item.category,
        item.status,
        statusLabel(item.status),
        handlingState(item.status),
        contentDecisionFilterLabel(getContentDecisionFilter(item.status)),
        item.text,
        item.localLabels.join(' '),
        sourceLabel(item.sourceType),
      ].join(' ').toLowerCase();
      return !queryText || text.includes(queryText.toLowerCase());
    })
    .sort((left, right) => {
      if (sortKey === 'risk_desc') return right.currentRiskScore - left.currentRiskScore || toMillis(right.createdAt) - toMillis(left.createdAt);
      if (sortKey === 'risk_asc') return left.currentRiskScore - right.currentRiskScore || toMillis(right.createdAt) - toMillis(left.createdAt);
      if (sortKey === 'newest') return toMillis(right.createdAt) - toMillis(left.createdAt);
      if (sortKey === 'oldest') return toMillis(left.createdAt) - toMillis(right.createdAt);
      if (sortKey === 'author') return (left.authorName || left.authorId).localeCompare(right.authorName || right.authorId, 'zh-Hant') || toMillis(right.createdAt) - toMillis(left.createdAt);
      if (sortKey === 'type') return sourceLabel(left.sourceType).localeCompare(sourceLabel(right.sourceType), 'zh-Hant') || right.currentRiskScore - left.currentRiskScore;
      return 0;
    })
    .slice(0, 90);

  const run = async (item: SiteItem, action: ContentAction) => {
    if (action === 'delete' && !window.confirm('確定要完全移除這筆內容？這會刪除來源文件，只保留後台治理紀錄。')) return;
    if (action === 'restore' && !window.confirm('確定恢復這筆內容公開顯示？')) return;
    setBusy(`${item.id}:${action}`);
    try {
      await onAction(item, action);
    } catch (error) {
      window.alert(`內容操作失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="content-watch-panel">
      <div className="content-watch-head">
        <div>
          <span className="eyebrow">全站內容抽屜</span>
          <h2>貼文、留言與回覆會照風險程度排序，方便快速巡視</h2>
        </div>
        <div className="content-watch-stats"><span>{visible.length} / {items.length} 筆</span></div>
      </div>
      <div className="content-watch-controls">
        <input
          value={queryText}
          onChange={event => setQueryText(event.target.value)}
          placeholder="搜尋內容、作者、分類、sourcePath、UID、IP"
        />
        <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>全部</button>
        <button className={typeFilter === 'post' ? 'active' : ''} onClick={() => setTypeFilter('post')}>貼文</button>
        <button className={typeFilter === 'comment' ? 'active' : ''} onClick={() => setTypeFilter('comment')}>留言</button>
        <button className={typeFilter === 'reply' ? 'active' : ''} onClick={() => setTypeFilter('reply')}>回覆</button>
        <select value={decisionFilter} onChange={event => setDecisionFilter(event.target.value as ContentDecisionFilter)}>
          <option value="all">全部裁決</option>
          <option value="open">待裁決</option>
          <option value="decided">已裁決</option>
          <option value="hidden">已隱藏</option>
          <option value="masked">已遮蔽</option>
          <option value="approved">已放行</option>
          <option value="deleted">已刪除</option>
        </select>
        <select value={sortKey} onChange={event => setSortKey(event.target.value as ContentSortKey)}>
          <option value="risk_desc">風險高到低</option>
          <option value="risk_asc">風險低到高</option>
          <option value="newest">時間新到舊</option>
          <option value="oldest">時間舊到新</option>
          <option value="author">作者排序</option>
          <option value="type">類型排序</option>
        </select>
        {queryText && <button onClick={() => setQueryText('')}>清除搜尋</button>}
      </div>
      <div className="content-watch-list">
        {visible.map(item => (
          (() => {
            const bucket = getContentDecisionFilter(item.status);
            const disabled = Boolean(busy);
            return (
              <article key={item.id} className={`content-watch-item ${selectedPath && item.sourcePath === selectedPath ? 'selected' : ''}`}>
                <div className="content-watch-main">
                  <div className="content-watch-line">
                    <span style={{ color: riskTone(item.currentRiskLabel) }}>{riskLabel(item.currentRiskLabel)} {Math.round(item.currentRiskScore)}</span>
                    <em>{sourceLabel(item.sourceType)}</em>
                    <em>{statusLabel(item.status)}</em>
                    <em>{contentDecisionFilterLabel(bucket)}</em>
                    {item.usesAdminSnapshot && <em>後台原文快照</em>}
                    {item.imageCount > 0 && <em>有圖片</em>}
                    {item.localLabels.map(label => <em key={label}>{label}</em>)}
                  </div>
                  <strong>{item.authorName || compactUid(item.authorId)} / {item.category}</strong>
                  <div className="content-watch-meta" aria-label="內容作者資訊">
                    <span>作者：{item.authorName || '未記錄'}</span>
                    <span>Firebase UID：{item.authorId || 'unknown'}</span>
                    <span>時間：{item.createdAtText}</span>
                    <span>圖片：{item.imageCount > 0 ? `${item.imageCount} 張` : '無'}</span>
                  </div>
                  {item.imageCount > 0 && (
                    <div className="content-watch-meta" aria-label="內容圖片資訊">
                      <span>imagePath：{item.imagePath || '未記錄'}</span>
                      <span>imageUrl：{item.imageUrl ? '已儲存' : '未記錄'}</span>
                    </div>
                  )}
                  <small>IP：{item.authorIpAddress || '未記錄'}{item.authorIpKey ? ` / key ${item.authorIpKey}` : ''}{item.ipSource === 'account' ? ' / 帳號最後 IP' : item.ipSource === 'content' ? ' / 發內容當下 IP' : ''}</small>
                  {item.imageUrl && <img className="content-watch-thumb" src={item.imageUrl} alt="貼文圖片預覽" loading="lazy" />}
                  <p>{item.text}</p>
                  <small>{item.sourcePath}</small>
                </div>
                <div className="content-watch-action">
                  <button disabled={disabled || bucket === 'open'} onClick={() => void run(item, 'review')}><Gavel size={14} /> {bucket === 'open' ? '審核中' : '轉審核'}</button>
                  <button className="danger" disabled={disabled || ['hidden', 'deleted'].includes(bucket)} onClick={() => void run(item, 'hide')}><CircleSlash size={14} /> {bucket === 'hidden' ? '已隱藏' : bucket === 'deleted' ? '已刪除' : '隱藏'}</button>
                  <button className="warn" disabled={disabled || bucket === 'masked'} onClick={() => void run(item, 'mask')}><FileWarning size={14} /> {bucket === 'masked' ? '已遮蔽' : '遮蔽'}</button>
                  <button className="ok" disabled={disabled || !item.usesAdminSnapshot || bucket === 'approved'} onClick={() => void run(item, 'restore')}><CheckCircle2 size={14} /> {bucket === 'approved' ? '已放行' : '恢復'}</button>
                  <button className="danger" disabled={disabled || bucket === 'deleted'} onClick={() => void run(item, 'delete')}><Trash2 size={14} /> {bucket === 'deleted' ? '已刪除' : '完全移除'}</button>
                </div>
              </article>
            );
          })()
        ))}
        {!visible.length && (
          <div className="empty-feed"><Search size={20} /><p>找不到符合條件的內容。</p></div>
        )}
      </div>
    </section>
  );
}

function AccountDrawer({ accounts, onReload, onAction }: {
  accounts: AccountItem[];
  onReload: () => Promise<void>;
  onAction: (account: AccountItem, action: AccountAction, reason: string) => Promise<void>;
}) {
  const [queryText, setQueryText] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'watch' | 'restricted'>('all');
  const [sortKey, setSortKey] = React.useState<AccountSortKey>('risk_desc');
  const [busy, setBusy] = React.useState('');

  const visibleAccounts = accounts
    .filter(account => {
      if (filter === 'watch' && account.accountStatus !== 'watch') return false;
      if (filter === 'restricted' && !account.isBanned && account.accountStatus !== 'posting_suspended') return false;
      const text = [account.displayName, account.islanderId, account.uid, account.email, account.lastIpAddress, account.lastIpKey, account.reason].join(' ').toLowerCase();
      return !queryText || text.includes(queryText.toLowerCase());
    })
    .sort((left, right) => {
      if (sortKey === 'risk_desc') return right.maxRisk - left.maxRisk || toMillis(right.lastSeenAt || right.authLastSignInAt) - toMillis(left.lastSeenAt || left.authLastSignInAt);
      if (sortKey === 'newest') return toMillis(right.lastSeenAt || right.authLastSignInAt || right.createdAt || right.authCreatedAt) - toMillis(left.lastSeenAt || left.authLastSignInAt || left.createdAt || left.authCreatedAt);
      if (sortKey === 'oldest') return toMillis(left.createdAt || left.authCreatedAt) - toMillis(right.createdAt || right.authCreatedAt);
      if (sortKey === 'status') return accountStatusLabel(left.accountStatus, left.isBanned).localeCompare(accountStatusLabel(right.accountStatus, right.isBanned), 'zh-Hant') || right.maxRisk - left.maxRisk;
      if (sortKey === 'name') return (left.displayName || left.islanderId || left.uid).localeCompare(right.displayName || right.islanderId || right.uid, 'zh-Hant');
      return 0;
    })
    .slice(0, 120);

  const run = async (account: AccountItem, action: AccountAction) => {
    const labels: Record<AccountAction, string> = {
      watch: '觀察帳號',
      clear_watch: '解除觀察',
      ban: '停權帳號',
      unban: '解除停權',
      suspend_posting: '暫停發文',
      restore_posting: '恢復發文',
    };
    const reason = window.prompt(`請輸入「${labels[action]}」原因，這會留下站務紀錄。`, account.reason || '站務安全處理');
    if (reason === null) return;
    setBusy(`${account.uid}:${action}`);
    try {
      await onAction(account, action, reason);
      await onReload();
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="account-control-desk">
      <div className="section-heading">
        <div>
          <span className="eyebrow">帳號抽屜</span>
          <h2>站長帳號管理</h2>
          <p>這裡只在後台顯示。可把帳號標記觀察、暫停發文或停權，動作會走站長 Cloud Function 並留下紀錄。</p>
        </div>
        <button onClick={() => void onReload()}><RefreshCw size={15} /> 重新讀取帳號</button>
      </div>

      <div className="account-toolbar">
        <input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="搜尋暱稱、島內 ID、UID、Email、IP" />
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部 <b>{accounts.length}</b></button>
        <button className={filter === 'watch' ? 'active' : ''} onClick={() => setFilter('watch')}>觀察 <b>{accounts.filter(account => account.accountStatus === 'watch').length}</b></button>
        <button className={filter === 'restricted' ? 'active' : ''} onClick={() => setFilter('restricted')}>限制 <b>{accounts.filter(account => account.isBanned || account.accountStatus === 'posting_suspended').length}</b></button>
        <select value={sortKey} onChange={event => setSortKey(event.target.value as AccountSortKey)}>
          <option value="risk_desc">風險高到低</option>
          <option value="newest">最近活動</option>
          <option value="oldest">加入時間舊到新</option>
          <option value="status">狀態排序</option>
          <option value="name">名稱排序</option>
        </select>
      </div>

      <div className="account-list">
        {visibleAccounts.map(account => {
          const isStationMaster = account.uid === STATION_MASTER_UID;
          const tone = accountStatusTone(account.accountStatus, account.isBanned);
          return (
            <article key={account.uid} className="account-card">
              <div className="account-main">
                <div>
                  <strong>{account.displayName || compactUid(account.uid)}</strong>
                  <span>{account.islanderId ? `島內 ID：${account.islanderId}` : '尚未設定島內 ID'}</span>
                </div>
                <em style={{ color: tone }}>{accountStatusLabel(account.accountStatus, account.isBanned)}</em>
              </div>
              <div className="account-identity">
                <div>
                  <span>Firebase UID</span>
                  <code>{account.uid}</code>
                </div>
                <div>
                  <span>Email</span>
                  <code>{account.email ? `${account.email}${account.emailVerified ? ' / 已驗證' : ' / 未驗證'}` : 'Firebase Auth 未提供'}</code>
                </div>
              </div>
              <div className="account-stat-grid">
                <div><span>貼文</span><strong>{account.postCount}</strong></div>
                <div><span>留言</span><strong>{account.commentCount}</strong></div>
                <div><span>回覆</span><strong>{account.replyCount}</strong></div>
                <div><span>最高風險</span><strong>{Math.round(account.maxRisk)}</strong></div>
              </div>
              <div className="account-meta">
                <span>角色：{account.role || 'user'}</span>
                <span>加入日期：{fullTimeText(account.createdAt || account.authCreatedAt)}</span>
                <span>最後活動：{fullTimeText(account.lastSeenAt || account.authLastSignInAt)}</span>
                <span>最後 IP：{account.lastIpAddress || '未記錄'}{account.lastIpKey ? ` / key ${account.lastIpKey}` : ''}</span>
                <span>IP 時間：{fullTimeText(account.lastIpAt)}</span>
                <span>狀態碼：{account.accountStatus || 'normal'}</span>
                <span>Auth：{account.authDisabled ? 'disabled' : 'enabled'}</span>
              </div>
              {account.reason && <p>{account.reason}</p>}
              <div className="account-actions">
                <button disabled={Boolean(busy) || isStationMaster || account.accountStatus === 'watch'} onClick={() => void run(account, 'watch')}>觀察</button>
                <button disabled={Boolean(busy) || isStationMaster || account.accountStatus !== 'watch'} onClick={() => void run(account, 'clear_watch')}>解除觀察</button>
                <button disabled={Boolean(busy) || isStationMaster || account.accountStatus === 'posting_suspended'} onClick={() => void run(account, 'suspend_posting')}>暫停發文</button>
                <button disabled={Boolean(busy) || isStationMaster || account.accountStatus !== 'posting_suspended'} onClick={() => void run(account, 'restore_posting')}>恢復發文</button>
                <button className="danger" disabled={Boolean(busy) || isStationMaster || account.isBanned} onClick={() => void run(account, 'ban')}>停權</button>
                <button disabled={Boolean(busy) || isStationMaster || !account.isBanned} onClick={() => void run(account, 'unban')}>解除停權</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function App() {
  const { user, ready, message, login } = useStationAuth();
  const [items, setItems] = React.useState<SiteItem[]>([]);
  const [cases, setCases] = React.useState<ModerationCase[]>([]);
  const [reports, setReports] = React.useState<ReportItem[]>([]);
  const [accounts, setAccounts] = React.useState<AccountItem[]>([]);
  const [activeDrawer, setActiveDrawer] = React.useState<DrawerKey>('cockpit');
  const [selectedCaseId, setSelectedCaseId] = React.useState('');
  const [selectedContentPath, setSelectedContentPath] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = React.useState(false);
  const [lastLoadedAt, setLastLoadedAt] = React.useState<Date | null>(null);
  const [consoleLines, setConsoleLines] = React.useState<string[]>(['後台已啟動，等待站長登入。']);

  const isStationMaster = ready && user?.uid === STATION_MASTER_UID;

  const pushLog = React.useCallback((line: string) => {
    setConsoleLines(previous => [line, ...previous].slice(0, 8));
  }, []);

  const reloadSiteItems = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const nextItems = await loadSiteItems();
      setItems(nextItems.sort((a, b) => b.currentRiskScore - a.currentRiskScore || toMillis(b.createdAt) - toMillis(a.createdAt)));
      setLastLoadedAt(new Date());
      pushLog(`已讀取全站內容 ${nextItems.length} 筆。`);
    } catch (error) {
      pushLog(`讀取全站內容失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [pushLog]);

  const reloadAccounts = React.useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const nextAccounts = await loadAccountItems();
      setAccounts(nextAccounts);
      pushLog(`已讀取帳號 ${nextAccounts.length} 筆。`);
    } catch (error) {
      pushLog(`讀取帳號抽屜失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [pushLog]);

  React.useEffect(() => {
    if (!isStationMaster) return undefined;
    void reloadSiteItems();
    void reloadAccounts();
    const timer = window.setInterval(() => void reloadSiteItems(), 45000);
    const accountTimer = window.setInterval(() => void reloadAccounts(), 90000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(accountTimer);
    };
  }, [isStationMaster, reloadAccounts, reloadSiteItems]);

  React.useEffect(() => {
    if (!isStationMaster) return undefined;
    const caseQuery = query(collection(db, 'moderationCases'), orderBy('updatedAt', 'desc'), firestoreLimit(160));
    return onSnapshot(caseQuery, snapshot => {
      const nextCases = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as ModerationCase)
        .sort((a, b) => casePriority(b) - casePriority(a));
      setCases(nextCases);
      setSelectedCaseId(current => current || nextCases[0]?.id || '');
    }, error => pushLog(`治理案件讀取失敗：${error.message}`));
  }, [isStationMaster, pushLog]);

  React.useEffect(() => {
    if (!isStationMaster) return undefined;
    const reportQuery = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), firestoreLimit(80));
    return onSnapshot(reportQuery, snapshot => {
      setReports(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as ReportItem));
    }, error => pushLog(`檢舉通報讀取失敗：${error.message}`));
  }, [isStationMaster, pushLog]);

  const selectedCase = React.useMemo(
    () => cases.find(item => item.id === selectedCaseId) || cases[0] || null,
    [cases, selectedCaseId],
  );

  const riskCounts = React.useMemo(() => {
    const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    items.forEach(item => { counts[item.currentRiskLabel] += 1; });
    cases.forEach(item => { counts[item.riskLevel || riskFromScore(Number(item.riskScore || 0))] += 1; });
    return counts;
  }, [items, cases]);

  const accountsWithStats = React.useMemo(() => {
    const stats = new Map<string, { postCount: number; commentCount: number; replyCount: number; maxRisk: number }>();
    items.forEach(item => {
      if (!item.authorId) return;
      const next = stats.get(item.authorId) || { postCount: 0, commentCount: 0, replyCount: 0, maxRisk: 0 };
      if (item.sourceType === 'post') next.postCount += 1;
      if (item.sourceType === 'comment') next.commentCount += 1;
      if (item.sourceType === 'reply') next.replyCount += 1;
      next.maxRisk = Math.max(next.maxRisk, item.currentRiskScore);
      stats.set(item.authorId, next);
    });
    return accounts
      .map(account => ({ ...account, ...(stats.get(account.uid) || {}) }))
      .sort((a, b) => {
        const bWeight = (b.isBanned ? 1000 : 0) + (b.accountStatus !== 'normal' ? 300 : 0) + b.maxRisk;
        const aWeight = (a.isBanned ? 1000 : 0) + (a.accountStatus !== 'normal' ? 300 : 0) + a.maxRisk;
        return bWeight - aWeight;
      });
  }, [accounts, items]);

  const contentSourcePaths = React.useMemo(
    () => new Set(items.map(item => item.sourcePath).filter(Boolean)),
    [items],
  );

  const drawerCounts: Record<DrawerKey, number> = {
    cockpit: riskCounts.high + riskCounts.critical,
    accounts: accountsWithStats.length,
    articles: items.length,
    reports: reports.length,
    aiSheet: items.length,
    cases: cases.length,
  };

  const runCaseAction = async (item: ModerationCase, action: CaseAction) => {
    const callable = httpsCallable(functions, 'rangerModerationAction');
    await callable({ caseId: item.id, action, adminNote: '站長於本地後台處理。' });
    pushLog(`案件 ${item.publicCaseId || item.id} 已執行 ${action}。`);
  };

  const runContentAction = async (item: SiteItem, action: ContentAction) => {
    const callable = httpsCallable(functions, 'rangerContentAction');
    await callable({ sourcePath: item.sourcePath, action, reason: '站長於本地後台處理。' });
    pushLog(`${sourceLabel(item.sourceType)} ${item.sourcePath} 已執行 ${action}。`);
    await reloadSiteItems();
  };

  const runAccountAction = async (account: AccountItem, action: AccountAction, reason: string) => {
    const callable = httpsCallable(functions, 'rangerAccountAction');
    await callable({ uid: account.uid, action, reason });
    pushLog(`帳號 ${account.displayName || compactUid(account.uid)} 已執行 ${action}。`);
  };

  const syncReport = async (report: ReportItem) => {
    const callable = httpsCallable(functions, 'rangerSyncReportCase');
    await callable({ reportId: report.id, sourcePath: sourcePathFromReport(report) });
    pushLog(`檢舉 ${report.id} 已同步成治理案件。`);
  };

  const viewReportTarget = (sourcePath: string) => {
    setSelectedContentPath(sourcePath);
    setActiveDrawer('articles');
    pushLog(`已切到文章抽屜查看目標：${sourcePath}`);
  };

  if (!isStationMaster) {
    return <AccessGate user={user} ready={ready} message={message} onLogin={() => void login()} />;
  }

  return (
    <main className={`lab-root drawer-${activeDrawer}`}>
      <div className="hud-grid" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-orb"><Shield size={22} /></div>
          <div>
            <p>MATSU STATION</p>
            <h1>AI 游騎兵本地後台</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-badge">本機站長後台</span>
          <span className="local-badge live-badge">即時同步</span>
          <span className="local-badge">更新 {lastLoadedAt ? lastLoadedAt.toLocaleTimeString('zh-TW') : '待命'}</span>
          <span className="user-chip">{user?.displayName || user?.email}</span>
          <button onClick={() => void signOut(auth)}><LogOut size={15} /> 登出</button>
        </div>
      </header>

      <section className="ops-strip">
        <MetricCard label="全站內容" value={items.length} hint="貼文、留言、回覆總數" />
        <MetricCard label="治理案件" value={cases.length} hint="moderationCases 即時同步" tone="#facc15" />
        <MetricCard label="檢舉通報" value={reports.length} hint="reports collection" tone="#ff7a18" />
        <MetricCard label="高風險" value={riskCounts.high + riskCounts.critical} hint="高與極高風險合計" tone="#ff2d55" />
      </section>

      <section className="panel left-panel">
        <div className="panel-title"><Activity size={18} /><span>站務狀態</span></div>
        <div className="risk-stack">
          {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map(level => (
            <div key={level}><span style={{ color: riskTone(level) }}>{riskLabel(level)}</span><strong>{riskCounts[level]}</strong></div>
          ))}
        </div>
        <div className="case-actions">
          <button className="wide-action" disabled={isLoading} onClick={() => void reloadSiteItems()}>
            {isLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            重新整理後台資料
          </button>
        </div>
      </section>

      <DrawerCabinet activeDrawer={activeDrawer} counts={drawerCounts} onChange={setActiveDrawer} />

      {activeDrawer === 'accounts' && (
        <AccountDrawer accounts={accountsWithStats} onReload={reloadAccounts} onAction={runAccountAction} />
      )}

      {activeDrawer === 'articles' && (
        <ContentTable items={items} selectedPath={selectedContentPath} onAction={runContentAction} />
      )}
      {activeDrawer === 'reports' && (
        <ReportsPanel reports={reports} onSync={syncReport} onViewTarget={viewReportTarget} />
      )}
      {activeDrawer === 'aiSheet' && <SiteSheetPanel items={items} onReload={reloadSiteItems} />}
      {activeDrawer === 'cases' && (
        <CasePanel cases={cases} selected={selectedCase} sourcePaths={contentSourcePaths} onSelect={setSelectedCaseId} onAction={runCaseAction} />
      )}

      <footer className="console-panel">
        <div>
          <span>游騎兵主控台</span>
          <em>{firebaseConfig.projectId} / {firebaseConfig.firestoreDatabaseId || '(default)'}</em>
        </div>
        <pre>{consoleLines.join('\n')}</pre>
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
