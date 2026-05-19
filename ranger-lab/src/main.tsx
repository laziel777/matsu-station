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

interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'topic';
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

const USER_COLORS = ['#00d9e8', '#7dd3fc', '#a78bfa', '#22c55e', '#f59e0b', '#fb7185', '#e879f9'];
const TOPIC_COLORS = ['#f97316', '#eab308', '#22c55e', '#14b8a6', '#38bdf8', '#818cf8', '#f472b6'];

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
  const consoleLines: string[] = [
    `Firebase 專案 ${firebaseConfig.projectId} / 資料庫 ${firebaseConfig.firestoreDatabaseId || '(default)'}。`,
  ];
  let interactions = 0;

  for (const postDoc of postsSnapshot.docs) {
    const post = postDoc.data();
    const postId = postDoc.id;
    const authorId = safeText(post.authorId);
    const riskScore = getStoredRiskScore(post);
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
      weight,
      risk,
      cluster: 'c0',
      color: meta?.role === 'admin' ? '#ff4d4d' : USER_COLORS[Math.abs(uid.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % USER_COLORS.length],
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

  const riskCounts = patrolFeed.reduce((counts, item) => {
    const level = item.riskLevel || 'low';
    counts[level] = (counts[level] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  consoleLines.push(`已掃描 ${postsSnapshot.size} 篇貼文，耗時 ${Date.now() - startedAt}ms。`);
  consoleLines.push(`已建立 ${socialNodes.length} 個島民節點與 ${socialLinks.length} 條互動連線。`);
  consoleLines.push(`已建立 ${topicNodes.length} 個話題節點與 ${topicLinks.length} 條語意連線。`);
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

        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius + 4, 0, Math.PI * 2);
        ctx.stroke();

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
          <em>權重 {Math.round(hovered.weight)} | 風險 {Math.round(hovered.risk)}</em>
        </div>
      )}
    </div>
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
    if (!authReady) return;
    void loadData('初始同步');
  }, [authReady, user?.uid, loadData]);

  React.useEffect(() => {
    if (!authReady) return;

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

    if (user?.uid === STATION_MASTER_UID) {
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
    }

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
            <span><i className="rainbow-dot" />低風險：色盤分群</span>
            <span><i style={{ background: '#ff4d4d' }} />站長節點</span>
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
