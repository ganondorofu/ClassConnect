
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  FirestoreError,
  addDoc, 
  getDoc, 
  where, 
} from 'firebase/firestore';
import type { Subject } from '@/models/subject';
import { logAction } from '@/services/logService';

const CURRENT_CLASS_ID = 'defaultClass'; 
const subjectsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'subjects');
const fixedTimetableCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'fixedTimetable');
const dailyAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'dailyAnnouncements');

export const getSubjects = async (): Promise<Subject[]> => {
  try {
    const q = query(subjectsCollectionRef, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
  } catch (error) {
    console.error("Error fetching subjects:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      return [];
    }
    if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
        console.error("Firestore query for subjects requires an index on 'name'. Please create it.");
        throw new Error("Firestore 科目クエリに必要なインデックス(name)がありません。作成してください。");
    }
    throw error;
  }
};

export const addSubject = async (name: string, teacherName: string, userId: string = 'system_add_subject'): Promise<string> => {
  if (!name || !teacherName) {
    throw new Error("科目名と教員名は必須です。");
  }
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: teacherName.trim(),
  };
  try {
    const docRef = await addDoc(subjectsCollectionRef, dataToSet);
    const newSubjectWithId = { id: docRef.id, ...dataToSet };
    await logAction('add_subject', {
        before: null,
        after: newSubjectWithId
    }, userId); // Pass userId to logAction
    return docRef.id;
  } catch (error) {
    console.error("Error adding subject:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため科目を追加できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
        console.error("Firestore Error: Attempted to save 'undefined' in subject. Check data structure.", dataToSet);
        throw new Error("科目データに無効な値(undefined)が含まれていました。");
   }
    throw error;
  }
};

export const updateSubject = async (id: string, name: string, teacherName: string, userId: string = 'system_update_subject'): Promise<void> => {
   if (!id) throw new Error("Subject ID is required for updates.");
   if (!name || !teacherName) throw new Error("科目名と教員名は必須です。");

  const docRef = doc(subjectsCollectionRef, id);
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: teacherName.trim(),
  };
  let beforeState: Subject | null = null;

  try {
    const oldSnap = await getDoc(docRef);
    if (oldSnap.exists()) {
        beforeState = { id: oldSnap.id, ...oldSnap.data() } as Subject;
    }

    await setDoc(docRef, dataToSet, { merge: true });
    const afterState = { id, ...dataToSet };
    await logAction('update_subject', {
        before: beforeState,
        after: afterState
     }, userId); // Pass userId to logAction
  } catch (error) {
    console.error("Error updating subject:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため科目を更新できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
        console.error("Firestore Error: Attempted to save 'undefined' in subject update. Check data structure.", dataToSet);
        throw new Error("更新データに無効な値(undefined)が含まれていました。");
   }
    throw error;
  }
};

export const deleteSubject = async (id: string, userId: string = 'system_delete_subject'): Promise<void> => {
  if (!id) throw new Error("Subject ID is required for deletion.");
  const subjectDocRef = doc(subjectsCollectionRef, id);
  let beforeState: Subject | null = null;
  let referencesUpdatedCount = 0;

  try {
    const batch = writeBatch(db);
    const subjectSnap = await getDoc(subjectDocRef);
    if (subjectSnap.exists()) {
      beforeState = { id: subjectSnap.id, ...subjectSnap.data() } as Subject;
    } else {
      console.warn(`Subject with ID ${id} not found for deletion.`);
      throw new Error(`科目 (ID: ${id}) が見つかりませんでした。`);
    }

    const fixedUsageQuery = query(fixedTimetableCollectionRef, where('subjectId', '==', id));
    const fixedUsageSnapshot = await getDocs(fixedUsageQuery);
    fixedUsageSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { subjectId: null });
      referencesUpdatedCount++;
    });

    const dailyUsageQuery = query(dailyAnnouncementsCollectionRef, where('subjectIdOverride', '==', id));
    const dailyUsageSnapshot = await getDocs(dailyUsageQuery);
    dailyUsageSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { subjectIdOverride: null });
      referencesUpdatedCount++;
    });

    batch.delete(subjectDocRef);
    await batch.commit();

    await logAction('delete_subject', {
      before: beforeState,
      after: null,
      meta: { referencesUpdatedCount }
    }, userId); // Pass userId to logAction

  } catch (error: any) {
    console.error(`Error deleting subject ${id} and updating references:`, error);
    if ((error as FirestoreError)?.code === 'unavailable') {
      throw new Error("オフラインのため科目削除および関連箇所の更新ができませんでした。");
    }
    throw new Error(`科目の削除および関連箇所の更新中にエラーが発生しました: ${error.message}`);
  }
};

export const onSubjectsUpdate = (
    callback: (subjects: Subject[]) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
    const q = query(subjectsCollectionRef, orderBy('name'));
    return onSnapshot(q, (snapshot) => {
        const subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
        callback(subjects);
    }, (error) => {
      console.error("Snapshot error on subjects:", error);
      if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
          console.error("Firestore query for subjects requires an index on 'name' for realtime updates. Please create it.");
          if (onError) {
              onError(new Error("Firestore 科目クエリに必要なインデックス(name) がありません (realtime)。作成してください。"));
          }
      } else if (onError) {
         onError(error);
      }
    });
};

export const queryFnGetSubjects = () => getSubjects();
