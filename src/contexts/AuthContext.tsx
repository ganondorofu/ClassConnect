
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, UserCredential } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { ReactNode} from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { app, db } from '@/config/firebase';
import { useRouter } from 'next/navigation'; // For navigation
import { useToast } from '@/hooks/use-toast';

export interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  isAnonymous: boolean;
  role: 'teacher' | 'student' | null;
  login: (email: string, pass: string) => Promise<UserCredential | null>;
  logout: () => Promise<void>;
  setAnonymousAccess: (isAnon: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const auth = getAuth(app);
const ANONYMOUS_ACCESS_KEY = 'classconnect_anonymous_access';

const fetchUserRole = async (uid: string): Promise<'teacher' | 'student'> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return (data.role as 'teacher' | 'student') || 'student';
    }
    await setDoc(doc(db, 'users', uid), { role: 'student' }, { merge: true });
    return 'student';
  } catch (e) {
    console.error('Failed to fetch user role:', e);
    return 'student';
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [role, setRole] = useState<'teacher' | 'student' | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const storedAnonymousAccess = localStorage.getItem(ANONYMOUS_ACCESS_KEY);
    if (storedAnonymousAccess === 'true') {
      setIsAnonymous(true);
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsAnonymous(false); // If user logs in, they are not anonymous
        localStorage.removeItem(ANONYMOUS_ACCESS_KEY);
        const r = await fetchUserRole(firebaseUser.uid);
        setRole(r);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string): Promise<UserCredential | null> => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      setIsAnonymous(false);
      localStorage.removeItem(ANONYMOUS_ACCESS_KEY);
      const r = await fetchUserRole(userCredential.user.uid);
      setRole(r);
      toast({ title: 'ログイン成功', description: 'ようこそ！' });
      return userCredential;
    } catch (error: any) {
      console.error("Login error:", error);
      let errorMessage = 'ログインに失敗しました。';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'メールアドレスの形式が正しくありません。';
      }
      toast({ title: 'ログイン失敗', description: errorMessage, variant: 'destructive' });
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setIsAnonymous(false); // Reset anonymous state on logout
      setRole(null);
      localStorage.removeItem(ANONYMOUS_ACCESS_KEY);
      toast({ title: 'ログアウトしました' });
      router.push('/'); // Redirect to home page after logout
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: 'ログアウト失敗', description: 'ログアウト中にエラーが発生しました。', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const setAnonymousAccess = (isAnon: boolean) => {
    setIsAnonymous(isAnon);
    if (isAnon) {
      localStorage.setItem(ANONYMOUS_ACCESS_KEY, 'true');
      if (user) { // If a user was logged in, log them out before setting anonymous
        signOut(auth).then(() => setUser(null));
      }
      setRole(null);
    } else {
      localStorage.removeItem(ANONYMOUS_ACCESS_KEY);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAnonymous, role, setAnonymousAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
