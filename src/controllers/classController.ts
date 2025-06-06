import { db } from '@/config/firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import type { ClassInfo } from '@/models/class';

const classesCollection = collection(db, 'classes');

const generateClassCode = () => Math.random().toString(36).substring(2, 8);

export const createClass = async (name: string): Promise<string> => {
  const classData = {
    name,
    code: generateClassCode(),
    createdAt: Timestamp.now(),
  };
  const docRef = await addDoc(classesCollection, classData);
  return docRef.id;
};

export const getClassByCode = async (code: string): Promise<ClassInfo | null> => {
  const q = query(classesCollection, where('code', '==', code));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as Omit<ClassInfo, 'id'>) };
};

export const getClassById = async (id: string): Promise<ClassInfo | null> => {
  const docRef = doc(classesCollection, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...(docSnap.data() as Omit<ClassInfo, 'id'>) } : null;
};
