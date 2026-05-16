import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocFromServer, setDoc, updateDoc, collection, getDocs, addDoc, query, orderBy, onSnapshot, where, serverTimestamp, increment, deleteDoc, enableNetwork } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Storage
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error Detail:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test and diagnostic
async function diagnosticTest() {
  try {
    // Attempt to wake up network
    await enableNetwork(db);
    
    // Quick ping test
    const pingPromise = getDocFromServer(doc(db, '_status_', 'ping'));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore Connection Timeout')), 5000)
    );
    
    await Promise.race([pingPromise, timeoutPromise]);
    console.log("✅ Firestore 連線測試成功");
  } catch (error: any) {
    if (error.message?.includes('offline') || error.code === 'unavailable' || error.message?.includes('Timeout')) {
      console.warn("⚠️ Firestore 無法連線。請確認您已在 Firebase Console 建立資料庫！");
    } else {
      console.log("ℹ️ Firestore 狀態:", error.message);
    }
  }
}

diagnosticTest();

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc, 
  getDoc, 
  getDocFromServer,
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  where, 
  getDocs,
  serverTimestamp,
  increment,
  deleteDoc
};
