import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  getFirestore,
  limit as firestoreLimit,
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
type CaseStatusFilter = 'active' | 'all' | 'pending' | 'quarantined' | 'released' | 'removed' | 'dismissed';
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
  consoleLines: ['AI Rangers Visual Lab ready. Sign in as station master to load data.'],
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

function getStatusLabel(status?: string) {
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

function isActiveCase(item: PatrolCase) {
  return !item.status || item.status === 'pending' || item.status === 'quarantined';
}

function matchesCaseFilter(item: PatrolCase, filter: CaseStatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') return isActiveCase(item);
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
    const snapshot = await getDocs(collection(db, 'users'));
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
  try {
    const snapshot = await getDocs(query(collection(db, 'moderationCases'), orderBy('createdAt', 'desc'), firestoreLimit(80)));
    return snapshot.docs.map(caseDoc => ({ id: caseDoc.id, ...caseDoc.data() } as PatrolCase));
  } catch (error) {
    console.warn('Moderation cases read failed:', error);
    return [];
  }
}

async function collectLabData(scanLimit: number): Promise<LabData> {
  const startedAt = Date.now();
  const users = await loadUsers();
  const postsSnapshot = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), firestoreLimit(scanLimit)));
  const patrolFeed = (await loadPatrolCases()).sort((a, b) => getCaseSortScore(b) - getCaseSortScore(a));

  const userWeights = new Map<string, number>();
  const userRisk = new Map<string, number>();
  const edgeMap = new Map<string, GraphLink>();
  const topicWeights = new Map<string, number>();
  const topicRisk = new Map<string, number>();
  const topicEdgeMap = new Map<string, GraphLink>();
  const consoleLines: string[] = [];
  let interactions = 0;

  for (const postDoc of postsSnapshot.docs) {
    const post = postDoc.data();
    const postId = postDoc.id;
    const authorId = safeText(post.authorId);
    const riskScore = Number(post.moderationRiskScore || post.aiRisk || 0);
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
        getDocs(collection(db, 'posts', postId, 'likes')),
        getDocs(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'))),
      ]);

      postLikesSnapshot.docs.forEach(likeDoc => {
        interactions += 1;
        userWeights.set(likeDoc.id, (userWeights.get(likeDoc.id) || 0) + 1);
        addWeightedEdge(edgeMap, authorId, likeDoc.id, 1, 'post-like');
      });

      for (const commentDoc of commentsSnapshot.docs) {
        const comment = commentDoc.data();
        const commenterId = safeText(comment.authorId);
        const commentRisk = Number(comment.moderationRiskScore || 0);
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
          getDocs(collection(db, 'posts', postId, 'comments', commentDoc.id, 'likes')),
          getDocs(query(collection(db, 'posts', postId, 'comments', commentDoc.id, 'replies'), orderBy('createdAt', 'asc'))),
        ]);

        commentLikesSnapshot.docs.forEach(likeDoc => {
          interactions += 1;
          userWeights.set(likeDoc.id, (userWeights.get(likeDoc.id) || 0) + 1);
          addWeightedEdge(edgeMap, commenterId, likeDoc.id, 1, 'comment-like');
        });

        for (const replyDoc of repliesSnapshot.docs) {
          const reply = replyDoc.data();
          const replyAuthorId = safeText(reply.authorId);
          const replyRisk = Number(reply.moderationRiskScore || 0);
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

  consoleLines.push(`Scanned ${postsSnapshot.size} posts in ${Date.now() - startedAt}ms.`);
  consoleLines.push(`Mapped ${socialNodes.length} UID nodes and ${socialLinks.length} interaction edges.`);
  consoleLines.push(`Mapped ${topicNodes.length} topic nodes and ${topicLinks.length} semantic edges.`);
  if (!patrolFeed.length) {
    consoleLines.push('No moderationCases visible. Sign in as station master if AI feed is locked.');
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
        ctx.save();
        ctx.shadowColor = node.risk >= 70 ? getRiskTone(node.risk >= 90 ? 'critical' : 'high') : node.color;
        ctx.shadowBlur = node.risk >= 70 ? 24 : 14;
        ctx.fillStyle = node.risk >= 70 ? getRiskTone(node.risk >= 90 ? 'critical' : 'high') : node.color;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius + 4, 0, Math.PI * 2);
        ctx.stroke();

        if (node.weight >= 6 || node.risk >= 70) {
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
          <span>{hovered.type === 'user' ? 'UID' : 'TOPIC'}</span>
          <strong>{hovered.label}</strong>
          <em>weight {Math.round(hovered.weight)} | risk {Math.round(hovered.risk)}</em>
        </div>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [mode, setMode] = React.useState<GraphMode>('social');
  const [caseFilter, setCaseFilter] = React.useState<CaseStatusFilter>('active');
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null);
  const [actionState, setActionState] = React.useState<{ caseId: string; action: RangerAction } | null>(null);
  const [scanLimit, setScanLimit] = React.useState(60);
  const [data, setData] = React.useState<LabData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = React.useState(false);
  const [lastLoadedAt, setLastLoadedAt] = React.useState<Date | null>(null);

  React.useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  const loadData = React.useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const nextData = await collectLabData(scanLimit);
      setData(nextData);
      setLastLoadedAt(new Date());
    } catch (error) {
      console.error(error);
      setData(previous => ({
        ...previous,
        consoleLines: ['Scan failed. Check Firebase permission and network.', String(error)],
      }));
    } finally {
      setIsLoading(false);
    }
  }, [scanLimit, user]);

  React.useEffect(() => {
    if (user) void loadData();
  }, [user, loadData]);

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

  const runCaseAction = React.useCallback(async (caseItem: PatrolCase, action: RangerAction) => {
    if (!user) return;

    const actionLabel = {
      mark_reviewed: '標記已審',
      dismiss: '忽略案件',
      release: '放行內容',
      quarantine: '隔離內容',
      remove: '移除內容',
    }[action];

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
          `Action ${action} completed for ${caseItem.publicCaseId || caseItem.id}.`,
          ...previous.consoleLines,
        ].slice(0, 8),
      }));
      await loadData();
    } catch (error) {
      console.error(error);
      setData(previous => ({
        ...previous,
        consoleLines: [
          `Action ${action} failed for ${caseItem.publicCaseId || caseItem.id}.`,
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
            <h1>AI Rangers Visual Lab</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-badge">LOCAL ONLY</span>
          {user ? (
            <>
              <span className="user-chip"><UserCircle2 size={15} />{user.displayName || user.email}</span>
              <button onClick={() => void signOut(auth)}>登出</button>
            </>
          ) : (
            <button className="primary" onClick={() => void signInWithPopup(auth, provider)}>Google 登入</button>
          )}
        </div>
      </header>

      <section className="lab-layout">
        <aside className="panel left-panel">
          <div className="panel-title">
            <Radar size={18} />
            <span>Ranger Telemetry</span>
          </div>
          <div className="metric-grid">
            <div><strong>{data.postsScanned}</strong><span>posts scanned</span></div>
            <div><strong>{data.interactions}</strong><span>interactions</span></div>
            <div><strong>{data.usersSeen}</strong><span>UID nodes</span></div>
            <div><strong>{data.topicCount}</strong><span>topic nodes</span></div>
          </div>

          <div className="control-block">
            <label>Graph Mode</label>
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
            <label>Scan Depth: {scanLimit} posts</label>
            <input
              type="range"
              min="20"
              max="140"
              step="20"
              value={scanLimit}
              onChange={event => setScanLimit(Number(event.target.value))}
            />
          </div>

          <button className="wide-action" disabled={!user || isLoading} onClick={() => void loadData()}>
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
            <span><Eye size={15} /> {mode === 'social' ? 'Force-Directed UID Interaction Map' : 'Semantic Topic Neural Map'}</span>
            <span>{nodes.length} nodes / {links.length} edges</span>
          </div>
          <ForceGraph nodes={nodes} links={links} mode={mode} />
        </section>

        <aside className="panel right-panel">
          <div className="panel-title">
            <Shield size={18} />
            <span>AI Patrol Feed</span>
          </div>
          <div className="threat-card">
            <span>highest risk</span>
            <strong>{highestRisk}</strong>
            <em>/100</em>
          </div>

          <div className="case-filter">
            <Filter size={14} />
            {(['active', 'all', 'pending', 'quarantined', 'released', 'removed'] as CaseStatusFilter[]).map(filter => (
              <button
                key={filter}
                className={caseFilter === filter ? 'active' : ''}
                onClick={() => setCaseFilter(filter)}
              >
                {filter === 'active' ? '處理中' : filter === 'all' ? '全部' : getStatusLabel(filter)}
              </button>
            ))}
          </div>

          <div className="case-summary-strip">
            <div>
              <span>active</span>
              <strong>{activeCaseCount}</strong>
            </div>
            <div>
              <span>visible</span>
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
                <small>{getSourceLabel(item.sourceType)} / {getStatusLabel(item.status)}</small>
                <p>{item.summary || item.contentPreview || 'AI case pending summary'}</p>
              </button>
            )) : (
              <div className="empty-feed">
                <Activity size={22} />
                <p>尚未讀到 AI 案件。請確認你已用站長帳號登入，且 Firestore Rules 允許讀取 moderationCases。</p>
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
                <span className="eyebrow">CASE INSPECTOR</span>
                <h2>{selectedCase.publicCaseId || selectedCase.id}</h2>
              </div>
              <div className="case-badges">
                <span style={{ borderColor: getRiskTone(selectedCase.riskLevel), color: getRiskTone(selectedCase.riskLevel) }}>
                  {getRiskLabel(selectedCase.riskLevel)} {Math.round(Number(selectedCase.riskScore || 0))}/100
                </span>
                <span>{getSourceLabel(selectedCase.sourceType)}</span>
                <span>{getStatusLabel(selectedCase.status)}</span>
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
              <span>路徑：{selectedCase.sourcePath || 'unknown'}</span>
              {selectedCase.categories?.slice(0, 5).map(label => (
                <em key={label}>{label}</em>
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
                  {actionState.action} / {actionState.caseId.slice(0, 10)}
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
          <span>RANGER CONSOLE</span>
          <em>{lastLoadedAt ? lastLoadedAt.toLocaleTimeString() : 'standby'}</em>
        </div>
        <pre>{data.consoleLines.join('\n')}</pre>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
