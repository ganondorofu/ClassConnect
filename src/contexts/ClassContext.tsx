"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from './AuthContext';
import { getClassByCode, getClassById } from '@/controllers/classController';
import type { ClassInfo } from '@/models/class';
import { setCurrentClassId } from '@/lib/classUtils';

interface ClassContextType {
  classId: string | null;
  classInfo: ClassInfo | null;
  joinClass: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ClassContext = createContext<ClassContextType | undefined>(undefined);

export const ClassProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);

  const loadClass = async (id: string | null) => {
    setCurrentClassId(id);
    if (id) {
      const info = await getClassById(id);
      setClassInfo(info);
    } else {
      setClassInfo(null);
    }
  };

  const refresh = async () => {
    if (!user) return;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const id = userDoc.exists() ? userDoc.data().classId || null : null;
    setClassId(id);
    await loadClass(id);
  };

  useEffect(() => {
    refresh();
  }, [user]);

  const joinClass = async (code: string) => {
    if (!user) throw new Error('Not authenticated');
    const cls = await getClassByCode(code);
    if (!cls) throw new Error('Class not found');
    await setDoc(doc(db, 'users', user.uid), { classId: cls.id }, { merge: true });
    setClassId(cls.id);
    await loadClass(cls.id);
  };

  return (
    <ClassContext.Provider value={{ classId, classInfo, joinClass, refresh }}>
      {children}
    </ClassContext.Provider>
  );
};

export const useClass = (): ClassContextType => {
  const context = useContext(ClassContext);
  if (!context) throw new Error('useClass must be used within ClassProvider');
  return context;
};
