import React, { useState, useEffect } from 'react';
import {
  useAuth,
  UserProfile,
  DEFAULT_ISLANDER_PHOTO,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_COMMUNITY_RULES_VERSION,
  POLICY_EFFECTIVE_DATE,
  hasAcceptedLatestPolicies,
} from './lib/AuthContext';
import { signInWithPopup, googleProvider, auth, signOut } from './lib/firebase';
import { LogIn, LogOut, MessageSquare, Share2, Send, Plus, User, Waves, Search, Flag, Edit2, Calendar, Menu, X, ChevronRight, Palette, Settings, Image as ImageIcon, Facebook, Instagram, Copy, Check, ExternalLink, Trash2, Bell, Shield, TrendingUp, Zap, Star, Compass, Clock, AlertCircle, Cloud, CloudRain, Snowflake, CloudLightning, Sun, Plane, Ship, Info, Wind, Eye, Activity, MapPin, RotateCcw, Loader2, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { formatDistanceToNow, addMonths, isAfter } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { db, collection, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, setDoc, deleteDoc, getDoc, getDocs, where, handleFirestoreError, OperationType, storage, functions, httpsCallable } from './lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { SITE_POLICY_PAGES, SITE_POLICY_SECTIONS, SitePolicyPage, SitePolicySectionId } from './lib/sitePolicies';

const STATION_MASTER_UID = 'gHHxF8p1DnbMkoeVmU5XpB18Elz2';
const STATION_MASTER_LEGACY_ID = 'L';
const DEFAULT_BACKGROUND_MODE = 'dark';
const DEFAULT_ACCENT_ID = 'bio-glow';
const DEFAULT_FONT_SIZE = 100;
const POST_CHAR_LIMIT = 500;
const COMMENT_CHAR_LIMIT = 250;
const POST_COOLDOWN_MS = 30 * 1000;
const COMMENT_BURST_WINDOW_MS = 60 * 1000;
const COMMENT_BURST_LIMIT = 6;
const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;
const DAILY_POST_LIMIT = 20;
const DAILY_COMMENT_LIMIT = 120;
const ANTI_ABUSE_NOTICE = '為了防止洗文、機器濫用與大量複製垃圾文，馬祖小站會限制發文頻率。';
const LINE_OFFICIAL_URL = 'https://lin.ee/nn0RaOc';
const MATSU_AIRPORT_URL = 'https://msa.gov.tw/flights/nangan';
const MOTCMPB_FERRY_URL = 'https://www.motcmpb.gov.tw/PassengerShip/Schedule?SiteId=1&NodeId=610&ShipLaneNo=C001';
const REACTION_OPTIONS = ['❤️', '😂', '😭', '🔥', '👍', '👎', '😡', '😍', '🤔', '😮'];
const DEFAULT_REACTION = '❤️';
const REPORT_REASON_OPTIONS = ['人身攻擊', '誹謗/不實指控', '個資/肉搜', '威脅/暴力', '騷擾/圍剿', '詐騙', '色情/私密影像', '垃圾訊息/洗版', '其他'];
const PROFILE_TABS = [
  { id: 'posts', label: '歷史發文' },
  { id: 'liked', label: '按讚內容' },
] as const;

const getPolicyPageByPath = (pathname: string) => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return SITE_POLICY_PAGES.find(page => page.path === normalizedPath) || null;
};

function PolicySections({
  sectionIds,
  showVersionCards = false,
}: {
  sectionIds: SitePolicySectionId[];
  showVersionCards?: boolean;
}) {
  const sections = sectionIds
    .map(sectionId => SITE_POLICY_SECTIONS.find(section => section.id === sectionId))
    .filter((section): section is typeof SITE_POLICY_SECTIONS[number] => Boolean(section));

  return (
    <>
      {sections.map(section => {
        const isOverview = section.id === 'overview';
        const className = section.tone === 'glow'
          ? 'space-y-3 rounded-2xl border border-bio-glow/10 bg-bio-glow/5 p-4'
          : section.tone === 'privacy'
            ? 'space-y-3 rounded-2xl border border-emerald-500/10 bg-emerald-500/10 p-4 text-emerald-300'
            : section.tone === 'muted'
              ? 'space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4'
              : 'space-y-3';

        return (
          <section key={section.id} className={className}>
            {section.eyebrow && (
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-bio-glow">{section.eyebrow}</p>
            )}
            <h3 className={`text-base font-bold flex items-center gap-2 ${
              section.tone === 'privacy' ? 'text-emerald-200' : section.tone === 'glow' ? 'text-bio-glow' : 'text-text-main'
            }`}>
              {section.id === 'terms' && <span className="w-1 h-4 rounded-full bg-bio-glow" />}
              {section.title}
            </h3>
            {isOverview && showVersionCards && (
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-mist/40 p-3">
                  <span className="text-text-muted">服務條款</span>
                  <p className="mt-1 font-mono font-bold text-text-main">{CURRENT_TERMS_VERSION}</p>
                </div>
                <div className="rounded-xl border border-line bg-mist/40 p-3">
                  <span className="text-text-muted">隱私權政策</span>
                  <p className="mt-1 font-mono font-bold text-text-main">{CURRENT_PRIVACY_VERSION}</p>
                </div>
                <div className="rounded-xl border border-line bg-mist/40 p-3">
                  <span className="text-text-muted">社群規範</span>
                  <p className="mt-1 font-mono font-bold text-text-main">{CURRENT_COMMUNITY_RULES_VERSION}</p>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {isOverview && (
                <p className="text-[0.6875rem] text-text-muted leading-relaxed">生效日：{POLICY_EFFECTIVE_DATE}</p>
              )}
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.id === 'contact' && (
                <div className="space-y-2 text-xs">
                  <p className="flex items-center gap-2 font-bold text-bio-glow">
                    <span className="font-mono text-text-muted">LINE:</span>
                    <a
                      href={LINE_OFFICIAL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-main/80 underline hover:text-bio-glow"
                    >
                      馬祖小站 Matsu Station（官方 LINE）
                    </a>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-text-muted">IG:</span>
                    <span className="text-text-main/80">@matsu.station</span>
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

function PolicyStandalonePage({ page }: { page: SitePolicyPage }) {
  return (
    <div className="min-h-screen bg-deep-ocean text-text-main font-sans">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:py-12">
        <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-bio-glow hover:text-text-main">
              <Waves className="h-4 w-4" />
              返回馬祖小站
            </a>
            <h1 className="font-display text-3xl font-black tracking-tight text-text-main sm:text-5xl">{page.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">{page.description}</p>
          </div>
          <div className="rounded-2xl border border-bio-glow/10 bg-bio-glow/5 px-4 py-3 text-xs text-text-muted">
            <p className="font-mono font-bold text-bio-glow">版本 {CURRENT_TERMS_VERSION}</p>
            <p>生效日 {POLICY_EFFECTIVE_DATE}</p>
          </div>
        </div>

        <nav className="mb-8 grid gap-2 sm:grid-cols-5">
          {SITE_POLICY_PAGES.map(item => (
            <a
              key={item.path}
              href={item.path}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
                item.path === page.path
                  ? 'border-bio-glow/30 bg-bio-glow/10 text-bio-glow'
                  : 'border-line bg-mist/30 text-text-muted hover:border-bio-glow/20 hover:text-text-main'
              }`}
            >
              {item.title}
            </a>
          ))}
        </nav>

        <div className="space-y-8 text-sm leading-relaxed text-text-muted">
          <PolicySections sectionIds={page.sectionIds} showVersionCards={page.path === '/terms'} />
        </div>
      </main>
    </div>
  );
}

type ProfileTabId = typeof PROFILE_TABS[number]['id'];
type ModerationStatus =
  | 'normal'
  | 'flagged'
  | 'masked'
  | 'pending_review'
  | 'approved'
  | 'hidden'
  | 'image_hidden'
  | 'image_deleted'
  | 'deleted'
  | 'appealed'
  | 'quarantined'
  | 'removed'
  | 'released'
  | string;
type ModerationContentType = 'post' | 'comment' | 'reply' | 'content';
type ReportTargetType = 'post' | 'comment' | 'reply';

interface ReportDraft {
  targetId: string;
  targetType: ReportTargetType;
  commentId?: string;
  replyId?: string;
  preview: string;
}

interface RiskProfile {
  legalRisk?: number;
  communityRisk?: number;
  credibility?: number;
  spreadRisk?: number;
  coordinationRisk?: number;
  velocityRisk?: number;
}

interface ProfileStats {
  postCount: number;
  followingCount: number;
  followerCount: number;
}

interface RelationshipListItem {
  uid: string;
  islanderId?: string;
  displayName: string;
  photoURL?: string;
}

interface FollowRequestItem extends RelationshipListItem {
  requesterId: string;
  createdAt?: any;
}

interface MentionSuggestion {
  uid: string;
  islanderId?: string;
  displayName: string;
  photoURL?: string;
  role?: 'user' | 'admin';
}

const EMPTY_PROFILE_STATS: ProfileStats = {
  postCount: 0,
  followingCount: 0,
  followerCount: 0,
};

const compressImageFile = async (file: File, options: Record<string, unknown>) => {
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, options);
};

const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const POST_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_IMAGE_ALLOWED_TYPES = POST_IMAGE_ALLOWED_TYPES;

const BACKGROUND_MODES = [
  { id: 'dark', name: '深色背景', description: '夜間閱讀', previewBackground: '#0A0C10', previewText: '#FAFAF9' },
  { id: 'light', name: '淺色背景', description: '白天閱讀', previewBackground: '#F8FAFC', previewText: '#0F172A' },
];

const ACCENT_COLORS = [
  { id: 'bio-glow', name: '藍眼淚', color: '#00D9E8', lightTextColor: '#007A83' },
  { id: 'teal', name: '海松綠', color: '#00969B', lightTextColor: '#047481' },
  { id: 'indigo', name: '島嶼藍', color: '#6366F1', lightTextColor: '#4338CA' },
  { id: 'lava', name: '地獄火', color: '#FF4D4D', lightTextColor: '#B91C1C' },
  { id: 'amethyst', name: '紫水晶', color: '#BF4DFF', lightTextColor: '#7E22CE' },
  { id: 'golden', name: '大霧金', color: '#EAB308', lightTextColor: '#854D0E' },
  { id: 'forest', name: '相思林', color: '#22C55E', lightTextColor: '#047857' },
  { id: 'sunset', name: '芹壁夕', color: '#F97316', lightTextColor: '#C2410C' },
  { id: 'cyberpunk', name: '霓虹島', color: '#D946EF', lightTextColor: '#A21CAF' },
  { id: 'deep-sea', name: '深海溝', color: '#3366FF', lightTextColor: '#1D4ED8' },
  { id: 'mint', name: '冷泡茶', color: '#14B8A6', lightTextColor: '#0F766E' },
  { id: 'sakura', name: '春日櫻', color: '#F472B6', lightTextColor: '#BE185D' },
];

const LEGACY_LIGHT_THEMES = new Set(['classic-white', 'soft-light']);
const LEGACY_ACCENT_MAP: Record<string, string> = {
  'classic-white': 'teal',
  'soft-light': 'indigo',
};

// Types
interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  moderationStatus?: ModerationStatus;
  moderationReason?: string;
  moderationPublicNotice?: string;
  moderationMaskNotice?: string;
  moderationReviewNotice?: string;
  moderationPublicCaseId?: string;
  moderationRiskLevel?: 'low' | 'medium' | 'high' | 'critical' | string;
  moderationRiskScore?: number;
  category?: string;
  aiSafe?: boolean;
  aiRisk?: number;
  aiTag?: string;
  aiSummary?: string;
  aiAction?: string;
  likesCount: number;
  commentsCount: number;
  reportsCount?: number;
  recommendationScore?: number;
  recommendationSafetyWeight?: number;
  recommendationBucket?: 'normal' | 'downrank' | 'no_recommend' | string;
  recommendationRiskProfile?: RiskProfile;
  moderationRiskProfile?: RiskProfile;
  recommendationUpdatedAt?: any;
  imageUrl?: string;
  imagePath?: string;
  imageUrls?: string[];
  imagePaths?: string[];
  createdAt: any;
}

interface WeatherStatus {
  temp: number | null;
  icon: string;
  text: string;
  wind: number | null;
  dir: string;
  vis: number | null;
  humidity: number | null;
  visibilityText?: string;
  ceilingText?: string;
  source?: string;
  sourceUrl?: string;
  fetchedAtIso?: string;
  notice?: string;
  flightAllowed?: boolean | null;
  airports?: {
    nangan?: any;
    beigan?: any;
  };
}

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  authorRole?: 'user' | 'admin';
  content: string;
  moderationStatus?: ModerationStatus;
  moderationReason?: string;
  moderationPublicNotice?: string;
  moderationMaskNotice?: string;
  moderationReviewNotice?: string;
  moderationPublicCaseId?: string;
  moderationRiskLevel?: 'low' | 'medium' | 'high' | 'critical' | string;
  moderationRiskScore?: number;
  likesCount?: number;
  repliesCount?: number;
  replies?: CommentReply[];
  createdAt: any;
}

interface CommentReply {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  authorRole?: 'user' | 'admin';
  content: string;
  moderationStatus?: ModerationStatus;
  moderationReason?: string;
  moderationPublicNotice?: string;
  moderationMaskNotice?: string;
  moderationReviewNotice?: string;
  moderationPublicCaseId?: string;
  moderationRiskLevel?: 'low' | 'medium' | 'high' | 'critical' | string;
  moderationRiskScore?: number;
  likesCount?: number;
  createdAt: any;
}

interface DiscussionTarget {
  postId: string;
  commentId?: string;
  replyId?: string;
  openComments?: boolean;
  nonce: number;
}

interface PolicyReference {
  code: string;
  label: string;
}

interface GovernanceRecord {
  id: string;
  publicCaseId?: string;
  sourceType?: 'post' | 'comment' | 'reply' | string;
  status?: string;
  riskLevel?: string;
  riskScore?: number;
  summary?: string;
  legalRisk?: string;
  recommendedAction?: string;
  contentPreview?: string;
  contentSnapshot?: string;
  policyVersion?: string;
  policyRefs?: PolicyReference[];
  sourcePath?: string;
  createdAt?: any;
  updatedAt?: any;
}

const MEDIUM_MASK_COPY = '此內容可能涉及高爭議、攻擊性或未經證實資訊，請自行斟酌是否閱讀。';
const LEGACY_HIGH_REVIEW_COPY = '此內容因可能違反社群規範，已由站方暫時隱藏，待確認後再處理。';
const HIGH_REVIEW_COPY = '此內容可能涉及風險資訊或使用政策爭議，已暫時進入站長審核中，原文暫不公開。';
const HIDDEN_PUBLIC_COPY = '此內容因違反社群規範，已被站方處理。';
const AUTHOR_DELETED_COPY = '此內容已由作者刪除。';

const INTERNAL_MODERATION_TERMS =
  /\b(AI|Gemini|Regex|regex|Ranger|queue|precheck|lightguard|moderation|spam|fallback)\b|語意|本地防呆|防呆|輕量|巡邏|模型|演算法|第一人稱|優先送|候選|命中|底線|技術|敏感格式|完整判讀|無法完整判讀|LR\d|CR\d|SR\d|風險分數/i;

const isModerationMasked = (status?: string) => status === 'masked';
const isImageModerationHidden = (status?: string) => status === 'image_hidden' || status === 'image_deleted';

const isModerationRestricted = (status?: string) => {
  return ['pending_review', 'hidden', 'deleted', 'quarantined', 'removed'].includes(String(status || ''));
};

const isModerationHidden = isModerationRestricted;

const normalizeModerationReviewNotice = (notice?: string) => {
  const cleanNotice = String(notice || '').trim();
  if (!cleanNotice || cleanNotice === LEGACY_HIGH_REVIEW_COPY || INTERNAL_MODERATION_TERMS.test(cleanNotice)) return HIGH_REVIEW_COPY;
  return cleanNotice;
};

const getPublicModerationNotice = (status?: string, notice?: string) => {
  const cleanNotice = String(notice || '').trim();
  if (!cleanNotice || INTERNAL_MODERATION_TERMS.test(cleanNotice)) {
    if (status === 'masked') return MEDIUM_MASK_COPY;
    if (status === 'pending_review' || status === 'quarantined') return HIGH_REVIEW_COPY;
    if (status === 'hidden' || status === 'deleted' || status === 'removed') return HIDDEN_PUBLIC_COPY;
    return '';
  }
  return cleanNotice;
};

const getPublicModerationReason = (reason?: string) => {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason || INTERNAL_MODERATION_TERMS.test(cleanReason)) return '';
  return cleanReason.slice(0, 160);
};

const getPublicGovernanceSummary = (record: GovernanceRecord) => {
  const cleanSummary = String(record.summary || '').trim();
  if (cleanSummary && !INTERNAL_MODERATION_TERMS.test(cleanSummary)) return cleanSummary;
  const status = String(record.status || '');
  if (status === 'approved' || status === 'released') return '站方已完成查看，此內容目前可正常公開。';
  if (status === 'masked') return MEDIUM_MASK_COPY;
  if (status === 'pending_review' || status === 'quarantined') return HIGH_REVIEW_COPY;
  if (status === 'hidden' || status === 'removed' || status === 'deleted') return HIDDEN_PUBLIC_COPY;
  return '此紀錄保留供你查詢站務處理狀態。';
};

const getPublicGovernanceExplanation = (record: GovernanceRecord) => {
  const raw = String(record.legalRisk || record.recommendedAction || '').trim();
  if (raw && !INTERNAL_MODERATION_TERMS.test(raw)) return raw;
  if (record.policyRefs?.length) return '處理依據請參考下方社群規範條款。';
  return '站方依社群規範與平台安全需要處理，完整內部判斷不公開。';
};

const getModerationTombstoneText = (
  status?: string,
  reason?: string,
  contentType: ModerationContentType = 'content',
  notice?: string,
) => {
  const cleanReason = getPublicModerationReason(reason);
  const cleanNotice = getPublicModerationNotice(status, notice);
  if (status === 'masked') return cleanNotice || MEDIUM_MASK_COPY;
  if (status === 'pending_review' || status === 'quarantined') return normalizeModerationReviewNotice(notice);
  if (status === 'hidden' || status === 'deleted' || status === 'removed') {
    const label = contentType === 'post' ? '此貼文' : '此留言';
    const rawReason = String(reason || '').trim();
    if (rawReason === 'author_deleted' || rawReason.includes('作者自行刪除') || cleanNotice === AUTHOR_DELETED_COPY) {
      return `${label}已由作者刪除。`;
    }
    return cleanReason
      ? `${label}因違反社群規範，已被站方處理。原因：${cleanReason}`
      : `${label}因違反社群規範，已被站方處理。`;
  }
  return '這則內容暫時由站長查看中。';
};

const getModerationTombstoneTitle = (status?: string) => {
  if (status === 'pending_review' || status === 'quarantined') return '站長審核中';
  if (status === 'hidden' || status === 'deleted' || status === 'removed') return '內容已由站方處理';
  if (status === 'masked') return '內容已遮罩';
  return '站務處理中';
};

function ModerationMaskNotice({
  compact = false,
  onExpand,
  notice,
}: {
  compact?: boolean;
  onExpand: () => void;
  notice?: string;
}) {
  const publicNotice = getPublicModerationNotice('masked', notice);
  return (
    <div className={`${compact ? 'rounded-xl px-3 py-2' : 'rounded-2xl px-4 py-3'} border border-amber-500/20 bg-amber-500/10`}>
      <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-amber-300`}>{publicNotice || MEDIUM_MASK_COPY}</p>
      <button
        type="button"
        onClick={onExpand}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[0.6875rem] font-bold text-amber-100 hover:bg-amber-300/20 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        展開閱讀
      </button>
    </div>
  );
}

function ModerationTombstoneNotice({
  status,
  reason,
  notice,
  contentType,
  isAuthor = false,
  compact = false,
}: {
  status?: string;
  reason?: string;
  notice?: string;
  contentType: ModerationContentType;
  isAuthor?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? 'rounded-xl px-3 py-2' : 'rounded-2xl px-4 py-3'} border border-amber-500/20 bg-amber-500/10`}>
      <div className="flex items-center gap-2 text-amber-300">
        <Shield className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-black`}>{getModerationTombstoneTitle(status)}</p>
      </div>
      <p className={`${compact ? 'mt-1 text-xs' : 'mt-1.5 text-sm'} font-bold text-amber-200/95`}>
        {getModerationTombstoneText(status, reason, contentType, notice)}
      </p>
      {isAuthor && (
        <p className={`${compact ? 'mt-1 text-[0.5625rem]' : 'mt-2 text-[0.625rem]'} text-amber-200/80`}>
          可到功能選單的「站務紀錄」查詢依據條款與處理狀態。
        </p>
      )}
    </div>
  );
}

function ImageModerationTombstone({ reason }: { reason?: string }) {
  const cleanReason = getPublicModerationReason(reason);
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/10 shadow-lg">
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-5 py-8 text-center sm:min-h-[240px]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-black text-amber-200">圖片已由站方處理</p>
          <p className="mt-1 max-w-md text-xs font-bold leading-relaxed text-amber-100/80">
            此圖片可能涉及個資、截圖、未確認資訊或其他需要站方處理的內容，原圖目前不公開。
          </p>
          {cleanReason && (
            <p className="mt-2 text-[0.6875rem] font-bold text-amber-100/70">原因：{cleanReason}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const prepareUserContent = (text: string) => text.trim();

type CreateCommunityContentPayload = {
  sourceType: 'post' | 'comment' | 'reply';
  content: string;
  category?: string;
  imageUrl?: string;
  imagePath?: string;
  imageUrls?: string[];
  imagePaths?: string[];
  postId?: string;
  commentId?: string;
};

type CreateCommunityContentResult = {
  id?: string;
  sourcePath?: string;
  status?: string;
  protected?: boolean;
  publicCaseId?: string | null;
};

type RemoveCommunityContentPayload = {
  sourceType: 'post' | 'comment' | 'reply';
  postId: string;
  commentId?: string;
  replyId?: string;
};

const createCommunityContent = httpsCallable(functions, 'createCommunityContent');
const removeCommunityContent = httpsCallable(functions, 'removeCommunityContent');
const createUserNotification = httpsCallable(functions, 'createUserNotification');
const createReport = httpsCallable(functions, 'createReport');

const submitCommunityContent = async (payload: CreateCommunityContentPayload) => {
  const result = await createCommunityContent(payload);
  return (result.data || {}) as CreateCommunityContentResult;
};

const submitRemoveCommunityContent = async (payload: RemoveCommunityContentPayload) => {
  await removeCommunityContent(payload);
};

type CreateUserNotificationPayload = {
  recipientId: string;
  type: 'like' | 'comment' | 'mention' | 'report' | 'follow_request';
  postId?: string;
  category?: string;
  commentId?: string;
  replyId?: string;
  title: string;
  content: string;
};

const submitUserNotification = async (payload: CreateUserNotificationPayload) => {
  await createUserNotification(payload);
};

const submitContentReport = async (payload: {
  targetId: string;
  targetType: 'post' | 'comment' | 'reply';
  postId: string;
  commentId?: string;
  replyId?: string;
  targetPreview?: string;
  reasonCategory: string;
  reasonDetail: string;
}) => {
  await createReport(payload);
};

const getNotificationRecipientId = (authorId?: string) => {
  return authorId === STATION_MASTER_LEGACY_ID ? STATION_MASTER_UID : (authorId || '');
};

const isFrontNotification = (notification: any) => {
  const senderId = String(notification?.senderId || '');
  if (['ai-rangers', 'safety-sweep', 'report-system'].includes(senderId)) return false;
  if (notification?.moderationCaseId) return false;
  return ['like', 'comment', 'mention', 'report', 'follow_request', 'account'].includes(String(notification?.type || ''));
};

const getSubmissionErrorMessage = (error: any, fallback: string) => {
  const rawMessage = String(error?.message || error?.details || '').trim();
  if (/INTERNAL|functions\/internal|internal/i.test(rawMessage)) {
    return '系統剛剛處理失敗，請稍後再送一次。';
  }
  return rawMessage
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    || fallback;
};

const getLoginErrorMessage = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'auth/user-disabled' || /user-disabled/i.test(message)) {
    return '這個帳號目前無法使用馬祖小站。若你認為是誤判，請透過官方 LINE 聯絡站方確認。';
  }
  if (code === 'auth/popup-closed-by-user') {
    return '登入視窗已關閉，尚未完成登入。';
  }
  if (code === 'auth/popup-blocked') {
    return '瀏覽器阻擋了登入視窗，請允許彈出視窗後再試一次。';
  }
  return '登入失敗，請稍後再試，或透過官方 LINE 回報給站長。';
};

const getAccountRestrictionNotice = (profile: any) => {
  if (!profile) return null;
  if (profile.isBanned || profile.accountStatus === 'banned') {
    return {
      tone: 'danger',
      title: '帳號目前無法使用',
      body: '你的帳號因站務治理需要暫停使用。若你認為是誤判，請透過官方 LINE 聯絡站方確認。',
    };
  }
  if (profile.accountStatus === 'posting_suspended') {
    return {
      tone: 'warning',
      title: '發布權限已暫停',
      body: '你目前可以瀏覽網站，但暫時不能發布貼文、留言或回覆。請查看小站通知中的站務原因。',
    };
  }
  if (profile.accountStatus === 'watch') {
    return {
      tone: 'info',
      title: '站務提醒',
      body: '你的帳號目前列入站務觀察，仍可正常使用。請留意近期發言是否符合社群規範。',
    };
  }
  return null;
};

const cleanMentionName = (mention: string) => {
  return mention
    .replace(/^@/, '')
    .replace(/[，。！？,.!?:;；：、）)】\]]+$/g, '')
    .trim();
};

const extractMentionNames = (text: string) => {
  const matches = text.match(/@([^\s@]+)/g) || [];
  return Array.from(new Set(matches.map(cleanMentionName).filter(Boolean)));
};

const getActiveMentionRange = (value: string, caretIndex: number | null) => {
  if (caretIndex === null) return null;
  const beforeCaret = value.slice(0, caretIndex);
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  if (match[2].trim().length === 0) return null;

  return {
    start: caretIndex - match[2].length - 1,
    end: caretIndex,
    query: match[2],
  };
};

const renderContentWithMentions = (text: string) => {
  const mentionPattern = /(@[^\s@]+)/g;
  return text.split(mentionPattern).map((part, index) => {
    if (!part.startsWith('@')) return part;

    return (
      <span key={`${part}-${index}`} className="mention-highlight rounded px-1 font-bold">
        {part}
      </span>
    );
  });
};

const sendMentionNotifications = async ({
  text,
  senderId,
  senderName,
  postId,
  category,
  commentId,
  replyId,
  sourceLabel,
}: {
  text: string;
  senderId: string;
  senderName: string;
  postId: string;
  category?: string;
  commentId?: string;
  replyId?: string;
  sourceLabel: string;
}) => {
  const mentionNames = extractMentionNames(text);
  if (mentionNames.length === 0) return;

  const notifiedRecipients = new Set<string>();

  const resolveMentions = httpsCallable(functions, 'resolveMentionRecipients');
  const result = await resolveMentions({ names: mentionNames });
  const recipients = Array.isArray((result.data as any)?.users) ? (result.data as any).users : [];

  for (const mentionedUser of recipients) {
    const recipientId = typeof mentionedUser.uid === 'string' ? mentionedUser.uid : '';

    if (!recipientId || recipientId === senderId || notifiedRecipients.has(recipientId)) continue;
    notifiedRecipients.add(recipientId);

    await submitUserNotification({
      recipientId,
      type: 'mention',
      postId,
      category,
      ...(commentId ? { commentId } : {}),
      ...(replyId ? { replyId } : {}),
      title: '有人標註了你',
      content: `${senderName} 在${sourceLabel}標註了你。`,
    });
  }
};

const normalizeCategoryName = (category?: string) => {
  return (category || '').replace(/^#/, '').trim();
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '政治論壇': ['政治', '論壇', '選舉', '議員', '鄉長', '縣長'],
  '馬祖鬼故事': ['鬼故事', '鬼', '靈異', '撞鬼', '鬧鬼'],
  '美景分享': ['美景', '風景', '景色', '夕陽', '日出', '照片'],
  '野生動物': ['野生動物', '動物', '鳥', '鹿', '蛇', '貓'],
  '馬祖UFO': ['馬祖UFO', 'UFO', '飛碟'],
};

const postMatchesCategory = (post: Post, activeCategory: string) => {
  if (activeCategory === '全部') return true;

  const postCategory = normalizeCategoryName(post.category);
  const aiCategory = normalizeCategoryName(post.aiTag);
  if (postCategory === activeCategory || aiCategory === activeCategory) return true;
  if (post.content.includes(activeCategory)) return true;

  const keywords = CATEGORY_KEYWORDS[activeCategory] || [];
  return keywords.some(keyword => post.content.toLowerCase().includes(keyword.toLowerCase()));
};

const countChars = (text: string) => Array.from(text).length;

const limitChars = (text: string, limit: number) => {
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit).join('') : text;
};

const getTimestampMillis = (value: any) => {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const getHomePostScore = (post: Post) => {
  if (isModerationHidden(post.moderationStatus)) {
    const ageHours = Math.max(0, (Date.now() - getTimestampMillis(post.createdAt)) / 3600000);
    return Math.round(-18 - Math.min(96, ageHours * 0.5));
  }
  if (post.recommendationBucket === 'no_recommend') return -100000;

  const storedScore = Number(post.recommendationScore);
  if (Number.isFinite(storedScore)) return storedScore;

  const profile = post.recommendationRiskProfile || post.moderationRiskProfile || {};
  const ageHours = Math.max(0, (Date.now() - getTimestampMillis(post.createdAt)) / 3600000);
  const freshness = Math.max(0, 120 - ageHours * 4);
  const interaction = Math.min(80, Number(post.likesCount || 0) * 2 + Number(post.commentsCount || 0) * 3);
  const risk = Math.max(Number(post.moderationRiskScore || post.aiRisk || 0), 0);
  const dimensionPenalty =
    Number(profile.legalRisk || 0) * 24 +
    Number(profile.communityRisk || 0) * 14 +
    Number(profile.spreadRisk || 0) * 22 +
    (1 - Number(profile.credibility ?? 0.68)) * 32 +
    Number(profile.coordinationRisk || 0) * 12 +
    Number(profile.velocityRisk || 0) * 8;
  const reports = Math.max(Number(post.reportsCount || 0), 0);
  const maskPenalty = isModerationMasked(post.moderationStatus) ? 35 : 0;
  return Math.round(freshness + interaction - Math.max(risk * 1.1, dimensionPenalty) - reports * 15 - maskPenalty);
};

const sortPostsForHome = (items: Post[]) => {
  return [...items].sort((a, b) => {
    const scoreDiff = getHomePostScore(b) - getHomePostScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt);
  });
};

const getAccountAgeMs = (user: any) => {
  const createdAt = user?.metadata?.creationTime ? Date.parse(user.metadata.creationTime) : 0;
  return createdAt ? Date.now() - createdAt : Number.POSITIVE_INFINITY;
};

const getTodayStartMs = () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime();
};

const getClientUsageKey = (uid: string, kind: 'comment') => {
  return `matsu-usage:${uid}:${kind}`;
};

const readClientUsage = (uid: string, kind: 'comment') => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getClientUsageKey(uid, kind));
    const values = raw ? JSON.parse(raw) : [];
    const todayStartMs = getTodayStartMs();
    return Array.isArray(values)
      ? values.map(Number).filter(value => Number.isFinite(value) && value >= todayStartMs)
      : [];
  } catch {
    return [];
  }
};

const writeClientUsage = (uid: string, kind: 'comment', values: number[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getClientUsageKey(uid, kind), JSON.stringify(values.slice(-180)));
};

const recordClientUsage = (uid: string, kind: 'comment') => {
  const values = readClientUsage(uid, kind);
  values.push(Date.now());
  writeClientUsage(uid, kind, values);
};

const getGovernanceStatusLabel = (status?: string) => {
  if (status === 'masked') return '已遮罩';
  if (status === 'pending_review') return '待站長裁決';
  if (status === 'hidden') return '已隱藏';
  if (status === 'deleted') return '已刪除';
  if (status === 'approved') return '已恢復';
  if (status === 'quarantined') return '站長查看中';
  if (status === 'removed') return '已移除';
  if (status === 'released') return '已恢復';
  if (status === 'dismissed') return '已結束';
  if (status === 'reviewed') return '已查看';
  if (status === 'downgraded') return '已轉一般處理';
  return '待處理';
};

const getSourceTypeLabel = (sourceType?: string) => {
  if (sourceType === 'post') return '貼文';
  if (sourceType === 'comment') return '留言';
  if (sourceType === 'reply') return '留言回覆';
  return '內容';
};

const getRiskLevelLabel = (riskLevel?: string) => {
  if (riskLevel === 'critical') return '需要立即留意';
  if (riskLevel === 'high') return '需要站長查看';
  if (riskLevel === 'medium') return '建議留意';
  return '一般紀錄';
};

const isTrustedPostImageUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'firebasestorage.googleapis.com'
      || parsed.hostname.endsWith('.firebasestorage.app')
      || parsed.hostname.endsWith('.appspot.com');
  } catch {
    return false;
  }
};

const getTrustedPostImageUrls = (post: Post) => {
  const urls = [
    ...(post.imageUrl ? [post.imageUrl] : []),
    ...(Array.isArray(post.imageUrls) ? post.imageUrls : []),
  ];
  return Array.from(new Set(urls)).filter(isTrustedPostImageUrl).slice(0, 1);
};

const getPostImagePaths = (post: Post) => {
  const paths = [
    ...(post.imagePath ? [post.imagePath] : []),
    ...(Array.isArray(post.imagePaths) ? post.imagePaths : []),
  ];
  return Array.from(new Set(paths.filter(Boolean))).slice(0, 1);
};

const DefaultIslanderAvatar = ({ className = "w-10 h-10" }: { className?: string }) => {
  const baseClasses = className.includes('rounded-') ? className : `${className} rounded-xl`;
  return (
    <div className={`${baseClasses} relative flex items-center justify-center overflow-hidden bg-mist border border-line group`}>
      <div className="absolute inset-0 bg-mist-dark opacity-50"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-mist/20 to-transparent"></div>
      <User className="w-1/2 h-1/2 text-text-muted relative z-10" />
      <div className="absolute bottom-1 right-1">
        <div className="w-2 h-2 rounded-full bg-mist-medium animate-pulse"></div>
      </div>
    </div>
  );
};

const AdminAvatar = ({ className = "w-10 h-10" }: { className?: string }) => {
  // Extract custom sizing/rounding if provided, otherwise default to rounded-xl
  const baseClasses = className.includes('rounded-') ? className : `${className} rounded-xl`;
  
  return (
    <div className={`${baseClasses} relative flex items-center justify-center overflow-hidden bg-mist shadow-[0_0_20px_rgba(239,68,68,0.5)] border border-line group`}>
      {/* Background Flame Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-red-600 via-orange-500 to-amber-300 opacity-80 animate-pulse"></div>
      
      {/* Dynamic Flames */}
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none opacity-60">
        <div className="w-full h-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-orange-400 via-red-600 to-transparent animate-flame blur-sm"></div>
      </div>

      {/* Secondary Flame layers */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-yellow-400 via-transparent to-transparent mix-blend-overlay animate-flicker"></div>
      
      {/* RGB Ring - kept as a subtle accent */}
      <div className="absolute inset-0 bg-[conic-gradient(from_0deg,#ff4444,#ffaa00,#ff4444)] opacity-20 animate-spin-slow"></div>
      
      {/* The Logo with Fire Glow */}
      <div className="relative z-10 w-2/3 h-2/3 flex items-center justify-center">
        <Waves className="w-full h-full text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
        <Waves className="w-full h-full text-amber-300 absolute inset-0 blur-md opacity-40 animate-pulse" />
      </div>
      
      {/* Glassy/Heat Haze overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/10 z-20"></div>
    </div>
  );
};

const UserAvatar = ({ p, className = "w-10 h-10" }: { p?: { islanderId?: string, photoURL?: string, displayName?: string, role?: string }, className?: string }) => {
  if (!p) return <div className={`${className} bg-stone-800 rounded-xl`} />;
  
  // Station master styling must only come from trusted role checks.
  if (p.role === 'admin') {
    return <AdminAvatar className={className} />;
  }

  // Handle default islander photo
  if (p.photoURL === DEFAULT_ISLANDER_PHOTO || !p.photoURL) {
    return <DefaultIslanderAvatar className={className} />;
  }
  
  return (
    <img 
      src={p.photoURL} 
      className={`${className} rounded-xl object-cover bg-stone-800 border border-white/5`}
      alt={p.displayName || 'User'}
      referrerPolicy="no-referrer"
    />
  );
};

const ReactionButton = ({
  currentReaction,
  count,
  onSelect,
  compact = false,
  reactionCollectionPath,
}: {
  currentReaction?: string | null;
  count: number;
  onSelect: (reaction: string) => void;
  compact?: boolean;
  reactionCollectionPath?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);
  const reactionIconSizeClass = compact ? 'h-6 w-6 text-sm' : 'h-7 w-7 text-base';
  const visibleReactionCounts = REACTION_OPTIONS
    .map(reaction => ({ reaction, count: reactionCounts[reaction] || 0 }))
    .filter(item => item.count > 0);

  React.useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 248;
      const menuHeight = 116;
      const left = Math.min(Math.max(rect.left + rect.width / 2 - menuWidth / 2, 12), window.innerWidth - menuWidth - 12);
      const placement = rect.top < 150 ? 'bottom' : 'top';
      setMenuPosition({
        left,
        top: placement === 'top' ? Math.max(12, rect.top - menuHeight - 8) : rect.bottom + 8,
        placement,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!reactionCollectionPath) {
      setReactionCounts({});
      return;
    }

    const unsubscribe = onSnapshot(collection(db, reactionCollectionPath), (snapshot) => {
      const nextCounts: Record<string, number> = {};
      snapshot.docs.forEach(reactionDoc => {
        const reaction = reactionDoc.data().reaction || DEFAULT_REACTION;
        if (REACTION_OPTIONS.includes(reaction)) {
          nextCounts[reaction] = (nextCounts[reaction] || 0) + 1;
        }
      });
      setReactionCounts(nextCounts);
    }, (error) => {
      console.warn('Reaction counts listener failed:', error.message);
      setReactionCounts({});
    });

    return unsubscribe;
  }, [reactionCollectionPath]);

  return (
    <div ref={rootRef} className="relative inline-flex max-w-full flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setIsOpen(previous => !previous)}
        className={`group inline-flex items-center rounded-full border border-line bg-mist/35 font-bold text-text-muted shadow-sm transition-all hover:border-bio-glow/30 hover:bg-mist-light/70 hover:text-text-main active:scale-105 ${
          compact ? 'gap-1 px-1 py-0.5 text-[0.6875rem]' : 'gap-1.5 px-1.5 py-1 text-xs'
        }`}
        title="選擇表情反應"
      >
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full border shadow-inner transition-all group-hover:-translate-y-px ${
            reactionIconSizeClass
          } ${
            currentReaction
              ? 'border-bio-glow/25 bg-bio-glow/10 text-bio-glow'
              : 'border-white/10 bg-deep-ocean/55 text-text-muted/90 group-hover:text-bio-glow'
          }`}
        >
          <span className="leading-none">
            {currentReaction || <Heart className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
          </span>
        </span>
        {!currentReaction && !compact && (
          <span className="hidden pr-1 text-[0.625rem] font-black tracking-widest text-text-muted/70 transition-colors group-hover:text-bio-glow/90 sm:inline">
            反應
          </span>
        )}
        {visibleReactionCounts.length === 0 && count > 0 && <span>{count}</span>}
      </button>

      {currentReaction && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(currentReaction);
            setIsOpen(false);
          }}
          className={`inline-flex items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 ${
            compact ? 'h-5 w-5' : 'h-6 w-6'
          }`}
          title="取消反應"
          aria-label="取消反應"
        >
          <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      )}

      {visibleReactionCounts.length > 0 && (
        <div className="flex max-w-[12rem] flex-wrap items-center gap-1">
          {visibleReactionCounts.map(item => (
            <span
              key={item.reaction}
              className={`inline-flex items-center gap-0.5 rounded-full border border-line bg-mist-light px-1.5 py-0.5 font-bold text-text-muted ${
                compact ? 'text-[0.625rem]' : 'text-[0.6875rem]'
              }`}
            >
              <span>{item.reaction}</span>
              <span>{item.count}</span>
            </span>
          ))}
        </div>
      )}

      {typeof document !== 'undefined' && createPortal((
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: menuPosition?.placement === 'bottom' ? -8 : 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: menuPosition?.placement === 'bottom' ? -8 : 8, scale: 0.96 }}
            style={{
              left: menuPosition?.left ?? 0,
              top: menuPosition?.top ?? 0,
              transformOrigin: menuPosition?.placement === 'bottom' ? 'top center' : 'bottom center',
            }}
            className="fixed z-[9998] grid w-max max-w-[calc(100vw-2rem)] grid-cols-5 gap-1.5 rounded-2xl border border-line bg-mist-medium/95 p-2.5 shadow-2xl backdrop-blur-xl"
          >
            {REACTION_OPTIONS.map(reaction => (
              <button
                key={reaction}
                type="button"
                onClick={() => {
                  onSelect(reaction);
                  setIsOpen(false);
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-all hover:bg-mist-light active:scale-90 ${
                  currentReaction === reaction ? 'bg-bio-glow/20 ring-1 ring-bio-glow/40' : ''
                }`}
                title={currentReaction === reaction ? '再點一次取消反應' : `使用 ${reaction} 反應`}
              >
                {reaction}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      ), document.body)}
    </div>
  );
};

const MentionComposerInput = ({
  value,
  onChange,
  placeholder,
  maxLength,
  className,
  multiline = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  className: string;
  multiline?: boolean;
  disabled?: boolean;
}) => {
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const updateActiveMention = (target: HTMLInputElement | HTMLTextAreaElement) => {
    setActiveRange(getActiveMentionRange(target.value, target.selectionStart));
  };

  React.useEffect(() => {
    if (!activeRange) {
      setSuggestions([]);
      return;
    }

    let isCancelled = false;
    setIsLoadingSuggestions(true);

    const searchUsers = httpsCallable(functions, 'searchMentionUsers');
    searchUsers({ query: activeRange.query })
      .then(result => {
        if (isCancelled) return;

        const users = Array.isArray((result.data as any)?.users) ? (result.data as any).users : [];
        setSuggestions(users.map(item => ({
          uid: String(item.uid || ''),
          islanderId: item.islanderId,
          displayName: item.displayName || item.islanderId || '匿名島民',
          photoURL: item.photoURL || DEFAULT_ISLANDER_PHOTO,
          role: item.role === 'admin' ? 'admin' : 'user',
        })).filter(item => item.uid));
      })
      .catch(error => {
        console.warn('Mention suggestions fetch failed:', error.message);
        if (!isCancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingSuggestions(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeRange?.query]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(event.currentTarget.value);
    updateActiveMention(event.currentTarget);
  };

  const selectSuggestion = (suggestion: MentionSuggestion) => {
    if (!activeRange) return;

    const mentionText = `@${suggestion.displayName} `;
    const nextValue = `${value.slice(0, activeRange.start)}${mentionText}${value.slice(activeRange.end)}`;
    const nextCaret = activeRange.start + mentionText.length;

    onChange(nextValue);
    setActiveRange(null);
    setSuggestions([]);

    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    }, 0);
  };

  const sharedProps = {
    value,
    placeholder,
    maxLength,
    disabled,
    className,
    onChange: handleChange,
    onKeyUp: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => updateActiveMention(event.currentTarget),
    onClick: (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => updateActiveMention(event.currentTarget),
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => updateActiveMention(event.currentTarget),
    onBlur: () => {
      window.setTimeout(() => setActiveRange(null), 180);
    },
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          {...sharedProps}
          ref={(element) => {
            inputRef.current = element;
          }}
        />
      ) : (
        <input
          type="text"
          {...sharedProps}
          ref={(element) => {
            inputRef.current = element;
          }}
        />
      )}

      <AnimatePresence>
        {activeRange && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute left-0 right-0 top-full z-[90] mt-2 overflow-hidden rounded-2xl border border-line bg-mist-medium/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="border-b border-line px-3 py-2">
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">
                {isLoadingSuggestions ? '搜尋島民中...' : '選擇標註島民'}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5">
              {suggestions.length > 0 ? (
                suggestions.map(suggestion => (
                  <button
                    key={suggestion.uid}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-mist-light transition-colors"
                  >
                    <UserAvatar
                      p={suggestion}
                      className="h-8 w-8 rounded-full border border-line"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-text-main">{suggestion.displayName}</p>
                      <p className="text-[0.625rem] font-mono text-text-muted">島民ID: {suggestion.islanderId || suggestion.uid}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-6 text-center text-xs text-text-muted">找不到符合的島民</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const { user, loading, error: authError, profile, agreeToTerms, updateProfileData, updateAvatarData } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCategory, setNewPostCategory] = useState('在地生活');
  const [isPosting, setIsPosting] = useState(false);
  const [postingMessage, setPostingMessage] = useState('');
  const [postError, setPostError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showGovernanceCenter, setShowGovernanceCenter] = useState(false);
  const [governanceRecords, setGovernanceRecords] = useState<GovernanceRecord[]>([]);
  const [isLoadingGovernanceRecords, setIsLoadingGovernanceRecords] = useState(false);
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupNameError, setSetupNameError] = useState<string | null>(null);
  const [isCheckingSetupName, setIsCheckingSetupName] = useState(false);
  const [setupPhoto, setSetupPhoto] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [sharingPost, setSharingPost] = useState<Post | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [discussionTarget, setDiscussionTarget] = useState<DiscussionTarget | null>(null);
  const [weather, setWeather] = useState<WeatherStatus | null>(null);
  const [transportStatus, setTransportStatus] = useState<{ flight: any | null; ferry: any | null }>({ flight: null, ferry: null });
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState<'flight' | 'ferry' | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
  const saved = localStorage.getItem('matsu-font-size');
  return saved ? parseInt(saved) : DEFAULT_FONT_SIZE;
});

const [onlineCount, setOnlineCount] = useState(1);
const isProfileSetupRequired = Boolean(user && profile && !profile.isProfileSetup);
const needsPolicyAcceptance = Boolean(user && profile && !hasAcceptedLatestPolicies(profile));
const isOnboarding = Boolean(user && profile && (isProfileSetupRequired || needsPolicyAcceptance));

  useEffect(() => {
    localStorage.setItem('matsu-font-size', fontSize.toString());
    document.documentElement.style.removeProperty('font-size');
    document.documentElement.style.setProperty('--matsu-user-font-scale', `${fontSize / 100}`);
  }, [fontSize]);

  const updateFontSize = (value: string) => {
    const nextFontSize = parseInt(value, 10);
    if (!Number.isNaN(nextFontSize)) setFontSize(nextFontSize);
  };

  const resetPreferences = () => {
    setActiveBackgroundMode(DEFAULT_BACKGROUND_MODE);
    setActiveAccentId(DEFAULT_ACCENT_ID);
    setFontSize(DEFAULT_FONT_SIZE);
    localStorage.removeItem('matsu-theme');
  };

  useEffect(() => {
    if (!showNotifications && !showSettingsMenu) return;

    const handleDropdownOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-dropdown-root]')) return;

      setShowNotifications(false);
      setShowSettingsMenu(false);
    };

    document.addEventListener('pointerdown', handleDropdownOutsideClick);
    return () => document.removeEventListener('pointerdown', handleDropdownOutsideClick);
  }, [showNotifications, showSettingsMenu]);

useEffect(() => {
  const base = Math.floor(posts.length / 2);
  const fluctuation = Math.floor(Math.random() * 5);

  const randomOnline = Math.max(3, base + fluctuation);

  setOnlineCount(randomOnline);
}, [posts]);

  useEffect(() => {
    const unsubscribeWeather = onSnapshot(doc(db, 'transportStatus', 'weather'), (snapshot) => {
      if (!snapshot.exists()) {
        setWeather(null);
        return;
      }

      const data = snapshot.data();
      const airport = data.airports?.nangan || data.airports?.beigan || {};
      const windDirection = data.windDirection ?? airport.windDirection;
      const directionText = data.windDirectionText || airport.windDirectionText || '不明';

      setWeather({
        temp: typeof (data.temp ?? airport.temp) === 'number' ? data.temp ?? airport.temp : null,
        icon: data.icon || airport.icon || 'Cloud',
        text: data.text || airport.text || '航空氣象',
        wind: typeof (data.windSpeedKt ?? airport.windSpeedKt) === 'number' ? data.windSpeedKt ?? airport.windSpeedKt : null,
        dir: `${directionText}${typeof windDirection === 'number' ? ` ${windDirection}°` : ''}`,
        vis: null,
        humidity: null,
        visibilityText: data.visibilityText || airport.visibilityText,
        ceilingText: data.ceilingText || airport.ceilingText,
        source: data.source,
        sourceUrl: data.sourceUrl,
        fetchedAtIso: data.fetchedAtIso,
        notice: data.notice,
        flightAllowed: typeof data.flightAllowed === 'boolean' ? data.flightAllowed : airport.flightAllowed,
        airports: data.airports,
      });
    }, (error) => {
      console.warn('Weather status listener failed:', error.message);
      setWeather(null);
    });

    return () => unsubscribeWeather();
  }, []);

  useEffect(() => {
    const unsubscribeFlight = onSnapshot(doc(db, 'transportStatus', 'flight'), (snapshot) => {
      setTransportStatus(previous => ({ ...previous, flight: snapshot.exists() ? snapshot.data() : null }));
    }, (error) => {
      console.warn('Flight status listener failed:', error.message);
      setTransportStatus(previous => ({ ...previous, flight: null }));
    });

    const unsubscribeFerry = onSnapshot(doc(db, 'transportStatus', 'ferry'), (snapshot) => {
      setTransportStatus(previous => ({ ...previous, ferry: snapshot.exists() ? snapshot.data() : null }));
    }, (error) => {
      console.warn('Ferry status listener failed:', error.message);
      setTransportStatus(previous => ({ ...previous, ferry: null }));
    });

    return () => {
      unsubscribeFlight();
      unsubscribeFerry();
    };
  }, []);

  const getNotificationDeletedLabel = async (notification: any) => {
    if (!notification.postId) return null;

    const postSnap = await getDoc(doc(db, 'posts', notification.postId));
    if (!postSnap.exists()) return '該文章已被刪除';

    if (notification.commentId) {
      const commentSnap = await getDoc(doc(db, 'posts', notification.postId, 'comments', notification.commentId));
      if (!commentSnap.exists()) return '該留言已被刪除';

      if (notification.replyId) {
        const replySnap = await getDoc(doc(db, 'posts', notification.postId, 'comments', notification.commentId, 'replies', notification.replyId));
        if (!replySnap.exists()) return '該留言已被刪除';
      }
    }

    return null;
  };

  // Notifications Listener
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'), 
      where('recipientId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const nextNotifications = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(isFrontNotification)
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      const enrichedNotifications = await Promise.all(
        nextNotifications.map(async notification => ({
          ...notification,
          deletedLabel: await getNotificationDeletedLabel(notification),
        }))
      );

      setNotifications(enrichedNotifications);
    }, (error) => {
      console.warn('Notifications listener failed:', error.message);
    });
    return () => unsubscribe();
  }, [user]);

  const [isCopiedState, setIsCopiedState] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const avatarUpdateInputRef = React.useRef<HTMLInputElement>(null);
  const termsScrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTerms) {
      setHasReadToBottom(false);
      setSetupName(profile?.displayName || '');
      setSetupPhoto(profile?.photoURL || '');
    }
  }, [showTerms, profile]);
  const [activeBackgroundMode, setActiveBackgroundMode] = useState(() => {
    const savedMode = localStorage.getItem('matsu-theme-mode');
    if (savedMode === 'light' || savedMode === 'dark') return savedMode;
    const legacyTheme = localStorage.getItem('matsu-theme');
    return legacyTheme && LEGACY_LIGHT_THEMES.has(legacyTheme) ? 'light' : 'dark';
  });
  const [activeAccentId, setActiveAccentId] = useState(() => {
    const savedAccent = localStorage.getItem('matsu-theme-accent');
    if (savedAccent) return savedAccent;
    const legacyTheme = localStorage.getItem('matsu-theme');
    return legacyTheme ? (LEGACY_ACCENT_MAP[legacyTheme] || legacyTheme) : 'bio-glow';
  });
  
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const topicCounts: Record<string, number> = {};

posts.forEach((post) => {
  const category = normalizeCategoryName(post.category) || '未分類';

  if (!topicCounts[category]) {
    topicCounts[category] = 0;
  }

  topicCounts[category]++;
});

const LOCAL_TOPIC_SHORTCUTS = Array.from(new Set(
  posts
    .map(post => normalizeCategoryName(post.category) || normalizeCategoryName(post.aiTag))
    .filter((label): label is string => Boolean(label))
))
  .slice(0, 5)
  .map(label => ({
    label,
    count: topicCounts[label] || 0,
  }));

  useEffect(() => {
    const accent = ACCENT_COLORS.find(t => t.id === activeAccentId) || ACCENT_COLORS[0];
    const mode = activeBackgroundMode === 'light' ? 'light' : 'dark';
    document.documentElement.style.setProperty('--primary-glow', accent.color);
    document.documentElement.style.setProperty('--accent-text', mode === 'light' ? accent.lightTextColor : accent.color);
    document.documentElement.setAttribute('data-theme-mode', mode);
    localStorage.setItem('matsu-theme-mode', mode);
    localStorage.setItem('matsu-theme-accent', accent.id);
  }, [activeAccentId, activeBackgroundMode]);
  
  // Track screen size for responsive sidebar
  React.useEffect(() => {
    const checkSize = () => {
      setIsDesktop(window.innerWidth >= 768);
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);
  
  // Profile Modal State
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTabId>('posts');
  const [profileLikedPosts, setProfileLikedPosts] = useState<Post[]>([]);
  const [profileStats, setProfileStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [isLoadingProfileActivity, setIsLoadingProfileActivity] = useState(false);
  const [friendActionMessage, setFriendActionMessage] = useState<string | null>(null);
  const [isFollowingProfile, setIsFollowingProfile] = useState(false);
  const [hasPendingFollowRequest, setHasPendingFollowRequest] = useState(false);
  const [followRequests, setFollowRequests] = useState<FollowRequestItem[]>([]);
  const [socialListModal, setSocialListModal] = useState<{ type: 'following' | 'followers'; title: string; items: RelationshipListItem[] } | null>(null);
  const [isLoadingSocialList, setIsLoadingSocialList] = useState(false);
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [isCheckingEditName, setIsCheckingEditName] = useState(false);
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const CATEGORIES = [
    { id: 'all', name: '全部', icon: <Waves className="w-4 h-4" /> },
    { id: 'chat', name: '閒聊', icon: '💬' },
    { id: 'tears', name: '藍眼淚', icon: '💧' },
    { id: 'life', name: '在地生活', icon: '🏠' },
    { id: 'politics', name: '政治論壇', icon: '⚖️' },
    { id: 'ghost', name: '馬祖鬼故事', icon: '👻' },
    { id: 'scenery', name: '美景分享', icon: '📸' },
    { id: 'wildlife', name: '野生動物', icon: '🦌' },
    { id: 'ufo', name: '馬祖UFO', icon: '🛸' },
  ];

  const POST_TAGS = CATEGORIES.filter(cat => cat.id !== 'all');

  // Check if logged in user needs to agree to the latest policies or setup profile.
  React.useEffect(() => {
    if (user && profile && (!profile.isProfileSetup || !hasAcceptedLatestPolicies(profile))) {
      setShowTerms(true);
    } else {
      setShowTerms(false);
    }
  }, [user, profile]);

  // Fetch posts
  React.useEffect(() => {
    if (!db) return; // Prevent crash if firebase not init
    const postsPath = 'posts';
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        setPosts(postsData);
      }, (error) => {
        // Log but don't hard crash to avoid white screen
        console.error('Posts fetch error:', error);
      });
      return unsubscribe;
    } catch (error) {
      console.error('Posts effect error:', error);
    }
  }, []);

  const handleLogin = async () => {
    try {
      if (!auth.app.options.apiKey || auth.app.options.apiKey === "YOUR_API_KEY") {
        throw new Error("FIREBASE_NOT_CONFIGURED");
      }
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login failed', error);
      if (error.message === "FIREBASE_NOT_CONFIGURED") {
        alert("小站服務尚未完成設定。請聯繫站長協助。");
      } else {
        alert(getLoginErrorMessage(error));
      }
    }
  };

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 10) {
      setHasReadToBottom(true);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (!AVATAR_IMAGE_ALLOWED_TYPES.includes(file.type)) {
      alert('頭像格式目前只支援 JPG、PNG、WebP。');
      return;
    }
    if (file.size > AVATAR_IMAGE_MAX_BYTES) {
      alert('頭像圖片請選擇 5MB 以下的檔案。');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const options = {
        maxSizeMB: 0.2, // Small for avatar
        maxWidthOrHeight: 400,
        useWebWorker: true,
      };
      const compressedFile = await compressImageFile(file, options);
      const fileRef = ref(storage, `avatars/${user.uid}/${Date.now()}_avatar.jpg`);
      const snapshot = await uploadBytes(fileRef, compressedFile);
      const url = await getDownloadURL(snapshot.ref);
      setSetupPhoto(url);
    } catch (error) {
      console.error('Avatar upload failed', error);
      alert('頭像上傳失敗');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const BANNED_WORDS = [
    '幹', '操', '靠', '死', '爛', '垃圾', '混蛋', '畜生', '智障', '白痴', '腦殘',
    '習近平', '近平', '共產', '獨裁', '政治', '淫', '妓', '色'
  ];

  const ALLOWED_PHRASES = ['幹嘛', '幹什麼', '苦幹', '幹練'];

  const checkNameAvailability = async (name: string, currentUid?: string) => {
    if (!name.trim()) return null;

    if (name.trim().length < 2) return '暱稱太短了 (最少 2 個字)';
    if (name.trim().length > 12) return '暱稱太長了 (最多 12 個字)';
    
    const nameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
    if (!nameRegex.test(name)) {
      return '暱稱只能包含中英文、數字及底線 (_)';
    }

    // Advanced Profanity check: skip allowed phrases
    const upperName = name.trim().toUpperCase();
    let checkName = upperName;
    
    // Temporarily mask allowed phrases to avoid blocking them
    ALLOWED_PHRASES.forEach(phrase => {
      checkName = checkName.replace(new RegExp(phrase, 'g'), '🛡️');
    });

    if (BANNED_WORDS.some(word => checkName.includes(word))) {
      return '暱稱包含不雅或敏感字詞，請更換';
    }

    try {
      const checkDisplayName = httpsCallable(functions, 'checkDisplayNameAvailability');
      const result = await checkDisplayName({ displayName: name.trim(), currentUid });
      const isAvailable = Boolean((result.data as any)?.available);
      if (!isAvailable) {
        return '此暱稱已被其他島民使用了';
      }
      return null;
    } catch (err) {
      console.error('Check name failed', err);
      return null;
    }
  };

  useEffect(() => {
    if (!setupName.trim()) {
      setSetupNameError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingSetupName(true);
      const error = await checkNameAvailability(setupName, user?.uid);
      setSetupNameError(error);
      setIsCheckingSetupName(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [setupName, user]);

  useEffect(() => {
    if (!editDisplayName.trim()) {
      setEditNameError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingEditName(true);
      const error = await checkNameAvailability(editDisplayName, user?.uid);
      setEditNameError(error);
      setIsCheckingEditName(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [editDisplayName, user]);

  const handleAgree = async () => {
    const missingItems = [];
    if (!hasReadToBottom) missingItems.push('閱讀完畢服務條款、隱私權政策、社群規範與檢舉審核說明 (請滑動到底部)');
    if (isProfileSetupRequired && !setupName.trim()) missingItems.push('設定您的島民暱稱');
    if (isProfileSetupRequired && setupNameError) missingItems.push(setupNameError);

    if (isProfileSetupRequired && !setupPhoto) missingItems.push('上傳您的個人頭像');
    // Removed requirement to change from default since we have a specific default islander logo now

    if (missingItems.length > 0) {
      alert('您還沒完成以下設定，無法進入島嶼：\n\n' + missingItems.map((item, i) => `${i + 1}. ${item}`).join('\n'));
      return;
    }

    try {
      await agreeToTerms({
        displayName: isProfileSetupRequired ? setupName : profile?.displayName || user?.displayName || undefined,
        photoURL: isProfileSetupRequired ? setupPhoto : profile?.photoURL || undefined,
      });
      setShowTerms(false);
    } catch (err) {
      console.error('Agree terms failed', err);
      alert('發生錯誤，請重新整理頁面再試。');
    }
  };

  const openGovernanceCenter = async () => {
    if (!user) {
      alert('請先登入後再查看站務紀錄。');
      return;
    }

    setShowGovernanceCenter(true);
    setShowSettingsMenu(false);
    setIsLoadingGovernanceRecords(true);

    try {
      const recordsQuery = query(
        collection(db, 'moderationCases'),
        where('authorId', '==', user.uid)
      );
      const snapshot = await getDocs(recordsQuery);
      const records = snapshot.docs
        .map(recordDoc => ({ id: recordDoc.id, ...recordDoc.data() } as GovernanceRecord))
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      setGovernanceRecords(records);
    } catch (err: any) {
      console.error('Load governance records failed:', err);
      alert('站務紀錄讀取失敗，請稍後再試。');
    } finally {
      setIsLoadingGovernanceRecords(false);
    }
  };

  const handleOpenProfile = async (userId: string, options?: { edit?: boolean; tab?: ProfileTabId }) => {
    if (!user) {
      alert("請先登入後再查看個人檔案。");
      return;
    }

    setProfileTab(options?.tab || 'posts');
    setFriendActionMessage(null);
    setHasPendingFollowRequest(false);
    setFollowRequests([]);
    setSocialListModal(null);

    if (user && userId === user.uid && profile) {
      setViewingProfile(profile);
      setEditBio(profile.bio || '');
      setEditTitle(profile.title || '');
      setEditDisplayName(profile.displayName || '');
      setEditPhotoURL(profile.photoURL || '');
      setIsEditingProfile(Boolean(options?.edit));
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setViewingProfile({ id: snap.id, ...snap.data() } as any);
        setIsEditingProfile(false);
      } else {
        alert("此使用者的檔案尚未初始化。");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('offline')) {
        alert("連線失敗：目前無法讀取小站資料，請稍後再試。");
      } else {
        alert("無法讀取個人檔案，請稍後再試。");
      }
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (editNameError) {
      alert(editNameError);
      return;
    }

    // Check 3 months limitation
    if (profile.lastProfileUpdate) {
      const lastUpdate = profile.lastProfileUpdate.toDate();
      const nextUpdateAllowed = addMonths(lastUpdate, 3);
      if (isAfter(nextUpdateAllowed, new Date())) {
        const remaining = formatDistanceToNow(nextUpdateAllowed, { locale: zhTW });
        alert(`島嶼規範：暱稱、個人標籤與簡介每 3 個月只能修改一次。您還需要等待 ${remaining}。`);
        return;
      }
    }

    setIsUpdatingProfile(true);
    try {
      await updateProfileData({ 
        bio: editBio, 
        title: editTitle,
        displayName: editDisplayName,
        photoURL: editPhotoURL
      });
      setIsEditingProfile(false);
      setViewingProfile(prev => prev ? { 
        ...prev, 
        bio: editBio, 
        title: editTitle, 
        displayName: editDisplayName,
        photoURL: editPhotoURL,
        lastProfileUpdate: { toDate: () => new Date() } 
      } : null);
      alert("個人檔案已更新！");
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  React.useEffect(() => {
    if (!viewingProfile?.uid) {
      setProfileLikedPosts([]);
      setProfileStats(EMPTY_PROFILE_STATS);
      setIsFollowingProfile(false);
      setHasPendingFollowRequest(false);
      setFollowRequests([]);
      setSocialListModal(null);
      return;
    }

    let isCancelled = false;
    const targetUid = viewingProfile.uid;
    const authoredPosts = posts.filter(post => post.authorId === targetUid);

    setProfileStats(previous => ({
      ...previous,
      postCount: authoredPosts.length,
    }));
    setIsLoadingProfileActivity(true);

    const loadProfileActivity = async () => {
      try {
        const likedPostResults = await Promise.all(
          posts.map(async post => {
            if (post.id.startsWith('sample-')) return null;
            const likeSnap = await getDoc(doc(db, 'posts', post.id, 'likes', targetUid));
            return likeSnap.exists() ? post : null;
          })
        );

        const [followingSnap, followersSnap] = await Promise.all([
          getDocs(collection(db, 'users', targetUid, 'following')),
          getDocs(collection(db, 'users', targetUid, 'followers')),
        ]);

        const [currentFollowingSnap, pendingFollowRequestSnap] = user && user.uid !== targetUid
          ? await Promise.all([
              getDoc(doc(db, 'users', user.uid, 'following', targetUid)),
              getDoc(doc(db, 'users', targetUid, 'followRequests', user.uid)),
            ])
          : [null, null];

        const ownFollowRequestsSnap = user && user.uid === targetUid
          ? await getDocs(collection(db, 'users', targetUid, 'followRequests'))
          : null;

        if (isCancelled) return;

        setProfileLikedPosts(likedPostResults.filter(Boolean) as Post[]);
        setProfileStats({
          postCount: authoredPosts.length,
          followingCount: followingSnap.size,
          followerCount: followersSnap.size,
        });
        setIsFollowingProfile(Boolean(currentFollowingSnap?.exists()));
        setHasPendingFollowRequest(Boolean(pendingFollowRequestSnap?.exists()));
        setFollowRequests((ownFollowRequestsSnap?.docs || []).map(requestDoc => {
          const data = requestDoc.data();
          return {
            uid: data.requesterId || requestDoc.id,
            requesterId: data.requesterId || requestDoc.id,
            islanderId: data.islanderId,
            displayName: data.displayName || data.islanderId || '匿名島民',
            photoURL: data.photoURL || DEFAULT_ISLANDER_PHOTO,
            createdAt: data.createdAt,
          } as FollowRequestItem;
        }));
      } catch (err) {
        console.warn('Profile activity fetch failed:', err);
        if (!isCancelled) {
          setProfileLikedPosts([]);
          setProfileStats(previous => ({
            ...previous,
            postCount: authoredPosts.length,
          }));
        }
      } finally {
        if (!isCancelled) setIsLoadingProfileActivity(false);
      }
    };

    loadProfileActivity();

    return () => {
      isCancelled = true;
    };
  }, [viewingProfile?.uid, posts, user?.uid]);

  const handleToggleFollow = async () => {
    if (!user || !profile || !viewingProfile || viewingProfile.uid === user.uid) {
      return;
    }

    setIsSavingRelationship(true);
    setFriendActionMessage(null);

    const followingRef = doc(db, 'users', user.uid, 'following', viewingProfile.uid);
    const followerRef = doc(db, 'users', viewingProfile.uid, 'followers', user.uid);
    const followRequestRef = doc(db, 'users', viewingProfile.uid, 'followRequests', user.uid);

    try {
      if (isFollowingProfile) {
        await deleteDoc(followingRef);
        await deleteDoc(followerRef);
        setIsFollowingProfile(false);
        setProfileStats(previous => ({
          ...previous,
          followerCount: Math.max(0, previous.followerCount - 1),
        }));
        setFriendActionMessage('已取消追蹤。');
      } else if (hasPendingFollowRequest) {
        await deleteDoc(followRequestRef);
        setHasPendingFollowRequest(false);
        setFriendActionMessage('已取消追蹤申請。');
      } else {
        await setDoc(followRequestRef, {
          requesterId: user.uid,
          islanderId: profile.islanderId,
          displayName: profile.displayName || profile.islanderId,
          photoURL: profile.photoURL || DEFAULT_ISLANDER_PHOTO,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        setHasPendingFollowRequest(true);
        setFriendActionMessage('追蹤申請已送出，等待對方同意。');
        try {
          await submitUserNotification({
            recipientId: viewingProfile.uid,
            type: 'follow_request',
            title: '收到新的追蹤申請',
            content: `${profile.displayName || profile.islanderId || '匿名島民'} 想追蹤你的個人主頁。`,
          });
        } catch (notificationErr) {
          console.warn('Follow request notification failed:', notificationErr);
        }
      }
    } catch (err: any) {
      console.error('Follow failed:', err);
      setFriendActionMessage(err.message?.includes('permission-denied') ? '追蹤申請失敗，功能權限尚未開放。' : '追蹤申請失敗，請稍後再試。');
    } finally {
      setIsSavingRelationship(false);
    }
  };

  const handleFollowRequestAction = async (request: FollowRequestItem, action: 'approve' | 'reject') => {
    if (!user || !profile) return;

    setIsSavingRelationship(true);
    setFriendActionMessage(null);

    const requestRef = doc(db, 'users', user.uid, 'followRequests', request.requesterId);

    try {
      if (action === 'approve') {
        await setDoc(doc(db, 'users', request.requesterId, 'following', user.uid), {
          targetUserId: user.uid,
          islanderId: profile.islanderId,
          displayName: profile.displayName || profile.islanderId,
          photoURL: profile.photoURL || DEFAULT_ISLANDER_PHOTO,
          createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'users', user.uid, 'followers', request.requesterId), {
          followerId: request.requesterId,
          islanderId: request.islanderId,
          displayName: request.displayName,
          photoURL: request.photoURL || DEFAULT_ISLANDER_PHOTO,
          createdAt: serverTimestamp(),
        });
        setProfileStats(previous => ({
          ...previous,
          followerCount: previous.followerCount + 1,
        }));
        setFriendActionMessage(`已同意 ${request.displayName} 的追蹤申請。`);
      } else {
        setFriendActionMessage(`已婉拒 ${request.displayName} 的追蹤申請。`);
      }

      await deleteDoc(requestRef);
      setFollowRequests(previous => previous.filter(item => item.requesterId !== request.requesterId));
    } catch (err: any) {
      console.error('Follow request action failed:', err);
      setFriendActionMessage(err.message?.includes('permission-denied') ? '處理追蹤申請失敗，功能權限尚未開放。' : '處理追蹤申請失敗，請稍後再試。');
    } finally {
      setIsSavingRelationship(false);
    }
  };

  const handleOpenSocialList = async (type: 'following' | 'followers') => {
    if (!user || !viewingProfile?.uid) return;

    const canViewSocialList = user.uid === viewingProfile.uid || isFollowingProfile;
    if (!canViewSocialList) {
      setFriendActionMessage('追蹤通過後，才能查看這位島民的追蹤中與追蹤者名單。');
      return;
    }

    const title = type === 'following' ? '追蹤中' : '追蹤者';
    setSocialListModal({ type, title, items: [] });
    setIsLoadingSocialList(true);
    setFriendActionMessage(null);

    try {
      const snapshot = await getDocs(collection(db, 'users', viewingProfile.uid, type));
      const items = snapshot.docs.map(itemDoc => {
        const data = itemDoc.data();
        const uid = type === 'following'
          ? data.targetUserId || itemDoc.id
          : data.followerId || itemDoc.id;

        return {
          uid,
          islanderId: data.islanderId,
          displayName: data.displayName || data.islanderId || '匿名島民',
          photoURL: data.photoURL || DEFAULT_ISLANDER_PHOTO,
        } as RelationshipListItem;
      });

      setSocialListModal({ type, title, items });
    } catch (err: any) {
      console.error('Open social list failed:', err);
      setSocialListModal({ type, title, items: [] });
      setFriendActionMessage(err.message?.includes('permission-denied') ? '目前無法查看這份名單。' : '讀取名單失敗，請稍後再試。');
    } finally {
      setIsLoadingSocialList(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowSettingsMenu(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      const batch = unreadNotifications.map(n => 
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      );
      await Promise.all(batch);
    } catch (err) {
      console.error('Mark all as read error:', err);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    try {
      await updateDoc(doc(db, 'notifications', notification.id), { read: true });
    } catch (err) {
      console.warn('Mark notification read failed:', err);
    }

    setShowNotifications(false);

    if (notification.type === 'follow_request' && user) {
      await handleOpenProfile(user.uid);
      return;
    }

    if (notification.postId) {
      const deletedLabel = notification.deletedLabel || await getNotificationDeletedLabel(notification);
      if (deletedLabel) {
        setNotifications(previous => previous.map(item => (
          item.id === notification.id ? { ...item, read: true, deletedLabel } : item
        )));
        return;
      }

      setActiveCategory('全部');
      setSearchQuery('');
      setDiscussionTarget({
        postId: notification.postId,
        commentId: notification.commentId,
        replyId: notification.replyId,
        openComments: Boolean(notification.commentId || notification.replyId || notification.type === 'comment'),
        nonce: Date.now(),
      });
    } else if (notification.category) {
      setActiveCategory(notification.category);
      setSearchQuery('');
    }
  };

  const handleUpdateAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (!AVATAR_IMAGE_ALLOWED_TYPES.includes(file.type)) {
      alert('頭像格式目前只支援 JPG、PNG、WebP。');
      return;
    }
    if (file.size > AVATAR_IMAGE_MAX_BYTES) {
      alert('頭像圖片請選擇 5MB 以下的檔案。');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 400,
        useWebWorker: true,
      };
      const compressedFile = await compressImageFile(file, options);
      const fileRef = ref(storage, `avatars/${user.uid}/${Date.now()}_avatar.jpg`);
      const snapshot = await uploadBytes(fileRef, compressedFile);
      const url = await getDownloadURL(snapshot.ref);
      setEditPhotoURL(url);
      await updateAvatarData(url);
      setViewingProfile(prev => prev ? { ...prev, photoURL: url } : prev);
      alert('大頭照已更新。');
    } catch (error) {
      console.error('Avatar upload failed', error);
      alert('頭像上傳失敗');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length + selectedImages.length > 1) {
      alert('島嶼規範：每篇貼文只能上傳 1 張圖片。');
      return;
    }
    const invalidFile = files.find(file => !POST_IMAGE_ALLOWED_TYPES.includes(file.type));
    if (invalidFile) {
      alert('圖片格式目前只支援 JPG、PNG、WebP。');
      return;
    }
    const oversizedFile = files.find(file => file.size > POST_IMAGE_MAX_BYTES);
    if (oversizedFile) {
      alert('圖片大小需小於 10MB。');
      return;
    }

    setIsCompressing(true);
    const options = {
      maxSizeMB: 3,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };

    try {
      const newFiles = [...selectedImages];
      const newPreviews = [...imagePreviews];

      for (const file of files) {
        // Compress the image
        const compressedFile = await compressImageFile(file, options);
        
        newFiles.push(compressedFile);
        
        const reader = new FileReader();
        const previewPromise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressedFile);
        });
        
        const previewUrl = await previewPromise;
        newPreviews.push(previewUrl);
      }

      setSelectedImages(newFiles);
      setImagePreviews(newPreviews);
    } catch (error) {
      console.error('Compression error:', error);
      alert('圖片處理失敗，請再試一次。');
    } finally {
      setIsCompressing(false);
    }
  };

  const removeImage = (index: number) => {
    const newFiles = [...selectedImages];
    const newPreviews = [...imagePreviews];
    newFiles.splice(index, 1);
    newPreviews.splice(index, 1);
    setSelectedImages(newFiles);
    setImagePreviews(newPreviews);
  };

  const getPostRateLimitMessage = () => {
    if (!user) return null;
    if (user.uid === STATION_MASTER_UID) return null;

    const now = Date.now();
    const userPosts = posts.filter(post => post.authorId === user.uid);
    const latestPostTime = Math.max(0, ...userPosts.map(post => getTimestampMillis(post.createdAt)));

    if (latestPostTime && now - latestPostTime < POST_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((POST_COOLDOWN_MS - (now - latestPostTime)) / 1000);
      return `${ANTI_ABUSE_NOTICE} 請再等 ${secondsLeft} 秒後再發文。`;
    }

    const todayPostCount = userPosts.filter(post => getTimestampMillis(post.createdAt) >= getTodayStartMs()).length;
    if (todayPostCount >= DAILY_POST_LIMIT) {
      return `${ANTI_ABUSE_NOTICE} 每個帳號一天最多 ${DAILY_POST_LIMIT} 篇，請明天再發。`;
    }

    const accountAgeMs = getAccountAgeMs(user);
    if (accountAgeMs < NEW_ACCOUNT_WINDOW_MS && userPosts.length > 0) {
      const minutesLeft = Math.ceil((NEW_ACCOUNT_WINDOW_MS - accountAgeMs) / 60000);
      return `${ANTI_ABUSE_NOTICE} 新帳號前 30 分鐘只能先發一篇，請再等約 ${minutesLeft} 分鐘。`;
    }

    return null;
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!newPostContent.trim() && selectedImages.length === 0) || isPosting) return;
    if (!hasAcceptedLatestPolicies(profile)) {
      setShowTerms(true);
      setPostError('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能發布內容。');
      return;
    }

    setIsPosting(true);
    setPostError(null);
    setPostingMessage('正在發布到馬祖小站...');
    setUploadProgress(8);

    try {
      const rawContent = newPostContent.trim();
      const contentLength = countChars(rawContent);

      if (contentLength > POST_CHAR_LIMIT) {
        setPostError(`發文最多 ${POST_CHAR_LIMIT} 字，請縮短內容後再發。${ANTI_ABUSE_NOTICE}`);
        setIsPosting(false);
        setUploadProgress(0);
        setPostingMessage('');
        return;
      }

      const rateLimitMessage = getPostRateLimitMessage();
      if (rateLimitMessage) {
        setPostError(rateLimitMessage);
        setIsPosting(false);
        setUploadProgress(0);
        setPostingMessage('');
        return;
      }

      setPostingMessage(selectedImages.length > 0 ? '正在上傳圖片...' : '正在發布到馬祖小站...');
      setUploadProgress(25);

      // 1) 上傳圖片
      const uploadedImages: Array<{ url: string; path: string }> = [];
      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i];
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileRef = ref(storage, `posts/${user.uid}/${Date.now()}_${safeFileName}`);
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedImages.push({ url, path: snapshot.ref.fullPath });
        setUploadProgress(25 + ((i + 1) / selectedImages.length) * 45);
      }
      const uploadedUrls = uploadedImages.map(image => image.url);
      const uploadedPaths = uploadedImages.map(image => image.path);

      setPostingMessage('正在發布到馬祖小站...');
      setUploadProgress(82);

      // 2) 由伺服器建立內容；明顯高風險會先進入站務審核，不直接公開原文。
      const cleanContent = prepareUserContent(rawContent);
      const senderName = profile?.displayName || user.displayName || '匿名島民';
      const postCategory = newPostCategory;
      const createdPost = await submitCommunityContent({
        sourceType: 'post',
        content: cleanContent,
        category: postCategory,
        imageUrl: uploadedUrls[0] || '',
        imagePath: uploadedPaths[0] || '',
        imageUrls: uploadedUrls,
        imagePaths: uploadedPaths,
      });

      if (createdPost.status === 'normal' && createdPost.id) {
        try {
          await sendMentionNotifications({
            text: cleanContent,
            senderId: user.uid,
            senderName,
            postId: createdPost.id,
            category: postCategory,
            sourceLabel: '貼文中',
          });
        } catch (mentionErr) {
          console.warn('Post mention notification failed:', mentionErr);
        }
      }

      setUploadProgress(100);
      setPostingMessage(createdPost.protected ? '已送出，內容先交由站務審核。' : '發布成功！');

      setTimeout(() => {
        setNewPostContent('');
        setNewPostCategory('在地生活');
        setSelectedImages([]);
        setImagePreviews([]);
        setIsPosting(false);
        setUploadProgress(0);
        setPostingMessage('');
        setPostError(null);
      }, 500);
    } catch (error: any) {
      console.error('Failed to post', error);
      setPostError(getSubmissionErrorMessage(error, '發文失敗，請稍後再試。'));
      setIsPosting(false);
      setUploadProgress(0);
      setPostingMessage('');
    }
  };

  const handleShare = async (post: Post) => {
    const shareUrl = `${window.location.origin}?post=${post.id}`;
    const shareData = {
      title: '馬祖小站',
      text: post.content.substring(0, 100) + '...',
      url: shareUrl,
    };

    // Check if it's mobile and navigator.share is available
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed', err);
          // If native share failed for some reason, fallback to modal
          setSharingPost(post);
        }
      }
    } else {
      // PC or non-supporting mobile browsers: Show custom menu
      setSharingPost(post);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      alert('複製失敗，請手動複製網址。');
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const postMatchesSearch = (post: Post) => {
    if (!normalizedSearchQuery) return true;
    return [
      post.content,
      post.authorName,
      post.category,
      post.aiTag,
      post.aiSummary,
    ].some(value => String(value || '').toLowerCase().includes(normalizedSearchQuery));
  };
  const searchResultCount = normalizedSearchQuery ? posts.filter(postMatchesSearch).length : posts.length;

  const filteredPosts = posts
    .filter(post => {
      const matchesSearch = postMatchesSearch(post);
      const matchesCategory = postMatchesCategory(post, activeCategory);
      return matchesSearch && matchesCategory;
    });
  const visibleFeedPosts = sortPostsForHome(filteredPosts);
  const searchCategoryShortcuts = POST_TAGS.slice(0, 8);
  const searchPreviewPosts = normalizedSearchQuery ? posts.filter(postMatchesSearch).slice(0, 3) : [];
  const viewingProfilePosts = viewingProfile ? posts.filter(post => post.authorId === viewingProfile.uid) : [];
  const visibleProfilePosts = profileTab === 'posts' ? viewingProfilePosts : profileLikedPosts;
  const isViewingOwnProfile = Boolean(user && viewingProfile && user.uid === viewingProfile.uid);
  const canViewProfileSocialLists = Boolean(viewingProfile && (isViewingOwnProfile || isFollowingProfile));
  const isViewingStationMaster = viewingProfile?.uid === STATION_MASTER_UID;
  const accountRestrictionNotice = getAccountRestrictionNotice(profile);
  const flightStatus = transportStatus.flight;
  const ferryStatus = transportStatus.ferry;
  const formatTransportUpdatedAt = (value: any) => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.getTime())) return '尚未更新';
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  };
  const formatWeatherUpdatedAt = (value?: string, mode: 'short' | 'full' = 'short') => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '尚未更新';
    return mode === 'full'
      ? date.toLocaleString('zh-TW', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  };
  const getAirportSummaryText = (airport: any) => {
    const summary = airport?.summary || {};
    const parts = [
      `共 ${summary.total || 0} 筆`,
      summary.onTime ? `準時 ${summary.onTime}` : '',
      summary.cancelled ? `取消 ${summary.cancelled}` : '',
      summary.closed ? `關閉 ${summary.closed}` : '',
      summary.other ? `其他 ${summary.other}` : '',
    ].filter(Boolean);
    return parts.join(' / ');
  };
  const getFlightRows = (airport: any) => Array.isArray(airport?.rows) ? airport.rows.slice(0, 8) : [];
  const getFlightRowsByDirection = (airport: any, direction: 'departure' | 'arrival') => {
    const directRows = direction === 'departure' ? airport?.departureRows : airport?.arrivalRows;
    if (Array.isArray(directRows)) return directRows.slice(0, 10);
    return getFlightRows(airport).filter((row: any) => row.direction === direction).slice(0, 10);
  };
  const getFerryScheduleRows = () => Array.isArray(ferryStatus?.rows) ? ferryStatus.rows.slice(0, 80) : [];
  const getFerryQueryRangeText = () => {
    const rows = getFerryScheduleRows();
    const dates = rows
      .flatMap((row: any) => [row.departureDate, row.arrivalDate])
      .filter(Boolean)
      .sort();
    if (!dates.length) return '尚未取得查詢區間';
    return `查詢條件：${dates[0]} ~ ${dates[dates.length - 1]}`;
  };
  const getFerrySummaryText = () => {
    const summary = ferryStatus?.summary || {};
    const parts = [
      `共 ${summary.total || 0} 筆`,
      summary.today ? `今日 ${summary.today}` : '',
      summary.keelungMatsu ? `基隆馬祖 ${summary.keelungMatsu}` : '',
      summary.dongyin ? `含東引 ${summary.dongyin}` : '',
    ].filter(Boolean);
    return parts.join(' / ');
  };
  const ferryScheduleRows = getFerryScheduleRows();
  const activePolicyPage = getPolicyPageByPath(window.location.pathname);

  if (activePolicyPage) {
    return <PolicyStandalonePage page={activePolicyPage} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-deep-ocean flex flex-col items-center justify-center gap-6 p-4">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Waves className="w-12 h-12 text-bio-glow glow-text" />
        </motion.div>
        
        <div className="text-center space-y-4 max-w-xs transition-all">
          {authError ? (
            <div className="space-y-4">
              <p className="text-rose-400 text-sm font-bold uppercase tracking-wider">連線發生異常</p>
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl">
                <p className="text-[0.625rem] text-rose-300 leading-relaxed font-mono opacity-80 break-words">
                  {authError.message}
                </p>
              </div>
              {authError.message.includes('offline') && (
                <div className="space-y-2 mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <p className="text-[0.625rem] text-amber-400 font-bold uppercase">連線疑難排解</p>
                  <p className="text-[0.625rem] text-amber-200/70 leading-relaxed text-left">
                    目前小站服務暫時無法連線。請稍後再試，或透過官方 LINE 回報站長。
                  </p>
                </div>
              )}
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-white/5 text-text-main py-3 rounded-xl text-xs font-bold hover:bg-white/10 transition-all border border-white/10"
              >
                重試連線
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-text-muted text-xs font-bold uppercase tracking-widest animate-pulse">正在與群島同步...</p>
              <p className="text-[0.5625rem] text-text-muted opacity-60 leading-relaxed">如果這花費太長時間，可能是網路不穩定或小站服務暫時忙碌。</p>
              <button 
                onClick={() => window.location.reload()}
                className="text-[0.625rem] text-bio-glow/50 hover:text-bio-glow underline underline-offset-4"
              >
                點此重新整理頁面
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep-ocean text-text-main font-sans">
      {accountRestrictionNotice && (
        <div className={`fixed left-3 right-3 top-3 z-[120] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl sm:left-1/2 sm:right-auto sm:w-[min(560px,calc(100vw-2rem))] sm:-translate-x-1/2 ${
          accountRestrictionNotice.tone === 'danger'
            ? 'border-rose-500/30 bg-rose-950/85'
            : accountRestrictionNotice.tone === 'warning'
              ? 'border-amber-500/30 bg-amber-950/85'
              : 'border-sky-500/30 bg-sky-950/85'
        }`}>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 flex-none text-bio-glow" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-main">{accountRestrictionNotice.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-main/75">{accountRestrictionNotice.body}</p>
            </div>
            {accountRestrictionNotice.tone === 'danger' && (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-text-main transition-colors hover:bg-white/10"
              >
                登出
              </button>
            )}
          </div>
        </div>
      )}
      {/* Terms Overlay */}
      <AnimatePresence>
        {showTerms && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass-card rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[80vh] border-white/10"
            >
              <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold font-display text-text-main">
                    服務條款、隱私權政策與社群規範
                  </h2>
                  <p className="mt-1 text-[0.625rem] leading-relaxed text-text-muted/60">
                    這份說明是為了告知服務規則、資料使用方式、社群安全底線與檢舉審核流程，不會要求你放棄法律上的基本權利。
                  </p>
                </div>
                <div className="bg-blue-500/10 p-1.5 rounded-lg border border-blue-500/20">
                  <Waves className="text-bio-glow w-5 h-5" />
                </div>
              </div>
              
              <div 
                ref={termsScrollRef}
                onScroll={handleTermsScroll}
                className="p-6 overflow-y-auto space-y-8 text-text-muted leading-relaxed text-sm custom-scrollbar"
              >
                {/* Initial Profile Setup */}
                {isProfileSetupRequired && (
                  <section className="space-y-6 pb-8 border-b border-white/5">
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-bio-glow/30 bg-white/5 flex items-center justify-center relative">
                          {setupPhoto === DEFAULT_ISLANDER_PHOTO || !setupPhoto ? (
                            <DefaultIslanderAvatar className="w-full h-full rounded-none" />
                          ) : (
                            <img src={setupPhoto} alt="Preview" className="w-full h-full object-cover" />
                          )}
                          {isUploadingAvatar && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              >
                                <Waves className="w-6 h-6 text-bio-glow" />
                              </motion.div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 bg-bio-glow text-deep-ocean p-2 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <input 
                          type="file" 
                          ref={avatarInputRef}
                          onChange={handleAvatarSelect}
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                        />
                      </div>
                      <div className="text-center space-y-1">
                        <h3 className="text-text-main font-bold text-base">設定您的島民身分</h3>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <span className="text-[0.625rem] bg-white/10 text-text-muted px-2 py-0.5 rounded-full font-mono font-bold tracking-wider">
                            島內ID: {profile?.islanderId}
                          </span>
                        </div>
                        <p className="text-[0.625rem] text-text-muted uppercase tracking-widest">
                          請設定一個在群島中使用的暱稱與頭像
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                         <label className="text-[0.625rem] font-bold text-text-muted uppercase tracking-widest px-1">暱稱 (暱稱一旦設定將鎖定 3 個月)</label>
                         <input 
                           type="text"
                           placeholder="例如：北竿阿銘"
                           value={setupName}
                           onChange={(e) => setSetupName(e.target.value)}
                           className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-text-main placeholder:text-text-muted/50 outline-none transition-all ${
                             setupNameError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-bio-glow/50'
                           }`}
                         />
                         <div className="px-1 flex flex-col gap-1">
                           <p className="text-[0.625rem] text-text-muted">
                             規則：中英文、數字或底線 (_)，長度限制 2-12 字
                           </p>
                           <p className="text-[0.5625rem] text-text-muted/70">
                             島內ID一旦設定將鎖定 6 個月。
                           </p>
                           {isCheckingSetupName ? (
                             <p className="text-[0.625rem] text-blue-400 animate-pulse">正在檢查暱稱可用性...</p>
                           ) : setupNameError ? (
                             <p className="text-[0.625rem] text-red-500 font-bold">{setupNameError}</p>
                           ) : setupName.trim().length >= 2 && (
                              <p className="text-[0.625rem] text-green-500 font-bold">此暱稱可以使用 ✓</p>
                           )}
                         </div>
                      </div>
                      {setupPhoto === user?.photoURL && (
                        <p className="text-[0.625rem] text-amber-500 font-bold bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                           ⚠️ 站長提醒：為了保護您的隱私，請更換一個不同於 Google 的頭相。
                        </p>
                      )}
                    </div>
                  </section>
                )}

                <PolicySections
                  sectionIds={['overview', 'terms', 'responsibility', 'privacy', 'community', 'moderation', 'contact']}
                  showVersionCards
                />
              </div>


              <div className="p-6 border-t border-white/5 bg-white/5 flex flex-col gap-3">
                {!hasReadToBottom && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <motion.div 
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ChevronRight className="w-3 h-3 text-bio-glow rotate-90" />
                    </motion.div>
                    <p className="text-[0.625rem] text-bio-glow font-bold uppercase tracking-widest animate-pulse">請滑動至底部以閱讀完整條款</p>
                  </div>
                )}
                {isOnboarding ? (
                  <>
                    <p className="text-[0.625rem] text-center text-text-muted uppercase tracking-widest">點擊下方按鈕即表示您已閱讀並同意最新版規範。</p>
                    <button 
                      onClick={handleAgree}
                      className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                        hasReadToBottom && (!isProfileSetupRequired || (setupName.trim() && setupPhoto && setupPhoto !== user?.photoURL))
                          ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20' 
                          : 'bg-white/5 text-text-muted border border-white/10 shadow-none hover:bg-white/10'
                      }`}
                    >
                      {isProfileSetupRequired ? '確認設定並進入馬祖小站' : '同意最新版並繼續使用'}
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="w-full py-2 text-text-muted hover:text-text-main transition-colors text-sm"
                    >
                      取消並登出
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowTerms(false)}
                    className="w-full py-4 rounded-xl font-bold transition-all active:scale-95 bg-mist-medium text-text-main hover:bg-mist border border-line"
                  >
                    關閉
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md p-2 sm:items-center sm:p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-card w-full max-w-md max-h-[calc(100dvh-1rem)] rounded-t-[1.5rem] overflow-hidden shadow-2xl border-line sm:rounded-[2rem]"
            >
              <div className="p-4 sm:p-6 border-b border-line flex items-center justify-between bg-mist">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-bio-glow/20 rounded-xl">
                    <Settings className="w-5 h-5 text-bio-glow" />
                  </div>
                  <div>
                    <h2 className="text-text-main font-bold text-lg">偏好設定</h2>
                    <p className="text-text-muted text-[0.625rem] uppercase tracking-widest font-bold">Preferences & Settings</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-mist rounded-full text-text-muted transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-h-[calc(100dvh-12rem)] overflow-y-auto custom-scrollbar">
                <div>
                  <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mb-4 block">背景模式</label>
                  <div className="grid grid-cols-2 gap-3">
                    {BACKGROUND_MODES.map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setActiveBackgroundMode(mode.id)}
                        className={`group relative flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                          activeBackgroundMode === mode.id
                          ? 'bg-mist border-line'
                          : 'bg-mist/30 border-transparent hover:border-line'
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-xl border border-line flex items-center justify-center shadow-inner"
                          style={{ backgroundColor: mode.previewBackground, color: mode.previewText }}
                        >
                          <span className="text-xs font-black">Aa</span>
                        </div>
                        <div className="min-w-0 text-left">
                          <span className={`block text-sm font-bold ${activeBackgroundMode === mode.id ? 'text-text-main' : 'text-text-muted group-hover:text-text-main'}`}>
                            {mode.name}
                          </span>
                          <span className="block text-[0.5625rem] text-text-muted uppercase tracking-widest">
                            {mode.description}
                          </span>
                        </div>
                        {activeBackgroundMode === mode.id && (
                          <motion.div
                            layoutId="background-mode-active"
                            className="absolute inset-0 border-2 border-bio-glow rounded-2xl pointer-events-none"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mb-4 block">重點文字顏色</label>
                  <div className="grid grid-cols-3 gap-3">
                    {ACCENT_COLORS.map(accent => (
                      <button
                        key={accent.id}
                        onClick={() => setActiveAccentId(accent.id)}
                        className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all cursor-pointer ${
                          activeAccentId === accent.id
                          ? 'bg-mist border-line'
                          : 'bg-mist/30 border-transparent hover:border-line'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full shadow-inner border border-line"
                          style={{ backgroundColor: accent.color, boxShadow: `0 0 12px ${accent.color}40` }}
                        />
                        <span className={`text-[0.625rem] font-bold leading-tight ${activeAccentId === accent.id ? 'text-text-main' : 'text-text-muted group-hover:text-text-main'}`}>
                          {accent.name}
                        </span>
                        {activeAccentId === accent.id && (
                          <motion.div
                            layoutId="accent-color-active"
                            className="absolute inset-0 border-2 border-bio-glow rounded-2xl pointer-events-none"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mb-4 block flex justify-between">
                    <span>內容文字大小</span>
                    <span className="text-bio-glow">{fontSize}%</span>
                  </label>
                  <div className="px-2 py-4 bg-mist rounded-2xl border border-line">
                    <input 
                      type="range" 
                      min="80" 
                      max="150" 
                      value={fontSize} 
                      onInput={(e) => updateFontSize(e.currentTarget.value)}
                      onChange={(e) => updateFontSize(e.currentTarget.value)}
                      className="w-full h-1.5 bg-mist-dark rounded-lg appearance-none cursor-pointer accent-bio-glow"
                    />
                    <div className="flex justify-between mt-2 px-1">
                      <span className="text-[0.5625rem] text-text-muted font-bold uppercase">較小 (80%)</span>
                      <span className="text-[0.5625rem] text-text-muted font-bold uppercase">較大 (150%)</span>
                    </div>
                  </div>
                  <p className="text-[0.5625rem] text-text-muted mt-2 px-1 italic">調整後只影響貼文、留言與回覆內容文字，不會放大整個操作介面。</p>
                </div>

                <div className="rounded-2xl border border-line bg-mist/70 p-4">
                  <p className="text-xs font-bold text-text-main">手機瀏覽建議</p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-text-muted">
                    手機瀏覽器若工具列擠壓畫面，可用 iOS 分享選單或 Android 瀏覽器選單，把馬祖小站加入主畫面後再開啟。
                  </p>
                </div>

                <div className="pt-4 border-t border-line">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-mist border border-line opacity-80">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs text-text-muted">登入同步設定 (開發中)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 bg-mist border-t border-line flex flex-col sm:flex-row gap-3">
                <button
                  onClick={resetPreferences}
                  className="sm:w-auto bg-mist/50 hover:bg-mist-medium text-text-muted hover:text-text-main py-3 px-4 rounded-xl font-bold transition-all border border-line flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  恢復預設
                </button>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-mist-medium hover:bg-mist text-text-main py-3 rounded-xl font-bold transition-all border border-line"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Governance Records Modal */}
      <AnimatePresence>
        {showGovernanceCenter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md p-2 sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="glass-card w-full max-w-3xl max-h-[calc(100dvh-1rem)] overflow-hidden rounded-t-[1.5rem] border-line shadow-2xl sm:rounded-[2rem]"
            >
              <div className="flex items-center justify-between border-b border-line bg-mist p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-bio-glow/20 p-2">
                    <Shield className="h-5 w-5 text-bio-glow" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-main">我的站務紀錄</h2>
                    <p className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">
                      只顯示你自己的貼文、留言與回覆處置紀錄
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGovernanceCenter(false)}
                  className="rounded-full p-2 text-text-muted transition-colors hover:bg-mist hover:text-text-main"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(100dvh-8.5rem)] overflow-y-auto p-4 custom-scrollbar sm:p-6">
                <div className="mb-4 rounded-2xl border border-bio-glow/10 bg-bio-glow/5 p-4">
                  <p className="text-sm font-bold text-text-main">這裡用來保障你的安全與查詢權。</p>
                  <p className="mt-2 text-xs leading-relaxed text-text-muted">
                    若內容經站長查看、暫時隱藏、移除或恢復，這裡會盡量列出處理狀態與依據條款。這不是公開黑名單，也不是懲罰頁；它是讓處理有紀錄可查，其他島民看不到你的站務紀錄。
                  </p>
                </div>

                {isLoadingGovernanceRecords ? (
                  <div className="py-12 text-center text-sm font-bold text-text-muted">正在讀取站務紀錄...</div>
                ) : governanceRecords.length > 0 ? (
                  <div className="space-y-3">
                    {governanceRecords.map(record => (
                      <div key={record.id} className="rounded-2xl border border-line bg-mist/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-bio-glow">{record.publicCaseId || record.id}</p>
                            <h3 className="mt-1 text-sm font-bold text-text-main">
                              {getSourceTypeLabel(record.sourceType)} / {getGovernanceStatusLabel(record.status)}
                            </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[0.625rem] font-bold">
                            <span className="rounded-full border border-line bg-deep-ocean/40 px-2 py-1 text-text-muted">
                              {getRiskLevelLabel(record.riskLevel)}
                            </span>
                            {record.policyVersion && (
                              <span className="rounded-full border border-line bg-deep-ocean/40 px-2 py-1 text-text-muted">
                                規範 {record.policyVersion}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mt-3 rounded-xl border border-line bg-deep-ocean/30 p-3 text-sm leading-relaxed text-text-main/90">
                          {record.contentPreview || record.contentSnapshot || '內容已遮罩或尚未同步。'}
                        </p>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">處理摘要</p>
                            <p className="mt-1 text-xs leading-relaxed text-text-muted">{getPublicGovernanceSummary(record)}</p>
                          </div>
                          <div>
                            <p className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">站長說明</p>
                            <p className="mt-1 text-xs leading-relaxed text-text-muted">{getPublicGovernanceExplanation(record)}</p>
                          </div>
                        </div>

                        {record.policyRefs && record.policyRefs.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {record.policyRefs.map(ref => (
                              <span key={`${record.id}-${ref.code}`} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[0.625rem] font-bold text-amber-300">
                                {ref.code}：{ref.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-line bg-mist/40 px-4 py-12 text-center">
                    <Shield className="mx-auto h-8 w-8 text-bio-glow/70" />
                    <p className="mt-3 text-sm font-bold text-text-main">目前沒有站務紀錄</p>
                    <p className="mt-2 text-xs text-text-muted">如果未來有內容經站長查看或處理，會在這裡顯示。</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-deep-ocean/60 backdrop-blur-xl border-b border-white/5 py-3 sm:py-0">
        <div className="max-w-7xl mx-auto px-4 min-h-[4rem] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex min-w-0 items-center gap-2 group cursor-pointer"
            >
              <div className="bg-mist p-1.5 rounded-xl shadow-lg border border-white/5 group-hover:border-bio-glow/50 transition-colors">
                <Waves className="text-bio-glow w-6 h-6 glow-text group-hover:animate-pulse" />
              </div>
              <h1 className="font-display font-bold text-lg sm:text-2xl tracking-tight text-text-main flex items-baseline gap-2 whitespace-nowrap">
                <span>馬祖小站</span>
                <span className="hidden sm:inline text-bio-glow glow-text text-sm sm:text-lg font-medium">Matsu Station</span>
              </h1>
            </motion.button>

            {/* Mobile Actions */}
              <div className="flex items-center gap-3 sm:hidden">
                <div className="relative" data-dropdown-root>
                  <button 
                    onClick={() => {
                      setShowNotifications(!showNotifications);
                      setShowSettingsMenu(false);
                    }}
                    aria-label="開啟通知"
                    className={`p-2 transition-all cursor-pointer ${showNotifications ? 'text-bio-glow' : 'text-text-muted'}`}
                  >
                    <Bell className="w-5 h-5" />
                    {notifications.some(n => !n.read) && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-deep-ocean animate-pulse" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showNotifications && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="fixed left-3 right-3 top-20 z-50 max-h-[calc(100dvh-6rem)] dropdown-panel rounded-2xl shadow-2xl overflow-hidden"
                        >
                           <div className="p-4 border-b border-white/5 flex items-center justify-between">
                              <span className="text-xs text-text-main font-bold uppercase tracking-widest">小站通知</span>
                              <button onClick={markAllAsRead} className="text-xs text-bio-glow font-bold uppercase">標記已讀</button>
                            </div>
                            <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto custom-scrollbar">
                              {notifications.length > 0 ? (
                                notifications.map(n => (
                                  <div 
                                    key={n.id} 
                                    onClick={() => handleNotificationClick(n)}
                                    className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!n.read ? 'bg-bio-glow/5' : ''}`}
                                  >
                                    <h4 className="text-sm font-bold text-text-main mb-1 break-words">{n.title}</h4>
                                    <p className="text-xs text-text-muted mb-1 leading-relaxed break-words">{n.content}</p>
                                    {n.deletedLabel && (
                                      <p className="mb-2 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[0.625rem] font-bold text-amber-400">
                                        {n.deletedLabel}
                                      </p>
                                    )}
                                    <span className="text-xs text-text-muted/80 italic">
                                      {n.createdAt?.toDate ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: zhTW }) : '剛剛'}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-8 text-center text-text-muted/80 text-xs italic">暫時沒有新通知</div>
                              )}
                            </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="relative" data-dropdown-root>
                  <button 
                    onClick={() => {
                      setShowSettingsMenu(!showSettingsMenu);
                      setShowNotifications(false);
                    }}
                    aria-label="開啟功能選單"
                    className={`p-2 transition-all cursor-pointer ${showSettingsMenu ? 'text-bio-glow' : 'text-text-muted'}`}
                  >
                    <Settings className="w-5 h-5" />
                  </button>

                  <AnimatePresence>
                    {showSettingsMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full right-[-10px] mt-2 w-48 dropdown-panel rounded-2xl z-50 shadow-2xl overflow-hidden"
                        >
                          <div className="p-2 space-y-1">
                            <button onClick={() => { setShowSettings(true); setShowSettingsMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-main hover:bg-mist-light rounded-lg transition-colors">
                              <Settings className="w-3.5 h-3.5 text-text-muted" /> 偏好設定
                            </button>
                            {user && (
                              <>
                                <button onClick={() => { handleOpenProfile(user.uid, { tab: 'posts' }); setShowSettingsMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-main hover:bg-mist-light rounded-lg transition-colors">
                                  <User className="w-3.5 h-3.5 text-text-muted" /> 我的主頁
                                </button>
                                <button onClick={() => { handleOpenProfile(user.uid, { edit: true }); setShowSettingsMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-main hover:bg-mist-light rounded-lg transition-colors">
                                  <Edit2 className="w-3.5 h-3.5 text-text-muted" /> 編輯個人資料
                                </button>
                                <button onClick={() => { void openGovernanceCenter(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-main hover:bg-mist-light rounded-lg transition-colors">
                                  <Shield className="w-3.5 h-3.5 text-text-muted" /> 站務紀錄
                                </button>
                              </>
                            )}
                            {user && (
                              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors">
                                <LogOut className="w-3.5 h-3.5" /> 登出帳號
                              </button>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {user ? (
                  <button onClick={() => handleOpenProfile(user.uid)} className="cursor-pointer active:scale-95 transition-transform">
                    <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: user.uid === STATION_MASTER_UID ? 'admin' : 'user' }} className="w-8 h-8 rounded-full border border-line hover:border-bio-glow" />
                  </button>
                ) : (
                <button onClick={handleLogin} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap">
                  <LogIn className="w-3 h-3" />
                  登錄
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-center sm:justify-start order-2 sm:order-none">
            {/* Weather Widget */}
            {weather && (
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowWeatherModal(true)}
                className="weather-chip flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border transition-all cursor-pointer"
                title="馬祖氣象站詳情"
              >
                {weather.icon === 'Sun' && <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />}
                {weather.icon === 'Cloud' && <Cloud className="w-4 h-4 text-text-muted" />}
                {weather.icon === 'CloudRain' && <CloudRain className="w-4 h-4 text-blue-400" />}
                {weather.icon === 'Snowflake' && <Snowflake className="w-4 h-4 text-text-main" />}
                {weather.icon === 'CloudLightning' && <CloudLightning className="w-4 h-4 text-yellow-500" />}
                <div className="flex flex-col items-start gap-0.5">
                  <span className="weather-chip-label text-[0.625rem] font-bold uppercase tracking-tighter leading-none text-left">馬祖氣象</span>
                  <span className="text-[0.75rem] font-mono font-bold text-text-main leading-none">{weather.temp != null ? `${weather.temp}°C` : '--°C'}</span>
                </div>
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowTransportModal('flight')}
              className="flight-chip flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all cursor-pointer"
              title="航班資訊"
            >
              <Plane className="flight-chip-icon w-3.5 h-3.5 drop-shadow-sm" />
              <span className="flight-chip-label text-[0.625rem] font-bold uppercase tracking-tighter">航班</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowTransportModal('ferry')}
              className="ferry-chip flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all cursor-pointer"
              title="船班資訊"
            >
              <Ship className="ferry-chip-icon w-3.5 h-3.5 drop-shadow-sm" />
              <span className="ferry-chip-label text-[0.625rem] font-bold uppercase tracking-tighter">船班</span>
            </motion.button>

            <div className="flex-1 max-w-full sm:max-w-[320px] relative group hidden sm:block">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bio-glow/80" />
             <input 
               type="text" 
               placeholder="搜尋貼文、作者、分類..."
               className="w-full bg-deep-ocean/70 border border-line rounded-full py-2.5 pl-10 pr-10 text-sm text-text-main placeholder:text-text-muted/70 focus:border-bio-glow/70 focus:bg-mist-light focus:ring-2 focus:ring-bio-glow/20 transition-all outline-none shadow-sm"
               value={searchQuery}
               onChange={(e) => {
                 setSearchQuery(e.target.value);
                 setIsSearchFocused(true);
               }}
               onFocus={() => setIsSearchFocused(true)}
               onClick={() => setIsSearchFocused(true)}
               onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
             />
             {searchQuery && (
               <button
                 type="button"
                 onMouseDown={(e) => e.preventDefault()}
                 onClick={() => setSearchQuery('')}
                 className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text-main hover:bg-mist-medium transition-colors"
                 title="清除搜尋"
               >
                 <X className="w-3.5 h-3.5" />
               </button>
             )}

             <AnimatePresence>
               {isSearchFocused && (
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="absolute top-full left-0 right-0 mt-2 p-4 glass-card rounded-2xl z-50 shadow-2xl border-line max-h-[70vh] overflow-y-auto"
                 >
                   <div className="rounded-xl bg-mist-light border border-line p-3 mb-4">
                     <div className="flex items-center justify-between gap-3">
                       <div className="min-w-0">
                         <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest">智慧搜尋</p>
                         <p className="text-sm text-text-main font-bold mt-1">
                           {normalizedSearchQuery ? `找到 ${searchResultCount} 則相關動態` : '輸入關鍵字，或直接選分類'}
                         </p>
                       </div>
                       {normalizedSearchQuery && (
                         <button
                           type="button"
                           onMouseDown={(e) => e.preventDefault()}
                           onClick={() => setSearchQuery('')}
                           className="shrink-0 text-[0.625rem] font-bold text-text-muted hover:text-bio-glow transition-colors"
                         >
                           清除
                         </button>
                       )}
                     </div>
                     <p className="text-[0.6875rem] text-text-muted leading-relaxed mt-2">
                       會比對貼文內容、作者名稱、分類與分類提示。
                     </p>
                   </div>

                   {normalizedSearchQuery && searchPreviewPosts.length > 0 && (
                     <div className="mb-4">
                       <div className="flex items-center justify-between mb-2 px-1">
                         <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest">搜尋預覽</span>
                         <span className="text-[0.625rem] text-text-muted font-mono">{searchPreviewPosts.length}/{searchResultCount}</span>
                       </div>
                       <div className="space-y-1.5">
                         {searchPreviewPosts.map(post => (
                           <button
                             key={post.id}
                             type="button"
                             onClick={() => {
                               setIsSearchFocused(false);
                               setActiveCategory('全部');
                               setTimeout(() => {
                                 document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                               }, 80);
                             }}
                             className="w-full text-left p-2.5 rounded-xl hover:bg-mist-light transition-colors"
                           >
                             <div className="flex items-center justify-between gap-3">
                               <span className="text-xs font-bold text-text-main truncate">{post.authorName}</span>
                               <span className="text-[0.625rem] text-bio-glow shrink-0">{normalizeCategoryName(post.category) || post.aiTag || '未分類'}</span>
                             </div>
                             <p className="text-[0.6875rem] text-text-muted line-clamp-2 mt-1 leading-relaxed">
                                {isModerationHidden(post.moderationStatus) || isModerationMasked(post.moderationStatus)
                                  ? getModerationTombstoneText(
                                    post.moderationStatus,
                                    post.moderationReason,
                                    'post',
                                    post.moderationPublicNotice || post.moderationReviewNotice || post.moderationMaskNotice,
                                  )
                                  : post.content || '圖片貼文'}
                             </p>
                           </button>
                         ))}
                       </div>
                     </div>
                   )}
                   {normalizedSearchQuery && searchPreviewPosts.length === 0 && (
                     <div className="mb-4 rounded-xl border border-line bg-mist-light p-3">
                       <p className="text-sm font-bold text-text-main">目前沒有符合的動態</p>
                       <p className="text-[0.6875rem] text-text-muted leading-relaxed mt-1">可以換個關鍵字，或用下方分類快速瀏覽。</p>
                     </div>
                   )}

                   <div className="mb-4">
                     <div className="flex items-center justify-between mb-2 px-1">
                       <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest">快速分類</span>
                       <Compass className="w-3.5 h-3.5 text-text-muted" />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                       {searchCategoryShortcuts.map(cat => (
                         <button
                           key={cat.id}
                           type="button"
                           onClick={() => {
                             setActiveCategory(cat.name);
                             setSearchQuery('');
                             setIsSearchFocused(false);
                           }}
                           className="flex items-center gap-2 rounded-xl border border-line bg-mist-light px-2.5 py-2 text-left hover:border-bio-glow/40 hover:text-bio-glow transition-all"
                         >
                           <span className="text-sm">{cat.icon}</span>
                           <span className="text-[0.6875rem] font-bold text-text-main truncate">{cat.name}</span>
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="flex items-center justify-between mb-3 px-1">
                     <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest">在地話題</span>
                     <MapPin className="w-3.5 h-3.5 text-text-muted" />
                   </div>
                   <div className="space-y-1">
                     {LOCAL_TOPIC_SHORTCUTS.map((topic) => (
                       <button
                         key={topic.label}
                         onClick={() => {
                           setSearchQuery(topic.label);
                           setIsSearchFocused(false);
                         }}
                         className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-mist-light group/topic transition-all text-left cursor-pointer"
                       >
                         <div className="flex items-center gap-3">
                           <span className="text-xs font-mono text-bio-glow opacity-60">#</span>
                           <span className="text-sm text-text-muted group-hover/topic:text-text-main transition-colors">{topic.label}</span>
                         </div>
                         <span className="text-[0.625rem] text-text-muted font-mono">近期</span>
                       </button>
                     ))}
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
           </div>
          </div>

          <div className="hidden sm:flex items-center gap-4">
            <div className="relative" data-dropdown-root>
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowSettingsMenu(false);
                }}
                aria-label="開啟通知"
                className={`p-2 rounded-xl transition-all cursor-pointer relative ${
                  showNotifications ? 'text-bio-glow bg-mist-medium' : 'text-text-muted hover:text-bio-glow hover:bg-mist-light'
                }`}
                title="通知"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-deep-ocean animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] dropdown-panel rounded-2xl z-50 shadow-2xl overflow-hidden"
                    >
                      <div className="p-4 border-b border-line flex items-center justify-between">
                        <span className="text-xs text-text-main font-bold uppercase tracking-widest">小站通知</span>
                        <button onClick={markAllAsRead} className="text-xs text-bio-glow font-bold hover:underline">全部標為已讀</button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div 
                              key={n.id} 
                              onClick={() => handleNotificationClick(n)}
                              className={`p-4 border-b border-line hover:bg-white/5 transition-colors cursor-pointer relative ${!n.read ? 'bg-bio-glow/5' : ''}`}
                            >
                              {!n.read && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-bio-glow rounded-full" />}
                              <h4 className="text-sm font-bold text-text-main mb-1 break-words">{n.title}</h4>
                              <p className="text-sm text-text-muted mb-2 leading-relaxed break-words">{n.content}</p>
                              {n.deletedLabel && (
                                <p className="mb-2 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[0.625rem] font-bold text-amber-400">
                                  {n.deletedLabel}
                                </p>
                              )}
                              <span className="text-xs text-text-muted/80 font-mono tracking-wider italic">
                                {n.createdAt?.toDate ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: zhTW }) : '剛剛'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-text-muted/80 text-sm italic">暫時沒有新通知</div>
                        )}
                      </div>
                      <div className="p-3 bg-mist/70 border-t border-line text-center">
                        <button className="text-xs text-text-muted hover:text-text-main transition-colors">查看更早之前的通知</button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" data-dropdown-root>
              <button 
                onClick={() => {
                  setShowSettingsMenu(!showSettingsMenu);
                  setShowNotifications(false);
                }}
                aria-label="開啟功能選單"
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  showSettingsMenu ? 'text-bio-glow bg-white/10' : 'text-text-muted hover:text-bio-glow hover:bg-white/5'
                }`}
                title="功能選單"
              >
                <Settings className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showSettingsMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-56 dropdown-panel rounded-2xl z-50 shadow-2xl overflow-hidden"
                    >
                      <div className="p-2 space-y-1">
                        <div className="px-3 py-2">
                          <span className="text-xs text-text-muted font-bold uppercase tracking-widest">個人化</span>
                        </div>
                        <button 
                          onClick={() => { setShowSettings(true); setShowSettingsMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                        >
                          <Settings className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                          偏好設定
                        </button>
                        {user && (
                          <button 
                            onClick={() => { 
                              handleOpenProfile(user.uid, { tab: 'posts' }); 
                              setShowSettingsMenu(false); 
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                          >
                            <User className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                            我的主頁
                          </button>
                        )}
                        {user && (
                          <button 
                            onClick={() => { 
                              handleOpenProfile(user.uid, { edit: true }); 
                              setShowSettingsMenu(false); 
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                          >
                            <Edit2 className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                            編輯個人資料
                          </button>
                        )}
                        {user && (
                          <button 
                            onClick={() => { void openGovernanceCenter(); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                          >
                            <Shield className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                            站務紀錄
                          </button>
                        )}
                        <div className="border-t border-line my-1" />
                        
                        <div className="px-3 py-2">
                          <span className="text-xs text-text-muted font-bold uppercase tracking-widest">其他</span>
                        </div>
                        <button 
                          onClick={() => { setShowTerms(true); setShowSettingsMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                        >
                          <Shield className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                          服務條款
                        </button>
                        
                        {user && (
                          <>
                            <div className="border-t border-line my-1" />
                            
                            <button 
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all text-sm font-medium group"
                            >
                              <LogOut className="w-4 h-4 text-rose-900 group-hover:text-rose-500" />
                              登出帳號
                            </button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-text-main">{profile?.displayName?.charAt(0) || user.displayName?.charAt(0)}</span>
                </div>
                <button onClick={() => handleOpenProfile(user.uid)} className="cursor-pointer active:scale-95 transition-transform">
                  <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: user.uid === STATION_MASTER_UID ? 'admin' : 'user' }} className="w-8 h-8 rounded-full border border-white/10 hover:border-bio-glow" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-blue-600 text-white px-4 py-2 rounded-full font-medium flex items-center gap-2 hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                登錄
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-3 flex justify-start">
        <a
          href={LINE_OFFICIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="加入馬祖小站 LINE 官方帳號好友"
          className="inline-flex h-9 items-center transition-opacity hover:opacity-90 active:scale-95"
        >
          <img
            src="https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png"
            alt="加入好友"
            className="h-9 w-auto"
            referrerPolicy="no-referrer"
          />
        </a>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {viewingProfile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="glass-card rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden border-line relative max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => { setViewingProfile(null); setIsEditingProfile(false); }}
                className="absolute top-6 right-6 p-2 text-text-muted hover:text-text-main bg-mist rounded-full z-20 cursor-pointer transition-colors border border-line"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>

              <div className="overflow-y-auto custom-scrollbar flex-1">
                {/* Profile Cover/Background */}
                <div className="h-32 bg-gradient-to-r from-blue-900 via-indigo-950 to-deep-ocean relative">
                  <div className="absolute inset-0 opacity-20">
                    <Waves className="w-full h-full object-cover" />
                  </div>
                </div>

                <div className="px-8 pb-8 -mt-12 relative z-10">
                  <div className="flex justify-between items-end mb-6">
                    <div className="relative group">
                      <UserAvatar 
                        p={{ 
                          islanderId: viewingProfile.islanderId, 
                          photoURL: isEditingProfile ? (editPhotoURL || viewingProfile.photoURL) : viewingProfile.photoURL,
                          displayName: viewingProfile.displayName,
                          role: isViewingStationMaster ? 'admin' : 'user'
                        }} 
                        className="w-24 h-24 rounded-[2rem] border-4 border-deep-ocean shadow-2xl bg-deep-ocean" 
                      />
                      <div className="absolute inset-0 rounded-[2rem] border border-white/10" />
                      {isEditingProfile && (
                        <>
                          <button
                            type="button"
                            onClick={() => avatarUpdateInputRef.current?.click()}
                            className="absolute -bottom-1 -right-1 bg-bio-glow text-deep-ocean p-2 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer z-20"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {isUploadingAvatar && (
                            <div className="absolute inset-0 rounded-[2rem] bg-black/40 backdrop-blur-sm flex items-center justify-center z-10">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              >
                                <Waves className="w-6 h-6 text-bio-glow" />
                              </motion.div>
                            </div>
                          )}
                          <input 
                            type="file" 
                            ref={avatarUpdateInputRef}
                            onChange={handleUpdateAvatarSelect}
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                          />
                        </>
                      )}
                    </div>
                    {!isViewingOwnProfile && user && !isEditingProfile && (
                      <div className="flex flex-wrap justify-end gap-2 mb-2">
                        <button
                          type="button"
                          disabled={isSavingRelationship}
                          onClick={handleToggleFollow}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                            isFollowingProfile
                              ? 'bg-bio-glow/10 text-bio-glow border-bio-glow/30'
                              : hasPendingFollowRequest
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-bio-glow text-deep-ocean border-bio-glow hover:bg-white'
                          } disabled:opacity-50`}
                        >
                          {isFollowingProfile ? '已追蹤' : hasPendingFollowRequest ? '等待同意' : '申請追蹤'}
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingProfile ? (
                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-1 block mb-1">暱稱 (暱稱一旦設定將鎖定 3 個月)</label>
                          <input 
                            type="text" 
                            className={`bg-mist border rounded-xl px-4 py-2 text-text-main text-lg font-bold outline-none w-full transition-all ${
                              editNameError ? 'border-red-500/50 focus:border-red-500' : 'border-line focus:border-bio-glow/50'
                            }`}
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                          />
                          <div className="px-1 mt-1 flex flex-col gap-1">
                            <p className="text-[0.625rem] text-text-muted">
                              規則：中英文、數字或底線 (_), 長度限制 2-12 字
                            </p>
                            {isCheckingEditName ? (
                              <p className="text-[0.625rem] text-blue-400 animate-pulse">正在檢查暱稱可用性...</p>
                            ) : editNameError ? (
                              <p className="text-[0.625rem] text-red-500 font-bold">{editNameError}</p>
                            ) : editDisplayName.trim() !== profile.displayName && editDisplayName.trim().length >= 2 && (
                               <p className="text-[0.625rem] text-green-500 font-bold">此暱稱可以使用 ✓</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[0.625rem] bg-mist-medium text-text-muted px-2 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase">
                             島內ID: {viewingProfile.islanderId}
                           </span>
                        </div>
                        <p className="text-[0.5625rem] text-text-muted/70 px-1">島內ID一旦設定將鎖定 6 個月。</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-1">個人標籤</label>
                        <input 
                          type="text" 
                          maxLength={15}
                          placeholder="例如：北竿浪子, 藍眼淚捕手..."
                          className="w-full bg-mist border border-line rounded-2xl py-3 px-4 text-text-main placeholder:text-text-muted/40 outline-none focus:border-bio-glow/50 transition-all"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-1">個人簡介</label>
                         <textarea 
                           maxLength={200}
                           placeholder="介紹一下你自己，讓其他島民更認識你..."
                           className="w-full bg-mist border border-line rounded-2xl py-3 px-4 text-text-main placeholder:text-text-muted/40 outline-none focus:border-bio-glow/50 transition-all min-h-[120px] resize-none"
                           value={editBio}
                           onChange={(e) => setEditBio(e.target.value)}
                         />
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
                        <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-500/80 leading-relaxed italic">
                          提醒：為了維持社群穩定，暱稱、個人標籤與簡介每 90 天僅能修改一次；島內ID一旦設定將鎖定 6 個月。
                        </p>
                      </div>
                      <div className="flex gap-3 pt-2">
                         <button 
                           type="button"
                           onClick={() => setIsEditingProfile(false)}
                           className="flex-1 py-3 text-text-muted hover:text-text-main transition-colors font-bold text-sm"
                         >
                           取消
                         </button>
                         <button 
                           type="submit"
                           disabled={isUpdatingProfile}
                           className="flex-2 bg-bio-glow text-deep-ocean py-3 rounded-2xl font-bold hover:bg-white transition-all shadow-lg shadow-bio-glow/20 disabled:opacity-50"
                         >
                           {isUpdatingProfile ? '同步島嶼中...' : '確認修改'}
                         </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-3">
                         <div className="flex flex-wrap items-center gap-3">
                           <h2 className={`text-2xl font-bold ${isViewingStationMaster ? 'rgb-text' : 'text-text-main'}`}>
                             {viewingProfile.displayName}
                           </h2>
                            {isViewingStationMaster && (
                              <span className="bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-2 py-0.5 rounded-lg text-[0.625rem] font-black uppercase tracking-tighter shadow-lg">
                                站長
                              </span>
                            )}
                           {viewingProfile.title && (
                             <span className="bg-bio-glow/20 text-bio-glow px-2 py-0.5 rounded-lg text-[0.625rem] font-black uppercase tracking-tighter border border-bio-glow/30">
                               {viewingProfile.title}
                             </span>
                           )}
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-[0.625rem] bg-mist-medium text-text-muted px-2 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase">
                             島民ID: {viewingProfile.islanderId}
                           </span>
                           {isViewingOwnProfile && (
                             <span className="text-[0.625rem] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-500/20">
                               你的主頁
                             </span>
                           )}
                         </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-line bg-mist-light p-3 text-center">
                          <p className="text-lg font-bold text-text-main font-mono">{profileStats.postCount}</p>
                          <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mt-0.5">發文</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSocialList('following')}
                          className="rounded-2xl border border-line bg-mist-light p-3 text-center transition-all hover:border-bio-glow/40 hover:bg-mist"
                          title={canViewProfileSocialLists ? '查看追蹤中名單' : '追蹤通過後才能查看名單'}
                        >
                          <p className="text-lg font-bold text-text-main font-mono">{profileStats.followingCount}</p>
                          <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mt-0.5">追蹤中</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSocialList('followers')}
                          className="rounded-2xl border border-line bg-mist-light p-3 text-center transition-all hover:border-bio-glow/40 hover:bg-mist"
                          title={canViewProfileSocialLists ? '查看追蹤者名單' : '追蹤通過後才能查看名單'}
                        >
                          <p className="text-lg font-bold text-text-main font-mono">{profileStats.followerCount}</p>
                          <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mt-0.5">追蹤者</p>
                        </button>
                      </div>

                      {socialListModal && (
                        <div className="rounded-[1.5rem] border border-line bg-mist/70 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-line px-4 py-3">
                            <div>
                              <p className="text-sm font-bold text-text-main">{socialListModal.title}</p>
                              <p className="text-[0.625rem] text-text-muted">
                                {canViewProfileSocialLists ? '已通過追蹤關係，可查看名單。' : '追蹤通過後才可查看。'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSocialListModal(null)}
                              className="rounded-full p-2 text-text-muted transition-colors hover:bg-mist-light hover:text-text-main"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="max-h-56 overflow-y-auto custom-scrollbar p-2">
                            {isLoadingSocialList ? (
                              <div className="p-6 text-center text-xs text-text-muted">讀取名單中...</div>
                            ) : socialListModal.items.length > 0 ? (
                              socialListModal.items.map(item => (
                                <button
                                  key={item.uid}
                                  type="button"
                                  onClick={() => handleOpenProfile(item.uid)}
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-mist-light"
                                >
                                  <UserAvatar p={item} className="h-8 w-8 rounded-full border border-line" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-text-main">{item.displayName}</p>
                                    <p className="text-[0.625rem] font-mono text-text-muted">島民ID: {item.islanderId || item.uid}</p>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="p-6 text-center text-xs text-text-muted">目前沒有名單資料</div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="p-5 bg-mist-light border border-line rounded-[2rem] min-h-[96px]">
                         <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
                           {viewingProfile.bio || "這個島民很神秘，還沒有留下任何簡介。"}
                         </p>
                      </div>

                      {isViewingOwnProfile && followRequests.length > 0 && (
                        <div className="rounded-[1.5rem] border border-line bg-mist/70 p-4 space-y-3">
                          <div>
                            <p className="text-xs font-bold text-text-main">追蹤申請</p>
                            <p className="text-[0.6875rem] text-text-muted mt-1">同意後，對方才會成為你的追蹤者。</p>
                          </div>
                          <div className="space-y-2">
                            {followRequests.map(request => (
                              <div key={request.requesterId} className="flex flex-col gap-3 rounded-2xl border border-line bg-mist-light p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                  <UserAvatar p={request} className="h-9 w-9 rounded-full border border-line" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-text-main">{request.displayName}</p>
                                    <p className="text-[0.625rem] font-mono text-text-muted">島民ID: {request.islanderId || request.requesterId}</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={isSavingRelationship}
                                    onClick={() => handleFollowRequestAction(request, 'reject')}
                                    className="flex-1 rounded-xl border border-line px-3 py-2 text-xs font-bold text-text-muted transition-colors hover:bg-mist sm:flex-none"
                                  >
                                    婉拒
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingRelationship}
                                    onClick={() => handleFollowRequestAction(request, 'approve')}
                                    className="flex-1 rounded-xl bg-bio-glow px-3 py-2 text-xs font-bold text-deep-ocean transition-colors hover:bg-white sm:flex-none"
                                  >
                                    同意
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {friendActionMessage && (
                        <div className="rounded-2xl border border-bio-glow/20 bg-bio-glow/10 px-4 py-3 text-sm text-bio-glow">
                          {friendActionMessage}
                        </div>
                      )}

                      <div className="rounded-[1.5rem] border border-line bg-mist/60 overflow-hidden">
                        <div className="flex border-b border-line bg-mist-light p-1">
                          {PROFILE_TABS.map(tab => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setProfileTab(tab.id)}
                              className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                profileTab === tab.id
                                  ? 'bg-bio-glow text-deep-ocean shadow-lg shadow-bio-glow/10'
                                  : 'text-text-muted hover:text-text-main'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-3 space-y-2">
                          {isLoadingProfileActivity ? (
                            <div className="p-8 text-center text-sm text-text-muted">讀取個人動態中...</div>
                          ) : visibleProfilePosts.length > 0 ? (
                            visibleProfilePosts.map(profilePost => (
                              <button
                                key={profilePost.id}
                                type="button"
                                onClick={() => {
                                  setViewingProfile(null);
                                  setIsEditingProfile(false);
                                  setActiveCategory('全部');
                                  setTimeout(() => {
                                    document.getElementById(`post-${profilePost.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }, 80);
                                }}
                                className="w-full rounded-2xl border border-line bg-mist-light p-4 text-left hover:border-bio-glow/40 hover:bg-mist transition-all"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[0.625rem] font-bold text-bio-glow">{normalizeCategoryName(profilePost.category) || profilePost.aiTag || '未分類'}</span>
                                  <span className="text-[0.625rem] text-text-muted">
                                    {profilePost.createdAt?.toDate ? formatDistanceToNow(profilePost.createdAt.toDate(), { addSuffix: true, locale: zhTW }) : '剛剛'}
                                  </span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm text-text-main/90 leading-relaxed">
                                  {isModerationHidden(profilePost.moderationStatus) || isModerationMasked(profilePost.moderationStatus)
                                    ? getModerationTombstoneText(
                                      profilePost.moderationStatus,
                                      profilePost.moderationReason,
                                      'post',
                                      profilePost.moderationPublicNotice || profilePost.moderationReviewNotice || profilePost.moderationMaskNotice,
                                    )
                                    : profilePost.content || '圖片貼文'}
                                </p>
                                <div className="mt-3 flex items-center gap-4 text-[0.6875rem] text-text-muted">
                                  <span>{profilePost.likesCount || 0} 個反應</span>
                                  <span>{profilePost.commentsCount || 0} 則留言</span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="p-8 text-center">
                              <p className="text-sm font-bold text-text-main">
                                {profileTab === 'posts' ? '目前沒有發文' : '目前沒有按讚內容'}
                              </p>
                              <p className="text-[0.6875rem] text-text-muted mt-1">
                                {profileTab === 'posts' ? '這裡會顯示這位島民的歷史發文。' : '這裡會顯示這位島民按過反應的貼文。'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 opacity-50 border-t border-line">
                         <div className="flex items-center gap-1.5 text-text-muted text-[0.625rem] font-bold uppercase tracking-widest">
                           <Calendar className="w-3.5 h-3.5" />
                           加入於 {viewingProfile.createdAt?.toDate ? viewingProfile.createdAt.toDate().toLocaleDateString() : '尚未加入'}
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
       {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8 justify-center">
        
        {/* Left Sidebar - PC Version (Always rendered, hidden on mobile by CSS) */}
        <aside className="hidden md:block shrink-0 w-56 space-y-4">
          <div className="space-y-4 sticky top-24">
            <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mb-4 px-2">頻道分類</p>
            <div className="space-y-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer active:scale-95 ${
                    activeCategory === cat.name 
                    ? 'bg-bio-glow/10 text-bio-glow border border-bio-glow/20 shadow-lg shadow-bio-glow/5' 
                    : 'text-text-muted hover:bg-mist hover:text-text-main'
                  }`}
                >
                  <span className="w-5 flex justify-center">{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
            
            <div className="mt-8 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 mb-4">
              <p className="text-[0.625rem] text-indigo-400 font-bold mb-1">社群公告</p>
              <p className="text-[0.6875rem] text-text-muted leading-relaxed">🌊 藍眼淚季節在每年3月至9月，4到6月為最容易出現的爆發期，請把握機會分享你的私房景點。<br />
                🔗 請注意外部連結安全，避免點擊來源不明的網址。
              </p>
            </div>

            <div className="pt-4 border-t border-line space-y-2">
              <p className="text-[0.5625rem] text-text-muted font-bold uppercase tracking-widest px-2">小站狀態</p>
              <div className="flex items-center gap-2 px-2">
                <div className={`w-1.5 h-1.5 rounded-full ${db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                <span className="text-[0.625rem] text-text-muted">小站 {db ? '已連線' : '連線中斷'}</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-stone-700'}`} />
                <span className="text-[0.625rem] text-text-muted">身份 {user ? '已登入' : '訪客'}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar (Managed by AnimatePresence) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.aside 
              key="mobile-sidebar"
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-64 bg-deep-ocean p-6 shadow-2xl border-r border-white/5 overflow-y-auto z-50 md:hidden"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-2">頻道導覽</p>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-text-muted">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setActiveCategory(cat.name);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer active:scale-95 ${
                        activeCategory === cat.name 
                        ? 'bg-bio-glow/10 text-bio-glow border border-bio-glow/20 shadow-lg shadow-bio-glow/5' 
                        : 'text-text-muted hover:bg-white/5 hover:text-text-main'
                      }`}
                    >
                      <span className="w-5 flex justify-center">{cat.icon}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
                
                <div className="mt-8 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 mb-4">
                  <p className="text-[0.625rem] text-indigo-400 font-bold mb-1">社群公告</p>
                  <p className="text-[0.6875rem] text-text-muted leading-relaxed">🌊 藍眼淚季節在每年3月至9月，4到6月為最容易出現的爆發期，請把握機會分享你的私房景點。<br />
                    🔗 請注意外部連結安全，避免點擊來源不明的網址。
                  </p>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-2">
                  <p className="text-[0.5625rem] text-text-muted/70 font-bold uppercase tracking-widest px-2">小站狀態</p>
                  <div className="flex items-center gap-2 px-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                    <span className="text-[0.625rem] text-text-muted">小站 {db ? '已連線' : '連線中斷'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-stone-700'}`} />
                    <span className="text-[0.625rem] text-text-muted">身份 {user ? '已登入' : '訪客'}</span>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="flex-1 max-w-[640px] w-full space-y-8">
          {/* Whisper Bar */}
          <div className="overflow-hidden bg-mist/30 border-y border-white/5 py-2 -mx-4 rounded-xl flex">
            <div className="marquee-track flex gap-12 whitespace-nowrap text-[0.625rem] text-bio-glow uppercase tracking-[0.3em] font-bold opacity-60">
              <div className="flex gap-12 shrink-0">
                <span>馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。發言由使用者自行負責；若有檢舉或需要協助查看的內容，站長會依規範處理並留下站務紀錄。若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。</span>
              </div>
              <div className="flex gap-12 shrink-0">
                <span>馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。發言由使用者自行負責；若有檢舉或需要協助查看的內容，站長會依規範處理並留下站務紀錄。若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。</span>
              </div>
            </div>
          </div>

          {/* Welcome Section */}
          {!user && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white p-8 rounded-[2rem] shadow-2xl space-y-4 mb-4 relative overflow-hidden border border-white/5"
            >
              <div className="relative z-10">
                <h2 className="text-3xl font-bold font-display opacity-90">歡迎來到馬祖小站</h2>
                <p className="text-stone-300 max-w-md text-sm leading-relaxed">
                   馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。<br />發言由使用者自行負責；若有檢舉或需要協助查看的內容，站長會依規範處理並留下站務紀錄。<br />若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。
                </p>
                <button 
                  onClick={handleLogin}
                  className="mt-6 bg-bio-glow text-deep-ocean px-6 py-3 rounded-xl font-bold hover:bg-white transition-all flex items-center gap-2 shadow-lg shadow-bio-glow/20"
                >
                  探索馬祖的另一面
                </button>
              </div>
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px]" />
              <Waves className="absolute bottom-[-20px] right-[-20px] w-64 h-64 text-white/5" />
            </motion.div>
          )}

          {/* Post Form */}
          {user && hasAcceptedLatestPolicies(profile) && (
            <motion.form 
              id="post-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleCreatePost}
              className="glass-card p-6 rounded-3xl space-y-4 shadow-xl border-line"
            >
              <div className="flex gap-4">
                <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: user.uid === STATION_MASTER_UID ? 'admin' : 'user' }} className="w-10 h-10 rounded-full border border-line" />
                <div className="flex-1 space-y-4">
                  <MentionComposerInput
                    multiline
                    placeholder="在夜色中留下馬祖的消息... @暱稱"
                    disabled={isPosting}
                    maxLength={POST_CHAR_LIMIT}
                    className="w-full bg-transparent border-none focus:ring-0 text-text-main text-lg resize-none py-2 min-h-[100px] placeholder:text-text-muted/40 outline-none disabled:opacity-50"
                    value={newPostContent}
                    onChange={(nextValue) => setNewPostContent(limitChars(nextValue, POST_CHAR_LIMIT))}
                  />
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[0.625rem] text-text-muted/40 leading-relaxed">
                        {ANTI_ABUSE_NOTICE}
                      </p>
                      <p className="text-[0.5625rem] text-text-muted/35 leading-relaxed">
                        若內容被處理，會優先以站務紀錄說明狀態與依據，不做黑箱消失。
                      </p>
                    </div>
                    <span className={`text-[0.625rem] font-mono font-bold shrink-0 ${
                      countChars(newPostContent) >= POST_CHAR_LIMIT ? 'text-amber-400' : 'text-text-muted'
                    }`}>
                      字數 {countChars(newPostContent)}/{POST_CHAR_LIMIT}
                    </span>
                  </div>

                  {postError && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {postError}
                    </div>
                  )}

                  {postingMessage && (
                    <div className="rounded-2xl border border-bio-glow/20 bg-bio-glow/10 px-4 py-3 text-sm text-bio-glow">
                      {postingMessage}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {POST_TAGS.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={isPosting}
                        onClick={() => setNewPostCategory(cat.name)}
                        className={`px-3 py-1.5 rounded-full text-[0.625rem] font-bold uppercase tracking-wider transition-all border disabled:opacity-30 ${
                          newPostCategory === cat.name
                          ? 'bg-bio-glow text-deep-ocean border-bio-glow shadow-lg shadow-bio-glow/20'
                          : 'bg-mist text-text-muted border-line hover:border-text-muted/20'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Image Previews */}
                  <AnimatePresence>
                    {imagePreviews.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-1 gap-2 pt-2 sm:max-w-xs"
                      >
                        {imagePreviews.map((preview, idx) => (
                          <div key={idx} className="relative group aspect-square">
                            <img src={preview} alt="" className="w-full h-full object-cover rounded-xl border border-white/10" />
                            <button 
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    accept="image/jpeg,image/png,image/webp" 
                    className="hidden" 
                    ref={fileInputRef}
                    disabled={isPosting || isCompressing || selectedImages.length >= 1}
                    onChange={handleImageSelect}
                  />
                  <button 
                    type="button"
                    disabled={isPosting || isCompressing || selectedImages.length >= 1}
                    onClick={() => fileInputRef.current?.click()}
                    title={selectedImages.length >= 1 ? '每篇貼文最多 1 張圖片' : '上傳圖片'}
                    className="p-2.5 text-text-muted hover:text-bio-glow hover:bg-white/5 rounded-xl transition-all cursor-pointer flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isCompressing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Waves className="w-5 h-5" />
                      </motion.div>
                    ) : <ImageIcon className="w-5 h-5" />}
                    <span className="text-[0.625rem] font-bold uppercase tracking-widest hidden sm:inline">
                      {isCompressing ? '處理中...' : `上傳圖片 (${selectedImages.length}/1)`}
                    </span>
                  </button>
                  <span className="hidden sm:inline text-[0.5625rem] text-text-muted/70 font-bold">
                    JPG / PNG / WebP，10MB 以下
                  </span>
                </div>
                <button 
                  disabled={(!newPostContent.trim() && selectedImages.length === 0) || isPosting || countChars(newPostContent) > POST_CHAR_LIMIT}
                  className="bg-stone-100 text-deep-ocean px-8 py-2 rounded-xl font-bold hover:bg-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-black/20 cursor-pointer active:scale-95"
                >
                  {isPosting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Waves className="w-4 h-4" />
                    </motion.div>
                  ) : <Send className="w-4 h-4" />}
                  <span>{isPosting ? '傳送中' : '發佈'}</span>
                </button>
              </div>

              {/* Delicate Progress Bar */}
              <AnimatePresence>
                {isPosting && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden pt-4 border-t border-white/5"
                  >
                    <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden relative">
                      <motion.div 
                        className="absolute top-0 left-0 h-full bg-bio-glow shadow-[0_0_8px_var(--primary-glow)]"
                        initial={{ width: "0%" }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                      />
                      {/* Shine reflect */}
                      <motion.div 
                        className="absolute top-0 left-0 h-full w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        animate={{ x: ['-100%', '300%'] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-2 px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-bio-glow animate-pulse" />
                        <span className="text-[0.5625rem] text-bio-glow font-bold uppercase tracking-widest opacity-80">
                          {postingMessage || '正在同步到群島中心...'}
                        </span>
                      </div>
                      <span className="text-[0.5625rem] font-mono text-text-muted font-bold">
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.form>
          )}

          {/* Feed */}
          <div className="space-y-8">
            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-mist/20 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-text-main">為你推薦</p>
                <p className="text-[0.625rem] text-text-muted">新的內容會優先出現；站務處理中的內容會保留提示，不公開原文。</p>
              </div>
              <Compass className="w-5 h-5 text-bio-glow/70" />
            </div>
            <AnimatePresence>
              {visibleFeedPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  discussionTarget={discussionTarget?.postId === post.id ? discussionTarget : null}
                  onOpenProfile={handleOpenProfile}
                  onShare={handleShare}
                />
              ))}
            </AnimatePresence>
            
            {visibleFeedPosts.length === 0 && (
              <div className="text-center py-24 text-text-muted/70 space-y-4">
                <div className="relative inline-block">
                  <Search className="w-16 h-16 mx-auto opacity-10" />
                  <Waves className="absolute inset-0 w-16 h-16 opacity-5 animate-pulse" />
                </div>
                <p className="font-display tracking-widest text-xs uppercase opacity-40">此處尚無動態</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - PC Only */}
        <aside className="hidden lg:block shrink-0 w-72 space-y-6">
          <div className="sticky top-24 space-y-6">
            {/* Islanders Stats */}
            <div className="glass-card rounded-3xl p-6 border-line">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">活躍島民</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[0.625rem] text-emerald-500 font-mono">LIVE</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-deep-ocean bg-mist flex items-center justify-center overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=islander${i}`} className="w-full h-full opacity-60" />
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.625rem] text-text-muted font-medium">🟢 目前 {onlineCount} 位島民在線</p>
                </div>
              </div>
            </div>

            {/* Local Topics */}
            <div className="glass-card rounded-3xl p-6 border-line">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">在地話題</h3>
              <div className="space-y-3">
                {LOCAL_TOPIC_SHORTCUTS.slice(0, 5).map((topic) => (
                  <button
                    key={topic.label}
                   onClick={() => setActiveCategory(topic.label)}
                    className="w-full flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="w-3.5 h-3.5 text-bio-glow/50 group-hover:text-bio-glow transition-colors" />
                      <div className="flex flex-col items-start translate-y-0.5">
                        <span className="text-sm text-text-muted font-bold group-hover:text-text-main transition-colors">{topic.label}</span>
                        <span className="text-[0.5625rem] text-text-muted uppercase tracking-widest mt-0.5">近期討論</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted/40 group-hover:text-bio-glow transform group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>

            {/* Support Message */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-white/5 space-y-3">
              <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                <Waves className="w-4 h-4" />
                守護馬祖數位空間
              </h4>
              <p className="text-[0.6875rem] text-text-muted leading-relaxed italic">
                「馬祖小站」是一個社群專案，我們致力於提供一個乾淨、多元的在地發聲管道。
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <a
                  href="/support"
                  className="text-left text-[0.625rem] text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
                >
                  <Plus className="w-3 h-3 text-bio-glow" /> 關於本站與贊助支持
                </a>
              </div>
            </div>

          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-line text-center text-text-muted text-sm space-y-8">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:flex sm:items-center sm:justify-center gap-x-8 gap-y-4 text-[0.625rem] sm:text-[0.6875rem] font-bold uppercase tracking-[0.1em] opacity-80">
           <a href="/terms" className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">服務條款</a>
           <a href="/privacy" className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">隱私權政策</a>
           <a href="/community-guidelines" className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">社群規範</a>
           <a href="/moderation" className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">檢舉與審核說明</a>
           <a href={LINE_OFFICIAL_URL} target="_blank" rel="noopener noreferrer" className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">聯絡方式</a>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 opacity-60">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-bio-glow" />
            <p className="text-text-main font-display tracking-tight text-xs sm:text-sm">© 2026 馬祖小站 (Matsu Station). 為群島靈魂而生。</p>
          </div>
          <p className="text-[0.5625rem] text-text-muted max-w-xs mx-auto leading-relaxed">
            Matsu Station 不代表任何官方立場。本站所有內容均由使用者提供，其法律責任由發表者自負。
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-deep-ocean/95 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-4 px-2 py-2">
          <button
            type="button"
            onClick={() => {
              setActiveCategory('全部');
              setSearchQuery('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.625rem] font-bold text-text-muted hover:text-bio-glow active:scale-95"
          >
            <Waves className="w-5 h-5" />
            首頁
          </button>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                handleLogin();
                return;
              }
              document.getElementById('post-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.625rem] font-bold text-text-muted hover:text-bio-glow active:scale-95"
          >
            <Send className="w-5 h-5" />
            發文
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowSettingsMenu(false);
            }}
            className="relative flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.625rem] font-bold text-text-muted hover:text-bio-glow active:scale-95"
          >
            <Bell className="w-5 h-5" />
            {notifications.some(n => !n.read) && (
              <span className="absolute top-1 right-[calc(50%-12px)] h-2 w-2 rounded-full bg-rose-500" />
            )}
            通知
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(true);
              setShowNotifications(false);
            }}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.625rem] font-bold text-text-muted hover:text-bio-glow active:scale-95"
          >
            <Menu className="w-5 h-5" />
            分類
          </button>
        </div>
      </nav>

      {/* Share Modal */}
      <AnimatePresence>
        {sharingPost && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSharingPost(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-card w-full max-w-xs rounded-[2.5rem] overflow-hidden shadow-2xl border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-line flex items-center justify-between bg-mist">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-bio-glow/20 rounded-xl">
                    <Share2 className="w-5 h-5 text-bio-glow" />
                  </div>
                  <div>
                    <h2 className="text-text-main font-bold text-base">分享貼文</h2>
                    <p className="text-text-muted text-[0.625rem] uppercase tracking-widest font-bold">Spread the news</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSharingPost(null)}
                  className="p-2 hover:bg-mist-light rounded-full text-text-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}?post=${sharingPost.id}`)}`;
                    window.open(url, '_blank');
                  }}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 transition-all group active:scale-95"
                >
                  <Facebook className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[0.625rem] font-bold text-blue-400 uppercase tracking-widest">Facebook</span>
                </button>

                <button 
                  onClick={() => {
                    // Instagram doesn't have a direct share link, so we provide an external link 
                    // and invite them to copy link first.
                    window.open('https://www.instagram.com/', '_blank');
                  }}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-600/20 transition-all group active:scale-95"
                >
                  <Instagram className="w-6 h-6 text-rose-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[0.625rem] font-bold text-rose-400 uppercase tracking-widest">Instagram</span>
                </button>

                <button 
                  onClick={() => copyToClipboard(`${window.location.origin}?post=${sharingPost.id}`)}
                  className="col-span-2 flex items-center justify-between gap-3 p-4 rounded-3xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group active:scale-95"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-mist-medium rounded-xl group-hover:bg-bio-glow/20 transition-colors">
                      {isCopied ? <Check className="w-4 h-4 text-bio-glow" /> : <Copy className="w-4 h-4 text-text-muted" />}
                    </div>
                    <span className="text-xs font-bold text-text-main">複製貼文連結</span>
                  </div>
                  <div className="text-[0.5625rem] font-mono text-text-muted truncate max-w-[100px]">
                    {window.location.origin.replace('https://', '')}...
                  </div>
                </button>

                <button 
                  onClick={() => {
                    const url = `${window.location.origin}?post=${sharingPost.id}`;
                    const text = `嘿！來看看馬祖小站上的這篇貼文：\n\n"${sharingPost.content.substring(0, 50)}..."\n\n連結：${url}`;
                    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="col-span-2 flex items-center gap-3 p-4 rounded-3xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/20 transition-all group active:scale-95"
                >
                  <div className="p-2 bg-emerald-500/20 rounded-xl">
                    <ExternalLink className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="text-xs font-bold text-emerald-400">分享至 LINE</span>
                </button>
              </div>

              <div className="px-6 pb-6 text-center">
                <p className="text-[0.5625rem] text-text-muted leading-relaxed font-medium">
                  站長提醒：分享愉快，請遵守島嶼規範。
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Weather Detail Modal */}
      <AnimatePresence>
        {showWeatherModal && weather && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWeatherModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass-card rounded-[32px] p-8 border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setShowWeatherModal(false)} className="p-2 text-text-muted hover:text-text-main transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-3xl bg-bio-glow/10 flex items-center justify-center border border-bio-glow/20">
                  {weather.icon === 'Sun' && <Sun className="w-10 h-10 text-amber-400" />}
                  {weather.icon === 'Cloud' && <Cloud className="w-10 h-10 text-text-muted" />}
                  {weather.icon === 'CloudRain' && <CloudRain className="w-10 h-10 text-blue-400" />}
                  {weather.icon === 'Snowflake' && <Snowflake className="w-10 h-10 text-text-main" />}
                  {weather.icon === 'CloudLightning' && <CloudLightning className="w-10 h-10 text-yellow-500" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-text-main">馬祖航空氣象</h2>
                  <p className="text-text-muted text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> 南竿 / 北竿機場
                  </p>
                  <p className="mt-1 text-[0.6875rem] font-mono font-bold text-bio-glow/80">
                    最近更新：{formatWeatherUpdatedAt(weather.fetchedAtIso, 'full')}｜約每 5 分鐘更新
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">目前溫度</span>
                  <span className="text-xl font-mono font-bold text-text-main">{weather.temp != null ? `${weather.temp}°C` : '未提供'}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">天氣概況</span>
                  <span className="text-xl font-bold text-text-main">{weather.text}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">目前風向</span>
                  <span className="text-xl font-bold text-text-main flex items-center gap-1"><Wind className="w-4 h-4 text-bio-glow" /> {weather.dir}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">風速</span>
                  <span className="text-xl font-mono font-bold text-text-main">{weather.wind != null ? `${weather.wind} 節` : '未提供'}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">主要雲層</span>
                  <span className="text-xl font-mono font-bold text-text-main">{weather.ceilingText || '未提供'}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">能見度</span>
                  <span className="text-xl font-bold text-text-main flex items-center gap-1"><Eye className="w-4 h-4 text-bio-glow" /> {weather.visibilityText || '未提供'}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-main">南竿機場雲高</h4>
                      <p className="text-[0.6875rem] text-indigo-400/60">Nangan Airport Ceiling</p>
                    </div>
                  </div>
                  <div className="text-right text-xs font-bold leading-relaxed">
                    <div className="text-text-main">雲冪：{weather.airports?.nangan?.ceilingText || '未提供'}</div>
                    <div className="text-text-muted">氣象門檻：{weather.airports?.nangan?.flightAllowed ? '目前未低於標準' : '注意條件'}</div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-main">北竿機場雲高</h4>
                      <p className="text-[0.6875rem] text-blue-400/60">Beigan Airport Ceiling</p>
                    </div>
                  </div>
                  <div className="text-right text-xs font-bold leading-relaxed">
                    <div className="text-text-main">雲冪：{weather.airports?.beigan?.ceilingText || '未提供'}</div>
                    <div className="text-text-muted">氣象門檻：{weather.airports?.beigan?.flightAllowed ? '目前未低於標準' : '注意條件'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-[0.625rem] text-text-muted opacity-60 font-mono italic">
                  資料來源：{weather.source || '民用航空局飛航服務總臺航空氣象服務網'}；{weather.notice || '飛航條件請以航空站及航空公司公告為準'}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transport Status Modal (Flight/Ferry) */}
      <AnimatePresence>
        {showTransportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransportModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative flex max-h-[88vh] w-full max-w-5xl flex-col glass-card rounded-[32px] p-8 border-white/10 shadow-2xl"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setShowTransportModal(null)} className="p-2 text-text-muted hover:text-text-main transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 mb-8">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border ${
                  showTransportModal === 'flight' ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  {showTransportModal === 'flight' ? <Plane className="w-8 h-8 text-indigo-400" /> : <Ship className="w-8 h-8 text-emerald-400" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-text-main">{showTransportModal === 'flight' ? '馬祖空運官方查詢' : '馬祖海運官方查詢'}</h2>
                  <p className="text-text-muted text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-3 h-3 text-bio-glow" /> {new Date().toLocaleTimeString('zh-TW')} 開啟
                  </p>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto pr-1 custom-scrollbar">
              {showTransportModal === 'flight' ? (
                <div className="space-y-4">
                   {flightStatus?.ok && (
                     <div className="rounded-2xl border border-indigo-400/10 bg-indigo-500/5 p-4">
                       <div className="mb-3 flex items-center justify-between gap-3">
                         <span className="text-xs font-bold text-indigo-200">馬祖航空站快取</span>
                         <span className="text-[0.625rem] font-mono text-text-muted">
                           {formatTransportUpdatedAt(flightStatus.updatedAt)} 更新
                         </span>
                       </div>
                       <p className="text-xs leading-relaxed text-text-muted">{flightStatus.notice}</p>
                     </div>
                   )}

                   <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[0.625rem] font-bold">LZN</span>
                            <div>
                              <span className="text-sm font-bold text-text-main">南竿機場 (Nangan)</span>
                              {flightStatus?.ok && (
                                <p className="mt-1 text-[0.6875rem] text-text-muted">{getAirportSummaryText(flightStatus.airports?.nangan)}</p>
                              )}
                            </div>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                            <Info className="h-3.5 w-3.5" />
                            以官方為準
                         </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[0.625rem] font-bold">MFK</span>
                            <div>
                              <span className="text-sm font-bold text-text-main">北竿機場 (Beigan)</span>
                              {flightStatus?.ok && (
                                <p className="mt-1 text-[0.6875rem] text-text-muted">{getAirportSummaryText(flightStatus.airports?.beigan)}</p>
                              )}
                            </div>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                            <Info className="h-3.5 w-3.5" />
                            以官方為準
                         </span>
                      </div>
                   </div>

                   {flightStatus?.ok && (
                     <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                       <h4 className="mb-3 text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">航空站今日航班</h4>
                       <div className="space-y-5">
                         {[
                           { label: '南竿', airport: flightStatus.airports?.nangan },
                           { label: '北竿', airport: flightStatus.airports?.beigan },
                         ].map(group => (
                           <div key={group.label} className="space-y-3">
                             <p className="text-[0.6875rem] font-bold text-indigo-300">{group.label}機場</p>
                             {[
                               { title: '離站班機', placeLabel: '飛往', timeLabel: '實際起飛', rows: getFlightRowsByDirection(group.airport, 'departure') },
                               { title: '到站班機', placeLabel: '來自', timeLabel: '實際抵達', rows: getFlightRowsByDirection(group.airport, 'arrival') },
                             ].map(section => (
                               <div key={`${group.label}-${section.title}`} className="overflow-hidden rounded-lg border border-white/5 bg-mist/30">
                                 <div className="border-b border-white/5 bg-white/5 px-3 py-2 text-[0.6875rem] font-bold text-text-main">{section.title}</div>
                                 <div className="grid grid-cols-[1.1fr_1fr_1fr_0.9fr_0.9fr] gap-2 border-b border-white/5 px-3 py-2 text-[0.5625rem] font-bold uppercase tracking-wider text-text-muted">
                                   <span>航空公司</span>
                                   <span>航班編號</span>
                                   <span>{section.placeLabel}</span>
                                   <span>{section.timeLabel}</span>
                                   <span>狀態</span>
                                 </div>
                                 {section.rows.length > 0 ? section.rows.map((row: any) => (
                                   <div key={`${group.label}-${section.title}-${row.flightNo}-${row.time}`} className="grid grid-cols-[1.1fr_1fr_1fr_0.9fr_0.9fr] gap-2 px-3 py-2 text-[0.6875rem] text-text-main odd:bg-black/5">
                                     <span className="font-bold">{row.airline}</span>
                                     <span className="font-mono font-bold text-indigo-300">{row.flightNo}</span>
                                     <span className="text-text-muted">{row.place}</span>
                                     <span className="font-mono text-text-muted">{row.rawTime || String(row.time || '').replace(':', '')}</span>
                                     <span className="font-bold">{row.statusText || row.status}</span>
                                   </div>
                                 )) : (
                                   <p className="px-3 py-2 text-[0.6875rem] text-text-muted">尚未取得{section.title}資料</p>
                                 )}
                               </div>
                             ))}
                           </div>
                         ))}
                       </div>
                     </div>
                   )}

                   <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-200">
                        <AlertCircle className="h-4 w-4" />
                        飛航狀態不由本站判定
                      </h4>
                      <p className="text-xs leading-relaxed text-text-muted">
                        馬祖航班常受低雲、濃霧、能見度與機場關場影響。本站不判定準點或可否飛航，請開啟馬祖航空站查看南竿、北竿即時航班。
                      </p>
                   </div>
                </div>
              ) : (
                <div className="space-y-4">
                   {ferryStatus?.ok && (
                     <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/5 p-4">
                       <div className="mb-3 flex items-center justify-between gap-3">
                         <span className="text-xs font-bold text-emerald-200">航港局船班快取</span>
                         <span className="text-[0.625rem] font-mono text-text-muted">
                           {formatTransportUpdatedAt(ferryStatus.updatedAt)} 更新
                         </span>
                       </div>
                       <p className="text-xs leading-relaxed text-text-muted">{ferryStatus.notice}</p>
                     </div>
                   )}

                   <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[0.625rem] font-bold">TPE-LZN</span>
                            <div>
                              <span className="text-sm font-bold text-text-main">基隆-馬祖定期船班</span>
                              {ferryStatus?.ok && (
                                <p className="mt-1 text-[0.6875rem] text-text-muted">{getFerrySummaryText()}</p>
                              )}
                            </div>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                            <Info className="h-3.5 w-3.5" />
                            以官方為準
                         </span>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[0.625rem] font-bold">ISL</span>
                            <span className="text-sm font-bold text-text-main">含東引、南竿福澳與基隆航段</span>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                            <Info className="h-3.5 w-3.5" />
                            以公告為準
                         </span>
                      </div>
                   </div>

                   {ferryStatus?.ok && (
                     <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                       <div className="mb-3 space-y-1">
                         <h4 className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">基隆-馬祖船班表</h4>
                         <p className="text-xs font-bold text-text-main">{getFerryQueryRangeText()}，航線名稱：基隆-馬祖</p>
                         <p className="text-[0.6875rem] leading-relaxed text-amber-200">*航班表為定期班表，僅供參考，如欲查詢最新航班資訊，請逕洽各航運業者。</p>
                       </div>
                       <div className="overflow-x-auto rounded-lg border border-white/5 bg-mist/30 custom-scrollbar">
                         <div className="min-w-[980px]">
                           <div className="grid grid-cols-[1.45fr_0.9fr_1.55fr_0.9fr_1.05fr_1.05fr_0.9fr_1.15fr_0.8fr] gap-2 border-b border-white/5 bg-white/5 px-3 py-2 text-[0.5625rem] font-bold uppercase tracking-wider text-text-muted">
                             <span>營運公司</span>
                             <span>聯絡方式</span>
                             <span>航線</span>
                             <span>船舶</span>
                             <span>開航時間</span>
                             <span>抵達時間</span>
                             <span>有效期限</span>
                             <span>出發港 → 目的港</span>
                             <span>備註</span>
                           </div>
                           {ferryScheduleRows.length > 0 ? ferryScheduleRows.map((row: any) => (
                             <div key={`${row.ship}-${row.departureDate}-${row.departureTime}-${row.from}-${row.to}`} className="grid grid-cols-[1.45fr_0.9fr_1.55fr_0.9fr_1.05fr_1.05fr_0.9fr_1.15fr_0.8fr] gap-2 px-3 py-2 text-[0.6875rem] text-text-main odd:bg-black/5">
                               <span className="text-text-muted">{row.company || '未提供'}</span>
                               <span className="font-mono text-text-muted">{row.contact || '-'}</span>
                               <span className="text-text-muted">{row.route || '-'}</span>
                               <span className="font-bold text-emerald-300">{row.ship}</span>
                               <span className="font-mono">{row.departureDate}<br />{row.departureTime}</span>
                               <span className="font-mono text-text-muted">{row.arrivalDate}<br />{row.arrivalTime}</span>
                               <span className="text-text-muted">{row.validUntil || '-'}</span>
                               <span className="font-bold">{row.from}<br /><span className="text-emerald-300">↓</span><br />{row.to}</span>
                               <span className="text-text-muted">{row.note || '-'}</span>
                             </div>
                           )) : (
                             <p className="px-3 py-2 text-[0.6875rem] text-text-muted">尚未取得船班表資料</p>
                           )}
                         </div>
                       </div>
                       <p className="mt-3 text-[0.6875rem] font-bold text-text-muted">
                         共 {ferryStatus?.summary?.total || ferryScheduleRows.length} 筆資料，已整合官方分頁資料
                       </p>
                     </div>
                   )}

                   <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-200">
                        <AlertCircle className="h-4 w-4" />
                        船班會因歲修與海象異動
                      </h4>
                      <p className="text-xs text-text-muted leading-relaxed italic">
                        本站不判定開航狀態。臺馬之星、新臺馬輪與島際船班請以船公司、訂位系統與官方公告為準。
                      </p>
                   </div>
                </div>
              )}
              </div>

              <div className="mt-8 flex gap-3">
                 <a
                   href={showTransportModal === 'flight' ? MATSU_AIRPORT_URL : MOTCMPB_FERRY_URL}
                   target="_blank"
                   rel="noreferrer"
                   className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-mist-medium py-3 text-xs font-bold text-text-main transition-all hover:bg-mist"
                 >
                   官網詳情
                   <ExternalLink className="h-3.5 w-3.5" />
                 </a>
                 <button onClick={() => setShowTransportModal(null)} className="flex-1 py-3 bg-mist/50 hover:bg-mist text-text-muted hover:text-text-main rounded-xl text-xs font-bold transition-all border border-line">關閉視窗</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PostCard({
  post,
  discussionTarget,
  onOpenProfile,
  onShare,
}: {
  post: Post;
  discussionTarget?: DiscussionTarget | null;
  onOpenProfile: (uid: string) => void;
  onShare: (post: Post) => void;
}) {
  const { user, profile } = useAuth();
  const [selectedReaction, setSelectedReaction] = useState<string | null>(null);
  const [likes, setLikes] = useState(post.likesCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentReactions, setCommentReactions] = useState<Record<string, string>>({});
  const [replyReactions, setReplyReactions] = useState<Record<string, string>>({});
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [postMaskExpanded, setPostMaskExpanded] = useState(false);
  const [expandedMaskedComments, setExpandedMaskedComments] = useState<Record<string, boolean>>({});
  const [expandedMaskedReplies, setExpandedMaskedReplies] = useState<Record<string, boolean>>({});
  const [highlightedDiscussionId, setHighlightedDiscussionId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [submittingReplyIds, setSubmittingReplyIds] = useState<Record<string, boolean>>({});
  const isSubmittingCommentRef = React.useRef(false);
  const submittingReplyIdsRef = React.useRef<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportReasonCategory, setReportReasonCategory] = useState(REPORT_REASON_OPTIONS[0]);
  const [reportReasonDetail, setReportReasonDetail] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<any>(null);
  const commentsUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const repliesUnsubscribeRef = React.useRef<Record<string, () => void>>({});
  const postIsModerationHidden = isModerationHidden(post.moderationStatus);
  const postIsModerationMasked = isModerationMasked(post.moderationStatus);
  const postContentVisible = !postIsModerationHidden && (!postIsModerationMasked || postMaskExpanded);

  React.useEffect(() => {
    if (user && !post.id.startsWith('sample-')) {
      const likePath = `posts/${post.id}/likes/${user.uid}`;
      const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
      getDoc(likeRef)
        .then(snap => setSelectedReaction(snap.exists() ? (snap.data().reaction || null) : null))
        .catch(error => {
          console.warn('Like status fetch failed (likely offline or missing doc):', error.message);
        });
    }
  }, [user, post.id]);

  React.useEffect(() => {
    // Fetch author title if possible
    if (!user || !post.authorId || post.authorId === 'system' || post.id.startsWith('sample-')) return;
    
    const authorRef = doc(db, 'users', post.authorId);
    getDoc(authorRef)
      .then(snap => {
        if (snap.exists()) setAuthorProfile(snap.data());
      })
      .catch(err => {
        console.warn('Author profile fetch failed:', err.message);
      });
  }, [user, post.authorId, post.id]);

  React.useEffect(() => {
    return () => {
      commentsUnsubscribeRef.current?.();
      Object.values(repliesUnsubscribeRef.current).forEach(unsubscribe => unsubscribe());
      repliesUnsubscribeRef.current = {};
    };
  }, []);

  const handleReaction = async (reaction: string) => {
    if (!user) {
      alert("請登入後再使用表情反應。");
      return;
    }
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能互動。');
      return;
    }
    
    if (post.id.startsWith('sample-')) {
      alert("這是範例貼文，無法進行互動。請發布您自己的貼文後再試！");
      return;
    }

    const likePath = `posts/${post.id}/likes/${user.uid}`;
    const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
    const previousReaction = selectedReaction;
    const isRemovingReaction = previousReaction === reaction;
    const isNewReaction = !previousReaction;

    try {
      if (isRemovingReaction) {
        setSelectedReaction(null);
        setLikes(prev => Math.max(0, prev - 1));
        await deleteDoc(likeRef);
      } else {
        setSelectedReaction(reaction);
        if (isNewReaction) setLikes(prev => prev + 1);
        await setDoc(likeRef, {
          reaction,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (err: any) {
      console.error(err);
      // Revert state on error
      setSelectedReaction(previousReaction);
      if (isRemovingReaction) {
        setLikes(prev => prev + 1);
      } else if (isNewReaction) {
        setLikes(prev => Math.max(0, prev - 1));
      }
      
      if (err.message.includes('permission-denied') || err.message.includes('insufficient permissions')) {
        alert("操作失敗：目前功能權限尚未開放，請稍後再試或回報站長。");
      } else {
        alert("操作失敗，可能是網路連線問題或小站服務暫時不可用。");
      }
      handleFirestoreError(err, OperationType.WRITE, likePath);
    }
  };

  const getCommentTime = (comment: Comment) => {
    if (comment.createdAt?.toMillis) return comment.createdAt.toMillis();
    if (comment.createdAt?.toDate) return comment.createdAt.toDate().getTime();
    if (typeof comment.createdAt?.seconds === 'number') return comment.createdAt.seconds * 1000;
    return 0;
  };

  const sortTopLevelComments = (items: Comment[]) => {
    return [...items].sort((a, b) => {
      const likeDiff = (b.likesCount || 0) - (a.likesCount || 0);
      if (likeDiff !== 0) return likeDiff;
      return getCommentTime(b) - getCommentTime(a);
    });
  };

  const closeReplySubscriptions = () => {
    Object.values(repliesUnsubscribeRef.current).forEach(unsubscribe => unsubscribe());
    repliesUnsubscribeRef.current = {};
  };

  const getReplyLikeKey = (commentId: string, replyId: string) => `${commentId}:${replyId}`;

  const closeComments = () => {
    commentsUnsubscribeRef.current?.();
    commentsUnsubscribeRef.current = null;
    closeReplySubscriptions();
    setComments([]);
    setCommentReactions({});
    setReplyReactions({});
    setReplyingToCommentId(null);
    setReplyInputs({});
    setShowComments(false);
  };

  const openComments = () => {
    if (post.id.startsWith('sample-')) {
      setShowComments(true);
      setComments([]);
      return;
    }
    
    setShowComments(true);
    const commentsPath = `posts/${post.id}/comments`;
    try {
      commentsUnsubscribeRef.current?.();
      closeReplySubscriptions();
      const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const nextComments = sortTopLevelComments(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment))
        );
        const liveCommentIds = new Set(nextComments.map(comment => comment.id));

        Object.entries(repliesUnsubscribeRef.current).forEach(([commentId, unsubscribeReplies]) => {
          if (!liveCommentIds.has(commentId)) {
            unsubscribeReplies();
            delete repliesUnsubscribeRef.current[commentId];
          }
        });

        setComments(previousComments => {
          const repliesByCommentId = new Map(previousComments.map(comment => [comment.id, comment.replies || []]));
          return nextComments.map(comment => ({
            ...comment,
            replies: repliesByCommentId.get(comment.id) || [],
          }));
        });

        if (user) {
          Promise.all(
            nextComments.map(async comment => {
              const likeSnap = await getDoc(doc(db, 'posts', post.id, 'comments', comment.id, 'likes', user.uid));
              return [comment.id, likeSnap.exists() ? (likeSnap.data().reaction || '') : ''] as const;
            })
          )
            .then(entries => {
              const nextReactions = Object.fromEntries(entries.filter(([, reaction]) => Boolean(reaction)));
              setCommentReactions(nextReactions);
            })
            .catch(error => {
              console.warn('Comment like status fetch failed:', error.message);
            });
        } else {
          setCommentReactions({});
          setReplyReactions({});
        }

        nextComments.forEach(comment => {
          if (repliesUnsubscribeRef.current[comment.id]) return;

          const repliesQuery = query(
            collection(db, 'posts', post.id, 'comments', comment.id, 'replies'),
            orderBy('createdAt', 'asc')
          );

          repliesUnsubscribeRef.current[comment.id] = onSnapshot(repliesQuery, (repliesSnapshot) => {
            const replies = repliesSnapshot.docs.map(replyDoc => ({
              id: replyDoc.id,
              ...replyDoc.data(),
            } as CommentReply));

            if (user) {
              Promise.all(
                replies.map(async reply => {
                  const likeSnap = await getDoc(doc(db, 'posts', post.id, 'comments', comment.id, 'replies', reply.id, 'likes', user.uid));
                  return [getReplyLikeKey(comment.id, reply.id), likeSnap.exists() ? (likeSnap.data().reaction || '') : ''] as const;
                })
              )
                .then(entries => {
                  const nextReactions = Object.fromEntries(entries.filter(([, reaction]) => Boolean(reaction)));
                  setReplyReactions(previous => ({ ...previous, ...nextReactions }));
                })
                .catch(error => {
                  console.warn('Reply like status fetch failed:', error.message);
                });
            }

            setComments(previousComments => sortTopLevelComments(
              previousComments.map(existingComment => (
                existingComment.id === comment.id
                  ? { ...existingComment, replies }
                  : existingComment
              ))
            ));
          }, (error) => {
            console.warn('Replies fetch failed:', error.message);
          });
        });
      }, (error) => {
        console.warn('Comments fetch failed:', error.message);
      });
      commentsUnsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.warn('Comments effect failed:', error);
    }
  };

  const fetchComments = () => {
    if (showComments) {
      closeComments();
      return;
    }

    openComments();
  };

  React.useEffect(() => {
    if (!discussionTarget || discussionTarget.postId !== post.id) return;
    if (!discussionTarget.openComments && !discussionTarget.commentId && !discussionTarget.replyId) return;
    if (!showComments) openComments();
  }, [discussionTarget?.nonce]);

  React.useEffect(() => {
    if (!discussionTarget || discussionTarget.postId !== post.id) return;

    const targetElementId = discussionTarget.replyId
      ? `reply-${discussionTarget.replyId}`
      : discussionTarget.commentId
        ? `comment-${discussionTarget.commentId}`
        : `post-${discussionTarget.postId}`;
    const element = document.getElementById(targetElementId);

    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedDiscussionId(targetElementId);

    const clearHighlight = window.setTimeout(() => {
      setHighlightedDiscussionId(previous => previous === targetElementId ? null : previous);
    }, 2400);

    return () => window.clearTimeout(clearHighlight);
  }, [discussionTarget?.nonce, showComments, comments, post.id]);

  const getCommentRateLimitMessage = (label = '留言') => {
    if (!user) return null;
    if (user.uid === STATION_MASTER_UID) return null;

    const now = Date.now();
    const usage = readClientUsage(user.uid, 'comment');
    const actionLabel = label === '回覆' ? '回覆' : '留言';

    const burstCount = usage.filter(value => value >= now - COMMENT_BURST_WINDOW_MS).length;
    if (burstCount >= COMMENT_BURST_LIMIT) {
      return `${ANTI_ABUSE_NOTICE} 短時間內留言太多，請稍後再${actionLabel}。`;
    }

    if (usage.length >= DAILY_COMMENT_LIMIT) {
      return `${ANTI_ABUSE_NOTICE} 每個帳號一天最多 ${DAILY_COMMENT_LIMIT} 則留言/回覆，請明天再發。`;
    }

    return null;
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCommentRef.current) return;
    if (!user || !newComment.trim()) return;
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能留言。');
      return;
    }
    isSubmittingCommentRef.current = true;
    setIsSubmittingComment(true);
    try {
      if (countChars(newComment.trim()) > COMMENT_CHAR_LIMIT) {
        alert(`留言最多 ${COMMENT_CHAR_LIMIT} 字。${ANTI_ABUSE_NOTICE}`);
        return;
      }

      const rateLimitMessage = getCommentRateLimitMessage('留言');
      if (rateLimitMessage) {
        alert(rateLimitMessage);
        return;
      }

      const cleanComment = prepareUserContent(newComment);
      const senderName = profile?.displayName || user.displayName || '匿名島民';
      const createdComment = await submitCommunityContent({
        sourceType: 'comment',
        postId: post.id,
        content: cleanComment,
      });

      setNewComment('');
      recordClientUsage(user.uid, 'comment');

      // Send notification to author
      if (createdComment.status === 'normal' && createdComment.id && user.uid !== post.authorId) {
        try {
          await submitUserNotification({
            recipientId: getNotificationRecipientId(post.authorId),
            type: 'comment',
            postId: post.id,
            category: post.category,
            commentId: createdComment.id,
            title: '收到新的神秘回覆',
            content: `${senderName} 在你的動態下留言了。`,
          });
        } catch (notificationErr) {
          console.warn('Comment notification failed:', notificationErr);
        }
      }
      if (createdComment.status === 'normal' && createdComment.id) {
        try {
          await sendMentionNotifications({
            text: cleanComment,
            senderId: user.uid,
            senderName,
            postId: post.id,
            category: post.category,
            commentId: createdComment.id,
            sourceLabel: '留言中',
          });
        } catch (mentionErr) {
          console.warn('Mention notification failed:', mentionErr);
        }
      }
    } catch (err) {
      console.error(err);
      alert(getSubmissionErrorMessage(err, '留言失敗，請稍後再試。'));
    } finally {
      isSubmittingCommentRef.current = false;
      setIsSubmittingComment(false);
    }
  };

  const handleCommentReaction = async (comment: Comment, reaction: string) => {
    if (!user) {
      alert('請登入後再幫留言加表情反應。');
      return;
    }
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能互動。');
      return;
    }

    if (post.id.startsWith('sample-')) {
      alert('範例留言無法真實互動。');
      return;
    }

    const previousReaction = commentReactions[comment.id] || null;
    const isRemovingReaction = previousReaction === reaction;
    const isNewReaction = !previousReaction;
    const likeChange = isRemovingReaction ? -1 : isNewReaction ? 1 : 0;
    const likeRef = doc(db, 'posts', post.id, 'comments', comment.id, 'likes', user.uid);

    setCommentReactions(previous => {
      const next = { ...previous };
      if (isRemovingReaction) delete next[comment.id];
      else next[comment.id] = reaction;
      return next;
    });
    setComments(previousComments => sortTopLevelComments(
      previousComments.map(existingComment => (
        existingComment.id === comment.id
          ? { ...existingComment, likesCount: Math.max(0, (existingComment.likesCount || 0) + likeChange) }
          : existingComment
      ))
    ));

    try {
      if (isRemovingReaction) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          reaction,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (err: any) {
      setCommentReactions(previous => {
        const next = { ...previous };
        if (previousReaction) next[comment.id] = previousReaction;
        else delete next[comment.id];
        return next;
      });
      setComments(previousComments => sortTopLevelComments(
        previousComments.map(existingComment => (
          existingComment.id === comment.id
            ? { ...existingComment, likesCount: Math.max(0, (existingComment.likesCount || 0) - likeChange) }
            : existingComment
        ))
      ));
      console.error('Comment like failed:', err);
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/comments/${comment.id}`);
    }
  };

  const handleReplyReaction = async (comment: Comment, reply: CommentReply, reaction: string) => {
    if (!user) {
      alert('請登入後再幫回覆加表情反應。');
      return;
    }
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能互動。');
      return;
    }

    if (post.id.startsWith('sample-')) {
      alert('範例回覆無法真實互動。');
      return;
    }

    const replyLikeKey = getReplyLikeKey(comment.id, reply.id);
    const previousReaction = replyReactions[replyLikeKey] || null;
    const isRemovingReaction = previousReaction === reaction;
    const isNewReaction = !previousReaction;
    const likeChange = isRemovingReaction ? -1 : isNewReaction ? 1 : 0;
    const likeRef = doc(db, 'posts', post.id, 'comments', comment.id, 'replies', reply.id, 'likes', user.uid);

    setReplyReactions(previous => {
      const next = { ...previous };
      if (isRemovingReaction) delete next[replyLikeKey];
      else next[replyLikeKey] = reaction;
      return next;
    });
    setComments(previousComments => previousComments.map(existingComment => (
      existingComment.id === comment.id
        ? {
          ...existingComment,
          replies: (existingComment.replies || []).map(existingReply => (
            existingReply.id === reply.id
              ? { ...existingReply, likesCount: Math.max(0, (existingReply.likesCount || 0) + likeChange) }
              : existingReply
          )),
        }
        : existingComment
    )));

    try {
      if (isRemovingReaction) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          reaction,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (err: any) {
      setReplyReactions(previous => {
        const next = { ...previous };
        if (previousReaction) next[replyLikeKey] = previousReaction;
        else delete next[replyLikeKey];
        return next;
      });
      setComments(previousComments => previousComments.map(existingComment => (
        existingComment.id === comment.id
          ? {
            ...existingComment,
            replies: (existingComment.replies || []).map(existingReply => (
              existingReply.id === reply.id
                ? { ...existingReply, likesCount: Math.max(0, (existingReply.likesCount || 0) - likeChange) }
                : existingReply
            )),
          }
          : existingComment
      )));
      console.error('Reply like failed:', err);
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/comments/${comment.id}/replies/${reply.id}`);
    }
  };

  const handleAddReply = async (comment: Comment) => {
    if (!user) return;
    if (submittingReplyIdsRef.current[comment.id]) return;
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能回覆。');
      return;
    }
    const replyText = (replyInputs[comment.id] || '').trim();
    if (!replyText) return;

    submittingReplyIdsRef.current = { ...submittingReplyIdsRef.current, [comment.id]: true };
    setSubmittingReplyIds(previous => ({ ...previous, [comment.id]: true }));
    try {
      if (countChars(replyText) > COMMENT_CHAR_LIMIT) {
        alert(`回覆最多 ${COMMENT_CHAR_LIMIT} 字。${ANTI_ABUSE_NOTICE}`);
        return;
      }

      const rateLimitMessage = getCommentRateLimitMessage('回覆');
      if (rateLimitMessage) {
        alert(rateLimitMessage);
        return;
      }

      const cleanReply = prepareUserContent(replyText);
      const senderName = profile?.displayName || user.displayName || '匿名島民';

      const createdReply = await submitCommunityContent({
        sourceType: 'reply',
        postId: post.id,
        commentId: comment.id,
        content: cleanReply,
      });

      setReplyInputs(previous => ({ ...previous, [comment.id]: '' }));
      setReplyingToCommentId(null);
      recordClientUsage(user.uid, 'comment');

      if (createdReply.status === 'normal' && createdReply.id && user.uid !== comment.authorId) {
        try {
          await submitUserNotification({
            recipientId: getNotificationRecipientId(comment.authorId),
            type: 'comment',
            postId: post.id,
            category: post.category,
            commentId: comment.id,
            replyId: createdReply.id,
            title: '你的留言有新回覆',
            content: `${senderName} 回覆了你的留言。`,
          });
        } catch (notificationErr) {
          console.warn('Reply notification failed:', notificationErr);
        }
      }

      if (createdReply.status === 'normal' && createdReply.id) {
        try {
          await sendMentionNotifications({
            text: cleanReply,
            senderId: user.uid,
            senderName,
            postId: post.id,
            category: post.category,
            commentId: comment.id,
            replyId: createdReply.id,
            sourceLabel: '留言回覆中',
          });
        } catch (mentionErr) {
          console.warn('Reply mention notification failed:', mentionErr);
        }
      }
    } catch (err) {
      console.error(err);
      alert(getSubmissionErrorMessage(err, '回覆失敗，請稍後再試。'));
    } finally {
      const nextSubmittingReplyIds = { ...submittingReplyIdsRef.current };
      delete nextSubmittingReplyIds[comment.id];
      submittingReplyIdsRef.current = nextSubmittingReplyIds;
      setSubmittingReplyIds(previous => {
        const next = { ...previous };
        delete next[comment.id];
        return next;
      });
    }
  };

  const handleDeleteReply = async (comment: Comment, reply: CommentReply) => {
    if (!user || reply.authorId !== user.uid) return;
    if (!window.confirm('確定要刪除這則回覆嗎？')) return;

    try {
      await submitRemoveCommunityContent({
        sourceType: 'reply',
        postId: post.id,
        commentId: comment.id,
        replyId: reply.id,
      });
    } catch (err: any) {
      console.error('Delete reply error:', err);
      alert('刪除回覆失敗：' + getSubmissionErrorMessage(err, '請稍後再試。'));
    }
  };

  const handleDeletePost = async () => {
    console.log('Final deletion call for:', post.id);
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      await submitRemoveCommunityContent({
        sourceType: 'post',
        postId: post.id,
      });
      console.log('Post deleted successfully');
    } catch (err: any) {
      console.error('Delete post error:', err);
      setIsDeleting(false);
      const errorMessage = getSubmissionErrorMessage(err, '請稍後再試。');
      alert('刪除失敗：' + (errorMessage.includes('permission-denied') ? '您沒有權限刪除此貼文。' : errorMessage));
    }
  };

  const handleReportContent = async ({
    targetId,
    targetType,
    commentId,
    replyId,
    preview,
  }: {
    targetId: string;
    targetType: ReportTargetType;
    commentId?: string;
    replyId?: string;
    preview: string;
  }) => {
    if (!user) {
      alert('請先登入後再進行檢舉。');
      return;
    }
    if (!hasAcceptedLatestPolicies(profile)) {
      alert('請先閱讀並同意最新版服務條款、隱私權政策與社群規範，才能檢舉內容。');
      return;
    }

    setReportDraft({ targetId, targetType, commentId, replyId, preview });
    setReportReasonCategory(REPORT_REASON_OPTIONS[0]);
    setReportReasonDetail('');
  };

  const submitReport = async () => {
    if (!reportDraft || isSubmittingReport) return;
    if (!user) {
      alert('請先登入後再進行檢舉。');
      return;
    }

    const cleanCategory = reportReasonCategory.trim() || '其他';
    const cleanDetail = reportReasonDetail.trim().slice(0, 240);
    setIsSubmittingReport(true);

    try {
      await submitContentReport({
        targetId: reportDraft.targetId,
        targetType: reportDraft.targetType,
        postId: post.id,
        ...(reportDraft.commentId ? { commentId: reportDraft.commentId } : {}),
        ...(reportDraft.replyId ? { replyId: reportDraft.replyId } : {}),
        targetPreview: reportDraft.preview.slice(0, 160),
        reasonCategory: cleanCategory,
        reasonDetail: cleanDetail,
      });

      setReportDraft(null);
      setReportReasonDetail('');
      alert('感謝檢舉！站長已收到通知。');
    } catch (err: any) {
      console.error(err);

      if (err.message.includes('permission-denied') || err.message.includes('insufficient permissions')) {
        alert("檢舉失敗：目前功能權限暫時限制寫入，請稍後再試或透過官方 LINE 回報。");
      } else {
        alert('檢舉失敗，請稍後再試。');
      }

      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleReport = async () => {
    await handleReportContent({
      targetId: post.id,
      targetType: 'post',
      preview: post.content,
    });
  };

  const canModerate = user && post.authorId === user.uid;
  const isPostStationMaster = post.authorId === STATION_MASTER_UID;
  const postImageIsHidden = isImageModerationHidden(post.moderationStatus);
  const trustedImageUrls = getTrustedPostImageUrls(post);
  const reportNeedsDetail = reportReasonCategory === '其他';
  const canSubmitReport = Boolean(reportReasonCategory.trim()) && (!reportNeedsDetail || Boolean(reportReasonDetail.trim()));

  return (
    <motion.div 
      id={`post-${post.id}`}
    layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`glass-card rounded-[2rem] shadow-2xl overflow-hidden ${isDeleting ? 'opacity-30 pointer-events-none' : ''}`}
    >
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onOpenProfile(post.authorId)} 
              className="relative group cursor-pointer active:scale-95 transition-transform"
            >
              <UserAvatar 
                p={{ 
                  islanderId: authorProfile?.islanderId || post.authorId, 
                  photoURL: authorProfile?.photoURL || post.authorPhoto,
                  displayName: authorProfile?.displayName || post.authorName,
                  role: isPostStationMaster ? 'admin' : 'user'
                }} 
                className="w-10 h-10 rounded-full" 
              />
              <div className="absolute inset-0 rounded-full border border-line group-hover:border-bio-glow transition-colors" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 
                  onClick={() => onOpenProfile(post.authorId)} 
                  className={`font-bold text-sm leading-none cursor-pointer hover:opacity-80 transition-all ${isPostStationMaster ? 'rgb-text' : 'text-text-main/90 hover:text-bio-glow'}`}
                >
                  {authorProfile?.displayName || post.authorName}
                </h3>
                {isPostStationMaster && (
                  <span className="text-[0.5625rem] bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-1.5 py-0.5 rounded-sm font-black uppercase tracking-tighter shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    站長
                  </span>
                )}
                {authorProfile?.title && !isPostStationMaster && (
                  <span className="text-[0.5625rem] bg-bio-glow/10 text-bio-glow px-1 rounded border border-bio-glow/20 font-black uppercase tracking-tighter">
                    {authorProfile.title}
                  </span>
                )}
                {post.authorId === user?.uid && <span className="text-[0.625rem] bg-blue-500/20 text-blue-300 px-1.5 rounded-full font-bold border border-blue-500/20">你</span>}
              </div>
              <p className="text-[0.625rem] text-text-muted font-display mt-1">
                {post.createdAt?.toDate ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true, locale: zhTW }) : '剛剛'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!canModerate && (
              <button 
                onClick={handleReport}
                className="text-text-muted/60 hover:text-amber-500 transition-all cursor-pointer active:scale-110"
                title="檢舉違規內容"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
            {canModerate && (
              <div className="relative">
                <button 
                  type="button"
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (post.id.startsWith('sample-')) {
                      alert('範例貼文無法真實刪除。');
                      return;
                    }
                    setShowDeleteConfirm(!showDeleteConfirm);
                  }}
                  className={`flex items-center justify-center w-9 h-9 rounded-full transition-all cursor-pointer active:scale-90 ${
                    showDeleteConfirm ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-text-muted hover:text-rose-500 hover:bg-rose-500/10'
                  }`}
                  title="刪除貼文"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4.5 h-4.5" />
                  )}
                </button>

                <AnimatePresence>
                  {showDeleteConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      className="absolute top-full right-0 mt-2 z-[100] min-w-[160px] bg-mist-medium border border-line rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-2 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2 mb-1 border-b border-line">
                        <p className="text-[0.625rem] text-text-muted font-bold uppercase tracking-wider">確定要刪除貼文嗎？</p>
                      </div>
                      <button
                        onClick={handleDeletePost}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition-colors mb-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        永久刪除
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="w-full px-3 py-2 hover:bg-mist-light text-text-muted rounded-lg text-xs font-bold transition-colors"
                      >
                        取消
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <button 
              onClick={() => onShare(post)}
              className="text-text-muted hover:text-text-main transition-all cursor-pointer active:scale-110"
              title="分享貼文"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {postIsModerationHidden ? (
          <ModerationTombstoneNotice
            status={post.moderationStatus}
            reason={post.moderationReason}
            notice={post.moderationPublicNotice || post.moderationReviewNotice}
            contentType="post"
            isAuthor={user?.uid === post.authorId}
          />
        ) : (
          <>
            {postIsModerationMasked && !postMaskExpanded && (
              <ModerationMaskNotice notice={post.moderationPublicNotice || post.moderationMaskNotice} onExpand={() => setPostMaskExpanded(true)} />
            )}
            {postContentVisible && (
              <div className="user-content-text text-text-main/90 leading-relaxed whitespace-pre-wrap selection:bg-blue-500/30">
                {renderContentWithMentions(post.content)}
              </div>
            )}
          </>
        )}

        {postContentVisible && postImageIsHidden && (
          <ImageModerationTombstone reason={post.moderationReason} />
        )}

        {postContentVisible && !postImageIsHidden && trustedImageUrls.length > 0 && (
          <div className={`grid gap-2 ${
            trustedImageUrls.length === 1 ? 'grid-cols-1' : 
            trustedImageUrls.length === 2 ? 'grid-cols-2' : 
            'grid-cols-2 sm:grid-cols-3'
          }`}>
            {trustedImageUrls.map((url, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ scale: 1.02 }}
                className={`overflow-hidden rounded-2xl border border-line shadow-lg ${
                  trustedImageUrls.length === 3 && idx === 0 ? 'sm:col-span-2' : ''
                }`}
              >
                <img 
                  src={url} 
                  alt="" 
                  className="w-full h-full object-cover max-h-[400px] hover:opacity-90 transition-opacity cursor-zoom-in" 
                  referrerPolicy="no-referrer"
                  onClick={() => window.open(url, '_blank')}
                />
              </motion.div>
            ))}
          </div>
        )}

        {postContentVisible && (
        <div className="flex items-center gap-6 pt-5 border-t border-line">
          <ReactionButton
            currentReaction={selectedReaction}
            count={likes}
            onSelect={handleReaction}
            reactionCollectionPath={`posts/${post.id}/likes`}
          />
          <button 
            onClick={fetchComments}
            className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-bio-glow transition-all font-display cursor-pointer active:scale-110"
          >
            <MessageSquare className="w-4 h-4" />
            {post.commentsCount}
          </button>
        </div>
        )}
      </div>

      <AnimatePresence>
        {showComments && postContentVisible && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-mist/20 border-t border-line"
          >
            <div className="p-6 space-y-6">
              {user && (
                <form onSubmit={handleAddComment} className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <MentionComposerInput
                      placeholder="隱密地回覆... @暱稱"
                      maxLength={COMMENT_CHAR_LIMIT}
                      className="w-full bg-mist border border-line rounded-xl px-4 py-2 text-sm text-text-main focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none placeholder:text-text-muted/40"
                      value={newComment}
                      disabled={isSubmittingComment}
                      onChange={(nextValue) => setNewComment(limitChars(nextValue, COMMENT_CHAR_LIMIT))}
                    />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[0.5625rem] text-text-muted/40">避免複製垃圾文、洗文與攻擊</span>
                      <span className={`text-[0.625rem] font-mono font-bold ${
                        countChars(newComment) >= COMMENT_CHAR_LIMIT ? 'text-amber-400' : 'text-text-muted'
                      }`}>
                        字數 {countChars(newComment)}/{COMMENT_CHAR_LIMIT}
                      </span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !newComment.trim()}
                    className="self-start bg-mist/50 text-text-main p-2.5 rounded-xl hover:bg-mist transition-all border border-line cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                    aria-label={isSubmittingComment ? '留言送出中' : '送出留言'}
                  >
                    {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} id={`comment-${comment.id}`} className="space-y-3 scroll-mt-24">
                    <div className="flex gap-3">
                      <button onClick={() => onOpenProfile(comment.authorId)} className="cursor-pointer active:scale-95 transition-transform">
                        <UserAvatar 
                           p={{ 
                             islanderId: comment.authorId,
                             photoURL: comment.authorPhoto,
                             displayName: comment.authorName,
                             role: comment.authorId === STATION_MASTER_UID ? 'admin' : 'user'
                           }} 
                           className="w-7 h-7 rounded-full mt-1 opacity-90 hover:opacity-100 transition-opacity" 
                        />
                      </button>
                      <div className={`flex-1 bg-mist p-4 rounded-2xl border border-line shadow-sm transition-all ${
                        highlightedDiscussionId === `comment-${comment.id}` ? 'ring-2 ring-bio-glow bg-bio-glow/10' : ''
                      }`}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span 
                              onClick={() => onOpenProfile(comment.authorId)} 
                              className={`font-bold text-[0.6875rem] uppercase tracking-wider cursor-pointer hover:opacity-80 transition-all truncate ${comment.authorId === STATION_MASTER_UID ? 'rgb-text' : 'text-text-muted hover:text-bio-glow'}`}
                            >
                              {comment.authorName}
                            </span>
                            {comment.authorId === STATION_MASTER_UID && (
                              <span className="text-[0.5rem] bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-1 rounded-sm font-bold uppercase shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                                站長
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[0.5625rem] text-text-muted font-display">
                              {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { locale: zhTW }) : ''}
                            </span>
                            {(!user || comment.authorId !== user.uid) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleReportContent({
                                    targetId: comment.id,
                                    targetType: 'comment',
                                    commentId: comment.id,
                                    preview: comment.content,
                                  });
                                }}
                                className="text-text-muted hover:text-amber-500 cursor-pointer active:scale-125 transition-transform p-2 rounded-full hover:bg-amber-500/10 -m-1"
                                title="檢舉留言"
                              >
                                <Flag className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(user && comment.authorId === user.uid) && (
                               <button 
                                 onClick={async (e) => {
                                   e.preventDefault();
                                   e.stopPropagation();
                                   if (post.id.startsWith('sample-')) {
                                     alert('範例回覆無法真實刪除。');
                                     return;
                                   }
                                   if(window.confirm('確定要刪除這則留言嗎？')){
                                     try {
                                       await submitRemoveCommunityContent({
                                         sourceType: 'comment',
                                         postId: post.id,
                                         commentId: comment.id,
                                       });
                                     } catch (err: any) {
                                       console.error('Delete comment error:', err);
                                       alert('刪除留言失敗：' + getSubmissionErrorMessage(err, '請稍後再試。'));
                                     }
                                   }
                                 }} 
                                 className="text-text-muted hover:text-rose-500 cursor-pointer active:scale-125 transition-transform p-2 rounded-full hover:bg-rose-500/10 -m-1"
                                 title="刪除留言"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                            )}
                          </div>
                        </div>
                        {isModerationHidden(comment.moderationStatus) ? (
                          <ModerationTombstoneNotice
                            compact
                            status={comment.moderationStatus}
                            reason={comment.moderationReason}
                            notice={comment.moderationPublicNotice || comment.moderationReviewNotice}
                            contentType="comment"
                            isAuthor={user?.uid === comment.authorId}
                          />
                        ) : isModerationMasked(comment.moderationStatus) && !expandedMaskedComments[comment.id] ? (
                          <ModerationMaskNotice
                            compact
                            notice={comment.moderationPublicNotice || comment.moderationMaskNotice}
                            onExpand={() => setExpandedMaskedComments(previous => ({ ...previous, [comment.id]: true }))}
                          />
                        ) : (
                          <p className="user-content-text-sm text-text-main/90 leading-relaxed whitespace-pre-wrap">
                            {renderContentWithMentions(comment.content)}
                          </p>
                        )}
                        {!isModerationHidden(comment.moderationStatus) && (!isModerationMasked(comment.moderationStatus) || expandedMaskedComments[comment.id]) && (
                        <div className="flex items-center gap-4 pt-3">
                          <ReactionButton
                            compact
                            currentReaction={commentReactions[comment.id]}
                            count={comment.likesCount || 0}
                            onSelect={(reaction) => handleCommentReaction(comment, reaction)}
                            reactionCollectionPath={`posts/${post.id}/comments/${comment.id}/likes`}
                          />
                          {user && (
                            <button
                              type="button"
                              onClick={() => setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id)}
                              className="flex items-center gap-1.5 text-[0.6875rem] font-bold text-text-muted hover:text-bio-glow transition-all cursor-pointer active:scale-110"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              回覆{comment.repliesCount ? ` ${comment.repliesCount}` : ''}
                            </button>
                          )}
                        </div>
                        )}
                      </div>
                    </div>

                    {!isModerationHidden(comment.moderationStatus) && (!isModerationMasked(comment.moderationStatus) || expandedMaskedComments[comment.id]) && (
                    <div className="ml-10 space-y-3 border-l border-line/80 pl-4">
                      {(comment.replies || []).map(reply => (
                        <div key={reply.id} id={`reply-${reply.id}`} className="flex gap-2.5 scroll-mt-24">
                          <button onClick={() => onOpenProfile(reply.authorId)} className="cursor-pointer active:scale-95 transition-transform">
                            <UserAvatar 
                              p={{
                                islanderId: reply.authorId,
                                photoURL: reply.authorPhoto,
                                displayName: reply.authorName,
                                role: reply.authorId === STATION_MASTER_UID ? 'admin' : 'user'
                              }}
                              className="w-6 h-6 rounded-full mt-1 opacity-80 hover:opacity-100 transition-opacity"
                            />
                          </button>
                          <div className={`flex-1 rounded-xl border border-line bg-mist/60 px-3 py-2.5 transition-all ${
                            highlightedDiscussionId === `reply-${reply.id}` ? 'ring-2 ring-bio-glow bg-bio-glow/10' : ''
                          }`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  onClick={() => onOpenProfile(reply.authorId)}
                                  className={`font-bold text-[0.625rem] uppercase tracking-wider cursor-pointer hover:opacity-80 truncate ${reply.authorId === STATION_MASTER_UID ? 'rgb-text' : 'text-text-muted hover:text-bio-glow'}`}
                                >
                                  {reply.authorName}
                                </span>
                                {reply.authorId === STATION_MASTER_UID && (
                                  <span className="text-[0.5rem] bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-1 rounded-sm font-bold uppercase">
                                    站長
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[0.5625rem] text-text-muted font-display">
                                  {reply.createdAt?.toDate ? formatDistanceToNow(reply.createdAt.toDate(), { locale: zhTW }) : ''}
                                </span>
                                {(!user || reply.authorId !== user.uid) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleReportContent({
                                        targetId: reply.id,
                                        targetType: 'reply',
                                        commentId: comment.id,
                                        replyId: reply.id,
                                        preview: reply.content,
                                      });
                                    }}
                                    className="text-text-muted hover:text-amber-500 cursor-pointer active:scale-125 transition-transform p-1.5 rounded-full hover:bg-amber-500/10 -m-1"
                                    title="檢舉回覆"
                                  >
                                    <Flag className="w-3 h-3" />
                                  </button>
                                )}
                                {(user && reply.authorId === user.uid) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteReply(comment, reply)}
                                    className="text-text-muted hover:text-rose-500 cursor-pointer active:scale-125 transition-transform p-1.5 rounded-full hover:bg-rose-500/10 -m-1"
                                    title="刪除回覆"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isModerationHidden(reply.moderationStatus) ? (
                              <ModerationTombstoneNotice
                                compact
                                status={reply.moderationStatus}
                                reason={reply.moderationReason}
                                notice={reply.moderationPublicNotice || reply.moderationReviewNotice}
                                contentType="reply"
                                isAuthor={user?.uid === reply.authorId}
                              />
                            ) : isModerationMasked(reply.moderationStatus) && !expandedMaskedReplies[reply.id] ? (
                              <ModerationMaskNotice
                                compact
                                notice={reply.moderationPublicNotice || reply.moderationMaskNotice}
                                onExpand={() => setExpandedMaskedReplies(previous => ({ ...previous, [reply.id]: true }))}
                              />
                            ) : (
                              <p className="user-content-text-xs text-text-main/90 leading-relaxed whitespace-pre-wrap">
                                {renderContentWithMentions(reply.content)}
                              </p>
                            )}
                            {!isModerationHidden(reply.moderationStatus) && (!isModerationMasked(reply.moderationStatus) || expandedMaskedReplies[reply.id]) && (
                            <div className="flex items-center gap-3 pt-2">
                              <ReactionButton
                                compact
                                currentReaction={replyReactions[getReplyLikeKey(comment.id, reply.id)]}
                                count={reply.likesCount || 0}
                                onSelect={(reaction) => handleReplyReaction(comment, reply, reaction)}
                                reactionCollectionPath={`posts/${post.id}/comments/${comment.id}/replies/${reply.id}/likes`}
                              />
                            </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {user && replyingToCommentId === comment.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAddReply(comment);
                          }}
                          className="flex gap-2"
                        >
                          <div className="flex-1 space-y-1">
                            <MentionComposerInput
                              placeholder={`回覆 ${comment.authorName}... @暱稱`}
                              maxLength={COMMENT_CHAR_LIMIT}
                              className="w-full bg-mist border border-line rounded-xl px-3 py-2 text-[0.8125rem] text-text-main focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none placeholder:text-text-muted/40"
                              value={replyInputs[comment.id] || ''}
                              disabled={Boolean(submittingReplyIds[comment.id])}
                              onChange={(nextValue) => setReplyInputs(previous => ({ ...previous, [comment.id]: limitChars(nextValue, COMMENT_CHAR_LIMIT) }))}
                            />
                            <div className="flex justify-end px-1">
                              <span className={`text-[0.625rem] font-mono font-bold ${
                                countChars(replyInputs[comment.id] || '') >= COMMENT_CHAR_LIMIT ? 'text-amber-400' : 'text-text-muted'
                              }`}>
                                字數 {countChars(replyInputs[comment.id] || '')}/{COMMENT_CHAR_LIMIT}
                              </span>
                            </div>
                          </div>
                          <button
                            type="submit"
                            disabled={Boolean(submittingReplyIds[comment.id]) || !(replyInputs[comment.id] || '').trim()}
                            className="self-start bg-mist/50 text-text-main p-2.5 rounded-xl hover:bg-mist transition-all border border-line cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                            aria-label={submittingReplyIds[comment.id] ? '回覆送出中' : '送出回覆'}
                          >
                            {submittingReplyIds[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </button>
                        </form>
                      )}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && createPortal((
      <AnimatePresence>
        {reportDraft && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isSubmittingReport) setReportDraft(null);
            }}
          >
            <motion.div
              className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-line bg-deep-ocean p-5 shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                    <Flag className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-text-main">檢舉內容</h3>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-text-muted">選擇最接近的原因，站長會依規範查看。</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSubmittingReport}
                  onClick={() => setReportDraft(null)}
                  className="rounded-full p-2 text-text-muted hover:bg-white/5 hover:text-text-main disabled:opacity-50"
                  title="關閉"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {REPORT_REASON_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setReportReasonCategory(option)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all ${
                      reportReasonCategory === option
                        ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                        : 'border-line bg-mist/50 text-text-muted hover:border-amber-500/30 hover:text-text-main'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <label className="text-[0.625rem] font-bold uppercase tracking-widest text-text-muted">
                  補充說明{reportNeedsDetail ? '（必填）' : '（選填）'}
                </label>
                <textarea
                  value={reportReasonDetail}
                  onChange={(e) => setReportReasonDetail(limitChars(e.target.value, 240))}
                  maxLength={240}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-line bg-mist px-3 py-2 text-sm text-text-main outline-none placeholder:text-text-muted/40 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                  placeholder="例如：疑似公開個資、威脅特定人物、重複洗版..."
                />
                <div className="flex items-center justify-between text-[0.625rem] text-text-muted">
                  <span>檢舉後會建立站務紀錄</span>
                  <span className="font-mono">{countChars(reportReasonDetail)}/240</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={isSubmittingReport}
                  onClick={() => setReportDraft(null)}
                  className="flex-1 rounded-xl border border-line bg-mist/40 px-4 py-3 text-xs font-bold text-text-muted transition-colors hover:bg-mist hover:text-text-main disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!canSubmitReport || isSubmittingReport}
                  onClick={submitReport}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmittingReport ? '送出中...' : '送出檢舉'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      ), document.body)}
    </motion.div>
  );
}
