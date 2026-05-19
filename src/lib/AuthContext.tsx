import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, onAuthStateChanged, db, doc, getDoc, setDoc, updateDoc, serverTimestamp, handleFirestoreError, OperationType } from './firebase';
import { User } from 'firebase/auth';

export const DEFAULT_ISLANDER_PHOTO = '__DEFAULT_ISLANDER__';
const STATION_MASTER_UID = 'gHHxF8p1DnbMkoeVmU5XpB18Elz2';

export interface UserProfile {
  uid: string;
  islanderId: string;
  displayName: string | null;
  photoURL: string | null;
  role: 'user' | 'admin';
  agreedToTerms: boolean;
  isProfileSetup: boolean;
  createdAt: any;
  bio?: string;
  title?: string;
  lastProfileUpdate?: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  profile: UserProfile | null;
  agreeToTerms: (profileData: { displayName: string; photoURL: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileData: (data: { bio?: string; title?: string; displayName?: string; photoURL?: string; isProfileSetup?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  error: null,
  profile: null,
  agreeToTerms: async () => {},
  refreshProfile: async () => {},
  updateProfileData: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshProfile = async () => {
    if (user) {
      const userPath = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setProfile(userSnap.data() as UserProfile);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    }
  };

  const agreeToTerms = async (profileData: { displayName: string; photoURL: string }) => {
    if (user) {
      const userPath = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        const updateData: any = { 
          agreedToTerms: true,
          isProfileSetup: true,
          displayName: profileData.displayName,
          photoURL: profileData.photoURL
        };
        await setDoc(userRef, updateData, { merge: true });
        await refreshProfile();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      }
    }
  };

  const updateProfileData = async (data: { bio?: string; title?: string; displayName?: string; photoURL?: string; isProfileSetup?: boolean }) => {
    if (user) {
      const userPath = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          ...data,
          lastProfileUpdate: serverTimestamp()
        });
        await refreshProfile();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      }
    }
  };

  useEffect(() => {
    // Timeout to prevent infinite loading if Firebase hangs
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn('Firebase initialization is taking longer than expected. Possible connectivity issue.');
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeoutId);
      try {
        setUser(user);
        if (user) {
          const userPath = `users/${user.uid}`;
          try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              // Generate a unique islander ID: 8 characters alphanumeric (high entropy)
              // Total length will be 8, which is within 6-12 range
              // SPECIAL RULE: Admin user gets "L" as requested
              let islanderId = '';
              if (user.uid === STATION_MASTER_UID) {
                islanderId = 'L';
              } else {
                const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                for (let i = 0; i < 8; i++) {
                  islanderId += chars.charAt(Math.floor(Math.random() * chars.length));
                }
              }
              
              const newProfile = {
                uid: user.uid,
                islanderId: islanderId,
                displayName: islanderId === 'L' ? '站長' : `島民 ${islanderId.substring(0, 4)}`, // Custom default for station master
                photoURL: islanderId === 'L' ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}` : DEFAULT_ISLANDER_PHOTO, 
                role: user.uid === STATION_MASTER_UID ? 'admin' : 'user',
                agreedToTerms: user.uid === STATION_MASTER_UID,
                isProfileSetup: user.uid === STATION_MASTER_UID,
                createdAt: serverTimestamp(),
              };
              // Note: We don't store email in the profile document to ensure anonymity
              await setDoc(userRef, newProfile);
              setProfile(newProfile as UserProfile);
            } else {
              const data = userSnap.data() as UserProfile;
              setProfile(data);
            }
          } catch (syncError: any) {
            console.error('Profile sync error:', syncError);
            // If offline, we might still have user auth, so let's continue
            if (syncError.message.includes('offline') || syncError.code === 'unavailable') {
              setError(new Error('無法連線至資料庫。請確認您的網路連線或 Firebase 設定。'));
            } else if (syncError.message.includes('permission-denied')) {
              console.warn('Firestore permissions issues detected. Check your rules.');
            }
          }
        } else {
          setProfile(null);
        }
      } catch (err: any) {
        console.error('Auth sync root error:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, profile, agreeToTerms, refreshProfile, updateProfileData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
