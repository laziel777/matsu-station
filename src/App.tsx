import React, { useState, useEffect } from 'react';
import { useAuth, UserProfile, DEFAULT_ISLANDER_PHOTO } from './lib/AuthContext';
import { signInWithPopup, googleProvider, auth, signOut } from './lib/firebase';
import { LogIn, LogOut, MessageSquare, Heart, Share2, Send, Plus, User, Waves, Search, Flag, Edit2, Calendar, Menu, X, ChevronRight, Palette, Settings, Image as ImageIcon, Facebook, Instagram, Copy, Check, ExternalLink, Trash2, Bell, Shield, TrendingUp, Zap, Star, Compass, Clock, AlertCircle, Cloud, CloudRain, Snowflake, CloudLightning, Sun, Plane, Ship, Info, Wind, Eye, Activity, MapPin, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, addMonths, isAfter } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { db, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, increment, setDoc, deleteDoc, getDoc, getDocs, where, handleFirestoreError, OperationType, storage } from './lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

const STATION_MASTER_UID = 'gHHxF8p1DnbMkoeVmU5XpB18Elz2';
const DEFAULT_BACKGROUND_MODE = 'dark';
const DEFAULT_ACCENT_ID = 'bio-glow';
const DEFAULT_FONT_SIZE = 100;

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
  category?: string;
  aiSafe?: boolean;
  aiRisk?: number;
  aiTag?: string;
  aiSummary?: string;
  aiAction?: string;
  likesCount: number;
  commentsCount: number;
  imageUrls?: string[];
  createdAt: any;
}

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  authorRole?: 'user' | 'admin';
  content: string;
  createdAt: any;
}

// --- Profanity Filter Utility ---
const VULGAR_PHRASES = [
  '幹你娘', '操你媽', '去你的', '機掰', '白癡', '智障', '雜種', '三小', '欠扁', '靠北',
  'fuck', 'bitch', 'nigger', 'shit', 'asshole', 'bastard', 'pussy', 'dick'
];
const SINGLE_VULGAR = ['幹', '操', '屁', '死'];
const EXCEPTIONS = [
  '幹嘛', '幹事', '幹勁', '骨幹', '實幹', '相幹', '才幹', '幹啥', 
  '屁股', '屁話', '死守', '死心', '死對頭', '生死', '救死扶傷'
];
const GENERAL_VULGAR = ['垃圾', '廢物', '禽獸'];
const DESSERT_EMOJIS = ['🍰', '🍦', '🍩', '🍪', '🧁', '🍭', '🍮', '🥞', '🍧', '🍨'];

const filterContent = (text: string) => {
  let filteredText = text;
  
  // 1. 保護例外詞 (暫時替換成佔位符)
  const placeholders: string[] = [];
  EXCEPTIONS.forEach((exc, index) => {
    const placeholder = `__EXC_${index}__`;
    placeholders.push(exc);
    const regex = new RegExp(exc, 'g');
    filteredText = filteredText.replace(regex, placeholder);
  });

  // 2. 過濾長片語 (包含英文，故使用 gi)
  VULGAR_PHRASES.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, () => 
      DESSERT_EMOJIS[Math.floor(Math.random() * DESSERT_EMOJIS.length)]
    );
  });
  
  // 3. 過濾一般髒詞 (使用 gi)
  GENERAL_VULGAR.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, () => 
      DESSERT_EMOJIS[Math.floor(Math.random() * DESSERT_EMOJIS.length)]
    );
  });

  // 4. 過濾單字髒話 (使用 gi)
  SINGLE_VULGAR.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, () => 
      DESSERT_EMOJIS[Math.floor(Math.random() * DESSERT_EMOJIS.length)]
    );
  });

  // 5. 還原例外詞
  placeholders.forEach((exc, index) => {
    const placeholder = `__EXC_${index}__`;
    const regex = new RegExp(placeholder, 'g');
    filteredText = filteredText.replace(regex, exc);
  });

  return filteredText;
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
  
  // High-priority special avatar for admin
  if (p.islanderId === 'L' || p.role === 'admin') {
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

export default function App() {
  const { user, loading, error: authError, profile, agreeToTerms, updateProfileData } = useAuth();
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
  const [weather, setWeather] = useState<{ temp: number; icon: string; text: string; wind: number; dir: string; aqi: number; vis: number; humidity: number } | null>(null);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState<'flight' | 'ferry' | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
  const saved = localStorage.getItem('matsu-font-size');
  return saved ? parseInt(saved) : DEFAULT_FONT_SIZE;
});

const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    localStorage.setItem('matsu-font-size', fontSize.toString());
    document.documentElement.style.fontSize = `${(fontSize / 100) * 16}px`;
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

  // Weather Fetching
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Matsu Coordinates: 26.1587, 119.9284
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=26.15&longitude=119.93&current_weather=true&hourly=relativehumidity_2m,visibility');
        const data = await res.json();
        if (data.current_weather) {
          const temp = Math.round(data.current_weather.temperature);
          const code = data.current_weather.weathercode;
          const wind = data.current_weather.windspeed;
          const windDir = data.current_weather.winddirection;
          
          // Decode Wind Dir
          const dirs = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
          const dir = dirs[Math.round(windDir / 45) % 8];

          let text = '晴朗';
          let icon = 'Sun';
          
          if (code >= 1 && code <= 3) { text = '多雲'; icon = 'Cloud'; }
          else if (code >= 45 && code <= 48) { text = '有霧'; icon = 'Cloud'; }
          else if (code >= 51 && code <= 67) { text = '有雨'; icon = 'CloudRain'; }
          else if (code >= 71 && code <= 86) { text = '有雪'; icon = 'Snowflake'; }
          else if (code >= 95 && code <= 99) { text = '雷雨'; icon = 'CloudLightning'; }
          
          setWeather({ 
            temp, 
            icon, 
            text, 
            wind, 
            dir, 
            aqi: 45 + Math.floor(Math.random() * 20), // Simulation
            vis: 10,
            humidity: data.hourly?.relativehumidity_2m?.[0] || 75
          });
        }
      } catch (err) {
        console.error('Weather fetch failed:', err);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000); // Update every 10 mins
    return () => clearInterval(interval);
  }, []);

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
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const nextNotifications = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      setNotifications(nextNotifications);
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
  const category = (post.category || '未分類').replace('#', '');

  if (!topicCounts[category]) {
    topicCounts[category] = 0;
  }

  topicCounts[category]++;
});

const HOT_TOPICS = Object.entries(topicCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
 .map(([label, count]) => ({
   label,
   count
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
    { id: 'hot', name: '熱門話題', icon: '🔥' },
    { id: 'chat', name: '閒聊', icon: '💬' },
    { id: 'tears', name: '藍眼淚', icon: '💧' },
    { id: 'life', name: '在地生活', icon: '🏠' },
    { id: 'politics', name: '政治論壇', icon: '⚖️' },
    { id: 'ghost', name: '馬祖鬼故事', icon: '👻' },
    { id: 'scenery', name: '美景分享', icon: '📸' },
    { id: 'wildlife', name: '野生動物', icon: '🦌' },
    { id: 'ufo', name: '馬祖UFO', icon: '🛸' },
  ];

  const POST_TAGS = CATEGORIES.filter(cat => cat.id !== 'all' && cat.id !== 'hot');

  // Check if logged in user needs to agree to terms or setup profile
  React.useEffect(() => {
    if (user && profile && profile.role !== 'admin' && (!profile.agreedToTerms || !profile.isProfileSetup)) {
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
        alert("網站後台（Firebase）尚未完成設定。請聯繫管理員協助。");
      } else {
        alert("登錄失敗，請確認您已在 Firebase Console 啟用 Google 登錄方式。");
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
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    try {
      const options = {
        maxSizeMB: 0.2, // Small for avatar
        maxWidthOrHeight: 400,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
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

  const checkNameAvailability = async (name: string, currentUid?: string, isAdmin: boolean = false) => {
    if (!name.trim()) return null;
    
    // Admin has no restrictions
    if (isAdmin) return null;
    
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
      const q = query(collection(db, 'users'), where('displayName', '==', name.trim()));
      const result = await getDocs(q);
      
      const isTaken = result.docs.some(doc => doc.id !== currentUid);
      if (isTaken) {
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
      const error = await checkNameAvailability(setupName, user?.uid, profile?.role === 'admin');
      setSetupNameError(error);
      setIsCheckingSetupName(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [setupName, user, profile?.role]);

  useEffect(() => {
    if (!editDisplayName.trim()) {
      setEditNameError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingEditName(true);
      const error = await checkNameAvailability(editDisplayName, user?.uid, profile?.role === 'admin');
      setEditNameError(error);
      setIsCheckingEditName(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [editDisplayName, user, profile?.role]);

  const handleAgree = async () => {
    const missingItems = [];
    if (profile?.role !== 'admin' && !hasReadToBottom) missingItems.push('閱讀完畢服務條款 (請滑動到底部)');
    if (!setupName.trim()) missingItems.push('設定您的島民暱稱');
    if (setupNameError) missingItems.push(setupNameError);

    if (!setupPhoto) missingItems.push('上傳您的個人頭像');
    // Removed requirement to change from default since we have a specific default islander logo now

    if (missingItems.length > 0) {
      alert('您還沒完成以下設定，無法進入島嶼：\n\n' + missingItems.map((item, i) => `${i + 1}. ${item}`).join('\n'));
      return;
    }

    try {
      await agreeToTerms({
        displayName: setupName,
        photoURL: setupPhoto
      });
      setShowTerms(false);
    } catch (err) {
      console.error('Agree terms failed', err);
      alert('發生錯誤，請重新整理頁面再試。');
    }
  };

  const handleOpenProfile = async (userId: string) => {
    if (!user) {
      alert("請先登入後再查看個人檔案。");
      return;
    }

    if (user && userId === user.uid && profile) {
      setViewingProfile(profile);
      setEditBio(profile.bio || '');
      setEditTitle(profile.title || '');
      setEditDisplayName(profile.displayName || '');
      setEditPhotoURL(profile.photoURL || '');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setViewingProfile({ id: snap.id, ...snap.data() } as any);
      } else {
        alert("此使用者的檔案尚未初始化。");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('offline')) {
        alert("連線失敗：請確認 Firestore 資料庫已在 Firebase Console 中建立。");
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
        alert(`島嶼規範：稱號與簡介每 3 個月只能修改一次。您還需要等待 ${remaining}。`);
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

  const handleUpdateAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    try {
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 400,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      const fileRef = ref(storage, `avatars/${user.uid}/${Date.now()}_avatar.jpg`);
      const snapshot = await uploadBytes(fileRef, compressedFile);
      const url = await getDownloadURL(snapshot.ref);
      setEditPhotoURL(url);
    } catch (error) {
      console.error('Avatar upload failed', error);
      alert('頭像上傳失敗');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + selectedImages.length > 1) {
      alert('島嶼規範：每篇貼文只能上傳 1 張圖片。');
      return;
    }

    setIsCompressing(true);
    const options = {
      maxSizeMB: 1, // Max size 1MB
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };

    try {
      const newFiles = [...selectedImages];
      const newPreviews = [...imagePreviews];

      for (const file of files) {
        // Compress the image
        const compressedFile = await imageCompression(file, options);
        
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

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!newPostContent.trim() && selectedImages.length === 0) || isPosting) return;

    setIsPosting(true);
    setPostError(null);
    setPostingMessage('AI 正在幫你檢查內容安全...');
    setUploadProgress(8);

    const postsPath = 'posts';

    try {
      const rawContent = newPostContent.trim();

      // 1) 先呼叫後端 AI 審核。注意：Gemini API Key 只能放在後端 /api/moderate-post，不能放前端。
      const moderationRes = await fetch('/api/moderate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: rawContent,
          category: newPostCategory,
        }),
      });

      const moderation = await moderationRes.json().catch(() => null);

      if (!moderationRes.ok || !moderation) {
        throw new Error(moderation?.summary || moderation?.error || 'AI 審核暫時失敗，請稍後再試。');
      }

      if (moderation.action === 'block' || moderation.safe === false) {
        setPostError(moderation.summary || '這篇內容可能有法律或個資風險，請改得更模糊一點再發。');
        setIsPosting(false);
        setUploadProgress(0);
        setPostingMessage('');
        return;
      }

      setPostingMessage('AI 檢查通過，正在上傳圖片...');
      setUploadProgress(25);

      // 2) 上傳圖片
      const uploadedUrls: string[] = [];
      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i];
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileRef = ref(storage, `posts/${user.uid}/${Date.now()}_${safeFileName}`);
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
        setUploadProgress(25 + ((i + 1) / selectedImages.length) * 45);
      }

      setPostingMessage('正在發布到馬祖小站...');
      setUploadProgress(82);

      // 3) 寫入 Firestore
      const cleanContent = filterContent(rawContent);
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || '匿名島民',
        authorPhoto: profile?.photoURL || user.photoURL || DEFAULT_ISLANDER_PHOTO,
        content: cleanContent,
        category: moderation.tag || newPostCategory,
        aiSafe: Boolean(moderation.safe),
        aiRisk: Number(moderation.risk ?? 0),
        aiTag: moderation.tag || newPostCategory,
        aiSummary: moderation.summary || '',
        aiAction: moderation.action || 'publish',
        likesCount: 0,
        commentsCount: 0,
        reportsCount: 0,
        imageUrls: uploadedUrls,
        createdAt: serverTimestamp(),
      });

      setUploadProgress(100);
      setPostingMessage('發布成功！');

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
      setPostError(error?.message || '發文失敗，請稍後再試。');
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

  const filteredPosts = posts
    .filter(post => {
      const matchesSearch = post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           post.authorName.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (activeCategory === '熱門話題') {
        return matchesSearch && (post.likesCount >= 3);
      }
      
      const matchesCategory = activeCategory === '全部' || post.category === activeCategory || post.content.includes(activeCategory);
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (activeCategory === '熱門話題') {
        return (b.likesCount || 0) - (a.likesCount || 0);
      }
      return 0; // Keep Firestore order (desc ending)
    });

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
                    「Offline」通常表示資料庫尚未啟用。請確認您已在 Firebase Console 中：
                    <br/>1. 進入 Firestore Database
                    <br/>2. 點擊「建立資料庫」
                    <br/>3. 選擇「預設」模式並完成設定
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
              <p className="text-[0.5625rem] text-text-muted opacity-60 leading-relaxed">如果這花費太長時間，可能是您的網路不穩定或資料庫設定有誤。</p>
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
              className="glass-card rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border-white/10"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-bold font-display text-text-main">
                  {profile?.role === 'admin' ? '初始化站長身分' : '使用者條款與免責聲明'}
                </h2>
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
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-text-main font-bold text-base">設定您的島民身分</h3>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <span className="text-[0.625rem] bg-white/10 text-text-muted px-2 py-0.5 rounded-full font-mono font-bold tracking-wider">
                          UID: {profile?.islanderId}
                        </span>
                      </div>
                      <p className="text-[0.625rem] text-text-muted uppercase tracking-widest">請設定一個在群島中使用的暱稱與頭像</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[0.625rem] font-bold text-text-muted uppercase tracking-widest px-1">您的暱稱</label>
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

                {profile?.role !== 'admin' && (
                  <>
                    <section className="space-y-3">
                      <h3 className="font-bold text-text-main text-base flex items-center gap-2">
                        <span className="w-1 h-4 bg-bio-glow rounded-full"></span>
                        1. 服務條款與社群規範
                      </h3>
                      <p>「馬祖小站」旨在建立自由且理性的馬祖在地社群。使用者同意在發表內容時遵守在地法律，並尊重他人的隱私與言論自由。禁止發表包含誹謗、侵權、色情、暴力、詐騙、騷擾或任何違反公序良俗之內容。</p>
                    </section>
                    
                    <section className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                      <h3 className="font-bold text-text-main text-base flex items-center gap-2 uppercase tracking-wider text-[0.6875rem] opacity-70">2. 內容與免責聲明</h3>
                      <p>本平台僅提供資訊儲存空間。所有使用者上傳之內容，均由該使用者自行承擔法律責任。本站及負責人對使用者言論不負連帶賠償責任，言論僅代表發表者個人立場。</p>
                      <p className="text-[0.6875rem] opacity-60">※ 本站依「避風港」原則運作，若接獲檢舉，管理員有權在不經通知下移除違法內容。</p>
                    </section>

                    <section className="space-y-3 text-emerald-300 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/10">
                      <h3 className="font-bold text-emerald-200 text-base flex items-center gap-2">3. 隱私權與數據保護</h3>
                      <p>本站絕不主動對外洩漏使用者非公開之電郵、個人資料或私訊內容。相關技術數據（如 IP 位址）僅用於防範系統攻擊，除非配合合法司法調核，否則絕不轉交第三方。</p>
                    </section>

                    <section className="space-y-3">
                      <h3 className="font-bold text-text-main text-base flex items-center gap-2">4. 著作權與侵權處理</h3>
                      <p>使用者分享之原創內容歸作者所有。但使用者授權本站於推廣範圍內無償使用。若您的著作權遭侵害，請備妥權利證明聯繫我們，我們將以最快速度處理並移除爭議內容。</p>
                    </section>

                    <section className="space-y-3 pt-6 border-t border-white/5">
                      <h3 className="font-bold text-text-main text-base flex items-center gap-2">5. 商業合作與異業結盟</h3>
                      <p>目前本站為試運行階段。歡迎馬祖在地商家、藝文創作者進行異業結盟或活動推廣贊助。相關合作提案請透過官方 LINE 帳號或簡訊聯繫。</p>
                    </section>

 <section className="space-y-4 bg-bio-glow/5 p-4 rounded-2xl border border-bio-glow/10">
                      <h3 className="font-bold text-bio-glow text-base flex items-center gap-2">6. 聯絡方式與損害賠償</h3>
                      <div className="space-y-2 text-xs">
                        <p className="flex items-center gap-2 font-bold text-bio-glow">
                           <span className="text-text-muted font-mono">LINE:</span> 
                          <a
  href="https://lin.ee/rtovKwL"
  target="_blank"
  rel="noopener noreferrer"
  className="text-text-main/80 hover:text-bio-glow underline"
>
  馬祖小站 Matsu Station（官方 LINE）
</a>
                        </p>

                        <p className="flex items-center gap-2">
                           <span className="text-text-muted font-mono">IG:</span> 
                           <span className="text-text-main/80">@matsu.station</span>
                        </p>

                        <p className="text-[0.6875rem] text-text-muted mt-4 leading-relaxed italic">
                          ※ 若因使用者違法行為導致本站受損（含法律訴訟費用），該使用者應負完整賠償責任。
                        </p>
                      </div>
                    </section>
                  </>
                )}
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
                <p className="text-[0.625rem] text-center text-text-muted uppercase tracking-widest">點擊下方按鈕即表示您已閱讀並同意上述條款。</p>
                <button 
                  onClick={handleAgree}
                  className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                    hasReadToBottom && setupName.trim() && setupPhoto && setupPhoto !== user?.photoURL
                      ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20' 
                      : 'bg-white/5 text-text-muted border border-white/10 shadow-none hover:bg-white/10'
                  }`}
                >
                  確認設定並進入馬祖小站
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full py-2 text-text-muted hover:text-text-main transition-colors text-sm"
                >
                  取消並登出
                </button>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-card w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl border-line"
            >
              <div className="p-6 border-b border-line flex items-center justify-between bg-mist">
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
              
              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
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
                    <span>界面文字大小</span>
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
                  <p className="text-[0.5625rem] text-text-muted mt-2 px-1 italic">調整後會即時改變全站介面文字的大小比例。</p>
                </div>

                {user && (
                  <div>
                    <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest mb-4 block">帳號管理</label>
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        handleOpenProfile(user.uid);
                        // Delay editing to let profile modal open first
                        setTimeout(() => setIsEditingProfile(true), 300);
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-mist border border-line hover:border-bio-glow/50 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10">
                          <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: profile?.role }} className="w-full h-full" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-text-main group-hover:text-bio-glow transition-colors">{profile?.displayName}</p>
                          <p className="text-[0.625rem] text-text-muted font-mono tracking-wider">{profile?.islanderId}</p>
                        </div>
                      </div>
                      <Edit2 className="w-4 h-4 text-text-muted group-hover:text-text-main transition-colors" />
                    </button>
                  </div>
                )}

                <div className="pt-4 border-t border-line">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-mist border border-line opacity-80">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs text-text-muted">登入同步設定 (開發中)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-mist border-t border-line flex flex-col sm:flex-row gap-3">
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

      {/* Header */}
      <header className="sticky top-0 z-50 bg-deep-ocean/60 backdrop-blur-xl border-b border-white/5 py-3 sm:py-0">
        <div className="max-w-7xl mx-auto px-4 min-h-[4rem] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <div className="bg-mist p-1.5 rounded-xl shadow-lg border border-white/5 group-hover:border-bio-glow/50 transition-colors">
                <Waves className="text-bio-glow w-6 h-6 glow-text group-hover:animate-pulse" />
              </div>
              <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight text-text-main flex items-baseline gap-2">
                <span>馬祖小站</span>
                <span className="text-bio-glow glow-text text-sm sm:text-lg font-medium">Matsu Station</span>
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
                          className="absolute top-full right-[-50px] mt-2 w-72 dropdown-panel rounded-2xl z-50 shadow-2xl overflow-hidden"
                        >
                           <div className="p-4 border-b border-white/5 flex items-center justify-between">
                              <span className="text-xs text-text-main font-bold uppercase tracking-widest">系統通知</span>
                              <button onClick={markAllAsRead} className="text-xs text-bio-glow font-bold uppercase">標記已讀</button>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                              {notifications.length > 0 ? (
                                notifications.map(n => (
                                  <div 
                                    key={n.id} 
                                    onClick={async () => {
  await updateDoc(doc(db, 'notifications', n.id), {
    read: true
  });

  setShowNotifications(false);

  if (n.category) {
  setActiveCategory(n.category);
} else {
  setActiveCategory("全部");
}

setTimeout(() => {
  const element = document.getElementById(`post-${n.postId}`);

  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
 }, 500);
}}
                                    className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!n.read ? 'bg-bio-glow/5' : ''}`}
                                  >
                                    <h4 className="text-sm font-bold text-text-main mb-1">{n.title}</h4>
                                    <p className="text-xs text-text-muted mb-1 leading-relaxed">{n.content}</p>
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
                    <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: profile?.role }} className="w-8 h-8 rounded-full border border-line hover:border-bio-glow" />
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
                className="weather-chip flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer"
                title="馬祖氣象站詳情"
              >
                {weather.icon === 'Sun' && <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />}
                {weather.icon === 'Cloud' && <Cloud className="w-4 h-4 text-text-muted" />}
                {weather.icon === 'CloudRain' && <CloudRain className="w-4 h-4 text-blue-400" />}
                {weather.icon === 'Snowflake' && <Snowflake className="w-4 h-4 text-text-main" />}
                {weather.icon === 'CloudLightning' && <CloudLightning className="w-4 h-4 text-yellow-500" />}
                <div className="flex flex-col -space-y-1">
                  <span className="weather-chip-label text-[0.625rem] font-bold uppercase tracking-tighter text-left">馬祖氣象</span>
                  <span className="text-[0.6875rem] font-mono font-bold text-text-main leading-none">{weather.temp}°C</span>
                </div>
              </motion.button>
            )}

            {/* Transport Widgets */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowTransportModal('flight')}
                className="flight-chip flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer"
                title="航班資訊"
              >
                <Plane className="flight-chip-icon w-3.5 h-3.5" />
                <span className="flight-chip-label text-[0.625rem] font-bold uppercase tracking-tighter">航班</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowTransportModal('ferry')}
                className="ferry-chip flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer"
                title="船班資訊"
              >
                <Ship className="ferry-chip-icon w-3.5 h-3.5" />
                <span className="ferry-chip-label text-[0.625rem] font-bold uppercase tracking-tighter">船班</span>
              </motion.button>
            </div>

            <div className="flex-1 max-w-full sm:max-w-[240px] relative group hidden sm:block">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
             <input 
               type="text" 
               placeholder="搜尋馬祖的小事..."
               className="w-full bg-mist-light border border-line rounded-full py-2 pl-10 pr-4 text-sm text-text-main placeholder:text-text-muted/40 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               onFocus={() => setIsSearchFocused(true)}
               onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
             />

             <AnimatePresence>
               {isSearchFocused && (
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="absolute top-full left-0 right-0 mt-2 p-4 glass-card rounded-2xl z-50 shadow-2xl border-line"
                 >
                   <div className="flex items-center justify-between mb-3 px-1">
                     <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest">熱門地圖話題</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                   </div>
                   <div className="space-y-1">
                     {HOT_TOPICS.map((topic, index) => (
                       <button
                         key={topic.label}
                         onClick={() => {
                           setSearchQuery(topic.label);
                           setIsSearchFocused(false);
                         }}
                         className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-mist-light group/topic transition-all text-left cursor-pointer"
                       >
                         <div className="flex items-center gap-3">
                           <span className="text-xs font-mono text-bio-glow opacity-60">#{index + 1}</span>
                           <span className="text-sm text-text-muted group-hover/topic:text-text-main transition-colors">{topic.label}</span>
                         </div>
                         <span className="text-[0.625rem] text-text-muted font-mono">{topic.count}</span>
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
                      className="absolute top-full right-0 mt-2 w-80 dropdown-panel rounded-2xl z-50 shadow-2xl overflow-hidden"
                    >
                      <div className="p-4 border-b border-line flex items-center justify-between">
                        <span className="text-xs text-text-main font-bold uppercase tracking-widest">系統通知</span>
                        <button onClick={markAllAsRead} className="text-xs text-bio-glow font-bold hover:underline">全部標為已讀</button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div 
                              key={n.id} 
                              onClick={async () => {
  await updateDoc(doc(db, 'notifications', n.id), {
    read: true
  });

  setShowNotifications(false);

  if (n.category) {
  setActiveCategory(n.category);
} else {
  setActiveCategory("全部");
}

setTimeout(() => {
  const element = document.getElementById(`post-${n.postId}`);

  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
 }, 500);
}}
                              className={`p-4 border-b border-line hover:bg-white/5 transition-colors cursor-pointer relative ${!n.read ? 'bg-bio-glow/5' : ''}`}
                            >
                              {!n.read && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-bio-glow rounded-full" />}
                              <h4 className="text-sm font-bold text-text-main mb-1">{n.title}</h4>
                              <p className="text-sm text-text-muted mb-2 leading-relaxed">{n.content}</p>
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
                              handleOpenProfile(user.uid); 
                              setShowSettingsMenu(false); 
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-main hover:bg-white/10 transition-all text-sm font-medium group"
                          >
                            <User className="w-4 h-4 text-text-muted group-hover:text-bio-glow" />
                            我的檔案
                          </button>
                        )}
                        
                        <div className="border-t border-line my-1" />
                        
                        <div className="px-3 py-2">
                          <span className="text-xs text-text-muted font-bold uppercase tracking-widest">系統</span>
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
                  {profile?.role === 'admin' && (
                    <span className="text-[0.625rem] bg-red-500/20 text-red-400 px-1.5 rounded-full font-bold border border-red-500/20">管理員</span>
                  )}
                </div>
                <button onClick={() => handleOpenProfile(user.uid)} className="cursor-pointer active:scale-95 transition-transform">
                  <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: profile?.role }} className="w-8 h-8 rounded-full border border-white/10 hover:border-bio-glow" />
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
          href="https://lin.ee/nn0RaOc"
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
              className="glass-card rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border-line relative max-h-[90vh] flex flex-col"
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
                          role: viewingProfile.role
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
                            accept="image/*"
                            className="hidden"
                          />
                        </>
                      )}
                    </div>
                    {user?.uid === viewingProfile.uid && !isEditingProfile && (
                      <button 
                        onClick={() => setIsEditingProfile(true)}
                        className="bg-mist-medium text-text-main px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-mist border border-line transition-all mb-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        修改檔案
                      </button>
                    )}
                  </div>

                  {isEditingProfile ? (
                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-1 block mb-1">島內暱稱</label>
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
                             UID: {viewingProfile.islanderId}
                           </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest px-1">島嶼稱號 (稱號一旦設定將鎖定 3 個月)</label>
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
                          提神提醒：為了維持社群穩定，稱號與簡介每 90 天僅能修改一次。
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
                      <div className="space-y-1">
                         <div className="flex items-center gap-3">
                           <h2 className={`text-2xl font-bold ${viewingProfile.role === 'admin' ? 'rgb-text' : 'text-text-main'}`}>
                             {viewingProfile.displayName}
                           </h2>
                            {viewingProfile.role === 'admin' && (
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
                             UID: {viewingProfile.islanderId}
                           </span>
                         </div>
                      </div>

                      <div className="p-5 bg-mist-light border border-line rounded-[2rem] min-h-[100px]">
                         <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
                           {viewingProfile.bio || "這個島民很神秘，還沒有留下任何簡介。"}
                         </p>
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
              <p className="text-[0.5625rem] text-text-muted font-bold uppercase tracking-widest px-2">系統狀態 (Debug)</p>
              <div className="flex items-center gap-2 px-2">
                <div className={`w-1.5 h-1.5 rounded-full ${db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                <span className="text-[0.625rem] text-text-muted">Firebase {db ? '已連線' : '中斷'}</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-stone-700'}`} />
                <span className="text-[0.625rem] text-text-muted">Auth {user ? 'Login' : 'Guest'}</span>
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
                  <p className="text-[0.5625rem] text-text-muted/70 font-bold uppercase tracking-widest px-2">系統狀態 (Debug)</p>
                  <div className="flex items-center gap-2 px-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                    <span className="text-[0.625rem] text-text-muted">Firebase {db ? '已連線' : '中斷'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-stone-700'}`} />
                    <span className="text-[0.625rem] text-text-muted">Auth {user ? 'Login' : 'Guest'}</span>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="flex-1 max-w-[640px] w-full space-y-8">
          {/* Whisper Bar */}
          <div className="overflow-hidden bg-mist/30 border-y border-white/5 py-2 -mx-4 rounded-xl flex">
            <motion.div 
              animate={{ x: [0, "-50%"] }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="flex gap-12 whitespace-nowrap text-[0.625rem] text-bio-glow uppercase tracking-[0.3em] font-bold opacity-60"
            >
              <div className="flex gap-12 shrink-0">
                <span>馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。<br />請勿發布個資、未查證爆料或攻擊性內容。<br />若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。<br />感謝大家一起讓馬祖小站變得更好。</span>
              </div>
              <div className="flex gap-12 shrink-0">
                <span>馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。<br />請勿發布個資、未查證爆料或攻擊性內容。<br />若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。<br />感謝大家一起讓馬祖小站變得更好。</span>
              </div>
            </motion.div>
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
                   馬祖小站目前為 Beta 測試版，歡迎馬祖鄉親協助測試。<br />請勿發布個資、未查證爆料或攻擊性內容。<br />若遇到問題，請截圖回報馬祖小站 LINE 官方帳號。<br />感謝大家一起讓馬祖小站變得更好。
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
          {user && profile?.agreedToTerms && (
            <motion.form 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleCreatePost}
              className="glass-card p-6 rounded-3xl space-y-4 shadow-xl border-line"
            >
              <div className="flex gap-4">
                <UserAvatar p={{ ...profile, islanderId: profile?.islanderId || user.uid, role: profile?.role }} className="w-10 h-10 rounded-full border border-line" />
                <div className="flex-1 space-y-4">
                  <textarea 
                    placeholder="在夜色中留下馬祖的消息..."
                    disabled={isPosting}
                    className="w-full bg-transparent border-none focus:ring-0 text-text-main text-lg resize-none py-2 min-h-[100px] placeholder:text-text-muted/40 outline-none disabled:opacity-50"
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                  />
                  
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
                        className="grid grid-cols-5 gap-2 pt-2"
                      >
                        {imagePreviews.map((preview, idx) => (
                          <div key={idx} className="relative group aspect-square">
                            <img src={preview} alt="" className="w-full h-full object-cover rounded-xl border border-white/10" />
                            <button 
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    disabled
                 title="圖片功能開發中"
                  />
                  <button 
                    type="button"
                    disabled
                    title="圖片功能開發中"
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
                </div>
                <button 
                  disabled={(!newPostContent.trim() && selectedImages.length === 0) || isPosting}
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
            <AnimatePresence>
              {filteredPosts.map(post => (
                <PostCard key={post.id} post={post} onOpenProfile={handleOpenProfile} onShare={handleShare} />
              ))}
            </AnimatePresence>
            
            {filteredPosts.length === 0 && (
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

            {/* Trending Topics */}
            <div className="glass-card rounded-3xl p-6 border-line">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">熱門話題排行</h3>
              <div className="space-y-3">
                {HOT_TOPICS.slice(0, 5).map((topic, index) => (
                  <button
                    key={topic.label}
                   onClick={() => setActiveCategory(topic.label)}
                    className="w-full flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-bio-glow/40 group-hover:text-bio-glow transition-colors italic">0{index + 1}</span>
                      <div className="flex flex-col items-start translate-y-0.5">
                        <span className="text-sm text-text-muted font-bold group-hover:text-text-main transition-colors">{topic.label}</span>
                        <span className="text-[0.5625rem] text-text-muted uppercase tracking-widest mt-0.5">#{topic.count} 則動態</span>
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
                <button 
                  onClick={() => setShowTerms(true)}
                  className="text-left text-[0.625rem] text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
                >
                  <Plus className="w-3 h-3 text-bio-glow" /> 關於本站與贊助支持
                </button>
              </div>
            </div>

            {/* Footer Links Small */}
            <div className="px-4 flex flex-wrap gap-x-4 gap-y-2 opacity-30 group hover:opacity-100 transition-opacity">
               <button onClick={() => setShowTerms(true)} className="text-[0.625rem] text-text-muted hover:text-text-main uppercase font-bold tracking-widest whitespace-nowrap">條款</button>
               <button onClick={() => setShowTerms(true)} className="text-[0.625rem] text-text-muted hover:text-text-main uppercase font-bold tracking-widest whitespace-nowrap">隱私</button>
               <button onClick={() => setShowTerms(true)} className="text-[0.625rem] text-text-muted hover:text-text-main uppercase font-bold tracking-widest whitespace-nowrap">贊助</button>
               <button onClick={() => setShowTerms(true)} className="text-[0.625rem] text-text-muted hover:text-text-main uppercase font-bold tracking-widest whitespace-nowrap">API</button>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-line text-center text-text-muted text-sm space-y-8">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:flex sm:items-center sm:justify-center gap-x-8 gap-y-4 text-[0.625rem] sm:text-[0.6875rem] font-bold uppercase tracking-[0.1em] opacity-50">
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">服務條款</button>
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">內容政策</button>
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">隱私權聲明</button>
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">著作權聲明</button>
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">商業合作</button>
           <button onClick={() => setShowTerms(true)} className="hover:text-bio-glow transition-colors cursor-pointer text-left sm:text-center text-text-muted">聯絡方式</button>
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
                  <h2 className="text-2xl font-bold text-text-main">連江縣馬祖氣象站</h2>
                  <p className="text-text-muted text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> 南竿鄉介壽村
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">目前溫度</span>
                  <span className="text-xl font-mono font-bold text-text-main">{weather.temp}°C</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">空氣品質</span>
                  <span className={`text-xl font-mono font-bold ${weather.aqi < 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{weather.aqi} AQI</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">目前風向</span>
                  <span className="text-xl font-bold text-text-main flex items-center gap-1"><Wind className="w-4 h-4 text-bio-glow" /> {weather.dir}</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">平均風力</span>
                  <span className="text-xl font-mono font-bold text-text-main">{Math.round(weather.wind / 5)} 級</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">相對濕度</span>
                  <span className="text-xl font-mono font-bold text-text-main">{weather.humidity}%</span>
                </div>
                <div className="p-4 rounded-2xl bg-mist border border-line">
                  <span className="text-[0.625rem] text-text-muted font-bold uppercase tracking-widest block mb-1">能見度</span>
                  <span className="text-xl font-bold text-text-main flex items-center gap-1"><Eye className="w-4 h-4 text-bio-glow" /> 10KM+</span>
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
                  <span className="text-lg font-mono font-bold text-text-main">20,000 FT</span>
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
                  <span className="text-lg font-mono font-bold text-text-main">20,000 FT</span>
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-[0.625rem] text-text-muted opacity-60 font-mono italic">
                  資料來源：中央氣象署 & Open-Meteo RT-API • 每 10 分鐘自動更新
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
              className="relative w-full max-w-lg glass-card rounded-[32px] p-8 border-white/10 shadow-2xl"
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
                  <h2 className="text-2xl font-bold text-text-main">{showTransportModal === 'flight' ? '馬祖空運即時狀態' : '馬祖海運即時狀態'}</h2>
                  <p className="text-text-muted text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-3 h-3 text-bio-glow" /> {new Date().toLocaleTimeString('zh-TW')} 更新
                  </p>
                </div>
              </div>

              {showTransportModal === 'flight' ? (
                <div className="space-y-4">
                   <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[0.625rem] font-bold">LZN</span>
                            <span className="text-sm font-bold text-text-main">南竿機場 (Nangan)</span>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                             正常起降
                         </span>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[0.625rem] font-bold">MFK</span>
                            <span className="text-sm font-bold text-text-main">北竿機場 (Beigan)</span>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                             正常起降
                         </span>
                      </div>
                   </div>

                   <div className="p-4 rounded-xl border border-white/5 bg-white/5">
                      <h4 className="text-[0.625rem] font-bold text-text-muted uppercase tracking-widest mb-3">今日重點航班</h4>
                      <div className="space-y-2">
                         {[
                           { fl: 'UN8789', to: '松山', time: '14:30', st: '準點' },
                           { fl: 'UN8791', to: '台中', time: '15:10', st: '準點' }
                         ].map(f => (
                           <div key={f.fl} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-4">
                                 <span className="font-mono text-indigo-400">{f.fl}</span>
                                 <span className="text-text-main/80">往 {f.to}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                 <span className="font-mono text-text-muted">{f.time}</span>
                                 <span className="text-emerald-400 font-bold">{f.st}</span>
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-4">
                   <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[0.625rem] font-bold">TPE-LZN</span>
                            <span className="text-sm font-bold text-text-main">台馬之星 (基隆-馬祖)</span>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                             開航 (南竿-東引)
                         </span>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[0.625rem] font-bold">ISL</span>
                            <span className="text-sm font-bold text-text-main">島際交通 (各離島)</span>
                         </div>
                         <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                             全線正常
                         </span>
                      </div>
                   </div>

                   <div className="p-4 rounded-xl border border-white/5 bg-white/5">
                      <h4 className="text-[0.625rem] font-bold text-text-muted uppercase tracking-widest mb-3">最新海象公告</h4>
                      <p className="text-xs text-text-muted leading-relaxed italic">
                        目前海象平穩，最大陣風 5 級。所有客貨輪均依航次正常行駛。
                      </p>
                   </div>
                </div>
              )}

              <div className="mt-8 flex gap-3">
                 <button className="flex-1 py-3 bg-mist-medium hover:bg-mist text-text-main rounded-xl text-xs font-bold transition-all border border-line">官網詳情</button>
                 <button onClick={() => setShowTransportModal(null)} className="flex-1 py-3 bg-mist/50 hover:bg-mist text-text-muted hover:text-text-main rounded-xl text-xs font-bold transition-all border border-line">關閉視窗</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PostCard({ post, onOpenProfile, onShare }: { post: Post; onOpenProfile: (uid: string) => void; onShare: (post: Post) => void }) {
  const { user, profile } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likes, setLikes] = useState(post.likesCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<any>(null);
  const commentsUnsubscribeRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (user && !post.id.startsWith('sample-')) {
      const likePath = `posts/${post.id}/likes/${user.uid}`;
      const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
      getDoc(likeRef)
        .then(snap => setIsLiked(snap.exists()))
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
    };
  }, []);

  const handleLike = async () => {
    if (!user) {
      alert("請登入後再點擊愛心。");
      return;
    }
    
    if (post.id.startsWith('sample-')) {
      alert("這是範例貼文，無法進行互動。請發布您自己的貼文後再試！");
      return;
    }

    const likePath = `posts/${post.id}/likes/${user.uid}`;
    const postPath = `posts/${post.id}`;
    const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
    const postRef = doc(db, 'posts', post.id);

    try {
      if (isLiked) {
        setIsLiked(false);
        setLikes(prev => prev - 1);
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likesCount: increment(-1) });
      } else {
        setIsLiked(true);
        setLikes(prev => prev + 1);
        await setDoc(likeRef, { createdAt: serverTimestamp() });
        await updateDoc(postRef, { likesCount: increment(1) });
        
        // Send notification to author
        if (user.uid !== post.authorId) {
          await addDoc(collection(db, 'notifications'), {
            recipientId: post.authorId,
            senderId: user.uid,
            senderName: profile?.displayName || user.displayName,
            type: 'like',
            postId: post.id,
            category: post.category,
            title: '有人也喜歡這則動態',
            content: `${profile?.displayName || user.displayName} 點擊了你的動態愛心。`,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      // Revert state on error
      if (isLiked) {
        setIsLiked(true);
        setLikes(prev => prev + 1);
      } else {
        setIsLiked(false);
        setLikes(prev => prev - 1);
      }
      
      if (err.message.includes('permission-denied') || err.message.includes('insufficient permissions')) {
        alert("操作失敗：您的 Firebase 資料庫「規則 (Rules)」尚未設定。這通常是因為您還沒在 Firebase 控制台啟用 Firestore 或貼上我提供的 Rules。");
      } else {
        alert("操作失敗，可能是因為網路連線問題，或您的資料庫尚未初始化。");
      }
      handleFirestoreError(err, OperationType.WRITE, isLiked ? likePath : postPath);
    }
  };

  const fetchComments = () => {
    if (showComments) {
      commentsUnsubscribeRef.current?.();
      commentsUnsubscribeRef.current = null;
      setShowComments(false);
      return;
    }

    if (post.id.startsWith('sample-')) {
      setShowComments(true);
      setComments([]);
      return;
    }
    
    setShowComments(true);
    const commentsPath = `posts/${post.id}/comments`;
    try {
      commentsUnsubscribeRef.current?.();
      const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment)));
      }, (error) => {
        console.warn('Comments fetch failed:', error.message);
      });
      commentsUnsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.warn('Comments effect failed:', error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;
    const commentPath = `posts/${post.id}/comments`;

    try {
      const cleanComment = filterContent(newComment);
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName,
        authorPhoto: profile?.photoURL || user.photoURL,
        authorRole: profile?.role || 'user',
        content: cleanComment,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', post.id), { commentsCount: increment(1) });

      // Send notification to author
      if (user.uid !== post.authorId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: post.authorId,
          senderId: user.uid,
          senderName: profile?.displayName || user.displayName,
          type: 'comment',
          postId: post.id,
          category: post.category,
          title: '收到新的神秘回覆',
          content: `${profile?.displayName || user.displayName} 在你的動態下留言了。`,
          read: false,
          createdAt: serverTimestamp()
        });
      }
      const mentionMatches = cleanComment.match(/@([^\s@]+)/g) || [];

      try {
        for (const mention of mentionMatches) {
          const mentionedName = mention.replace("@", "");

          const q = query(
            collection(db, "users"),
            where("displayName", "==", mentionedName)
          );

          const result = await getDocs(q);

          for (const userDoc of result.docs) {
            const mentionedUser = userDoc.data();

            if (mentionedUser.uid !== user.uid) {
              await addDoc(collection(db, "notifications"), {
                recipientId: mentionedUser.uid,
                senderId: user.uid,
                senderName: profile?.displayName || user.displayName,
                type: "mention",
                postId: post.id,
                category: post.category,
                title: "有人標註了你",
                content: `${profile?.displayName || user.displayName} 標註了你`,
                read: false,
                createdAt: serverTimestamp(),
              });
            }
          }
        }
      } catch (mentionErr) {
        console.warn('Mention notification failed:', mentionErr);
      }

      setNewComment('');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, commentPath);
    }
  };

  const handleDeletePost = async () => {
    console.log('Final deletion call for:', post.id);
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    const postPath = `posts/${post.id}`;
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      console.log('Post deleted successfully');
    } catch (err: any) {
      console.error('Delete post error:', err);
      setIsDeleting(false);
      const errorMessage = err.message || String(err);
      alert('刪除失敗：' + (errorMessage.includes('permission-denied') ? '您沒有權限刪除此貼文。' : errorMessage));
      handleFirestoreError(err, OperationType.DELETE, postPath);
    }
  };

  const handleReport = async () => {
    if (!user) {
      alert('請先登入後再進行檢舉。');
      return;
    }

    const reason = window.prompt('請輸入檢舉理由 (內容不實、騷擾、謾罵等)：');
    if (!reason || !reason.trim()) return;

    try {
      await addDoc(collection(db, 'reports'), {
        targetId: post.id,
        targetType: 'post',
        reporterId: user.uid,
        reporterName: profile?.displayName || user.displayName || '匿名島民',
        reason: reason.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      try {
        await addDoc(collection(db, 'notifications'), {
          recipientId: STATION_MASTER_UID,
          senderId: user.uid,
          senderName: profile?.displayName || user.displayName || '匿名島民',
          type: 'report',
          postId: post.id,
          category: post.category || '未分類',
          title: '⚠ 收到新的檢舉',
          content: `有人檢舉了一篇貼文：${reason.trim()}`,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notificationErr) {
        console.warn('Report was created, but notification failed:', notificationErr);
        alert('檢舉已送出，但站長通知建立失敗。請檢查 Firebase Console 的 notifications 規則或收件 UID。');
        return;
      }

      alert('感謝檢舉！站長已收到通知。');
    } catch (err: any) {
      console.error(err);

      if (err.message.includes('permission-denied') || err.message.includes('insufficient permissions')) {
        alert("檢舉失敗：資料庫規則限制寫入。請確認已設定 Firebase Security Rules。");
      } else {
        alert('檢舉失敗，請稍後再試。');
      }

      handleFirestoreError(err, OperationType.CREATE, 'reports');
    }
  };

  const canModerate = user && (post.authorId === user.uid || profile?.role === 'admin');

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
                  role: authorProfile?.role
                }} 
                className="w-10 h-10 rounded-full" 
              />
              <div className="absolute inset-0 rounded-full border border-line group-hover:border-bio-glow transition-colors" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 
                  onClick={() => onOpenProfile(post.authorId)} 
                  className={`font-bold text-sm leading-none cursor-pointer hover:opacity-80 transition-all ${authorProfile?.role === 'admin' ? 'rgb-text' : 'text-text-main/90 hover:text-bio-glow'}`}
                >
                  {authorProfile?.displayName || post.authorName}
                </h3>
                {authorProfile?.role === 'admin' && (
                  <span className="text-[0.5625rem] bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-1.5 py-0.5 rounded-sm font-black uppercase tracking-tighter shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    站長
                  </span>
                )}
                {authorProfile?.title && authorProfile?.role !== 'admin' && (
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

        <div className="text-text-main/90 leading-relaxed whitespace-pre-wrap text-[0.9375rem] selection:bg-blue-500/30">
          {post.content}
        </div>

        {post.imageUrls && post.imageUrls.length > 0 && (
          <div className={`grid gap-2 ${
            post.imageUrls.length === 1 ? 'grid-cols-1' : 
            post.imageUrls.length === 2 ? 'grid-cols-2' : 
            'grid-cols-2 sm:grid-cols-3'
          }`}>
            {post.imageUrls.map((url, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ scale: 1.02 }}
                className={`overflow-hidden rounded-2xl border border-line shadow-lg ${
                  post.imageUrls?.length === 3 && idx === 0 ? 'sm:col-span-2' : ''
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

        <div className="flex items-center gap-6 pt-5 border-t border-line">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-110 ${isLiked ? 'text-rose-500 glow-text' : 'text-text-muted hover:text-rose-500'}`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            {likes}
          </button>
          <button 
            onClick={fetchComments}
            className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-bio-glow transition-all font-display cursor-pointer active:scale-110"
          >
            <MessageSquare className="w-4 h-4" />
            {post.commentsCount}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-mist/20 border-t border-line"
          >
            <div className="p-6 space-y-6">
              {user && (
                <form onSubmit={handleAddComment} className="flex gap-3">
                  <input 
                    type="text" 
                    placeholder="隱密地回覆..."
                    className="flex-1 bg-mist border border-line rounded-xl px-4 py-2 text-sm text-text-main focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none placeholder:text-text-muted/40"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                  />
                  <button className="bg-mist/50 text-text-main p-2.5 rounded-xl hover:bg-mist transition-all border border-line cursor-pointer active:scale-95">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <button onClick={() => onOpenProfile(comment.authorId)} className="cursor-pointer active:scale-95 transition-transform">
                      <UserAvatar 
                         p={{ 
                           islanderId: comment.authorRole === 'admin' ? 'L' : comment.authorId, 
                           photoURL: comment.authorPhoto,
                           displayName: comment.authorName
                         }} 
                         className="w-6 h-6 rounded-full mt-1 opacity-80 hover:opacity-100 transition-opacity" 
                      />
                    </button>
                    <div className="flex-1 bg-mist p-4 rounded-2xl border border-line shadow-sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span 
                            onClick={() => onOpenProfile(comment.authorId)} 
                            className={`font-bold text-[0.625rem] uppercase tracking-wider cursor-pointer hover:opacity-80 transition-all ${comment.authorRole === 'admin' ? 'rgb-text' : 'text-text-muted hover:text-bio-glow'}`}
                          >
                            {comment.authorName}
                          </span>
                          {comment.authorRole === 'admin' && (
                            <span className="text-[0.5rem] bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white px-1 rounded-sm font-bold uppercase shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                              站長
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[0.5625rem] text-text-muted font-display">
                            {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { locale: zhTW }) : ''}
                          </span>
                          {(user && (comment.authorId === user.uid || profile?.role === 'admin')) && (
                             <button 
                               onClick={async (e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 if (post.id.startsWith('sample-')) {
                                   alert('範例回覆無法真實刪除。');
                                   return;
                                 }
                                 if(window.confirm('確定要刪除這則回覆嗎？')){
                                   try {
                                     console.log('Deleting comment:', comment.id);
                                     await deleteDoc(doc(db, 'posts', post.id, 'comments', comment.id));
                                     await updateDoc(doc(db, 'posts', post.id), { commentsCount: increment(-1) });
                                     console.log('Comment deleted');
                                   } catch (err: any) {
                                     console.error('Delete comment error:', err);
                                     alert('刪除留言失敗：' + (err.message.includes('permission-denied') ? '權限不足。' : err.message));
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
                      <p className="text-sm text-text-main/90 leading-relaxed">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

