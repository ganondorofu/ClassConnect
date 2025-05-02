
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
  addDoc, // Use addDoc for auto-generated IDs
  getDoc, // Import getDoc
} from 'firebase/firestore';
import type { Subject } from '@/models/subject';
import { logAction } from '@/services/logService'; // Import logAction

/**
 * Placeholder for the current class ID.
 * In a real app, this would come from user context or routing.
 */
const CURRENT_CLASS_ID = 'defaultClass'; // Replace with dynamic class ID logic

// --- Firestore Collection References ---
const subjectsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'subjects');

// Helper function to create a plain object suitable for logging
const prepareSubjectForLog = (subject: Subject | null): object | null => {
  if (!subject) return null;
  // Return a plain object without the ID if it exists, as ID is often the doc key
  const { id, ...loggableSubject } = subject;
  return loggableSubject;
};


// --- Subject Management Functions ---

/**
 * Fetches all subjects for the current class, ordered by name.
 * @returns {Promise<Subject[]>} Array of subjects.
 */
export const getSubjects = async (): Promise<Subject[]> => {
  try {
    const q = query(subjectsCollectionRef, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
  } catch (error) {
    console.error("Error fetching subjects:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      console.warn("Client is offline. Returning empty subjects list.");
      return [];
    }
    // Handle potential index errors if orderBy is used without an index
    if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
        console.error("Firestore query for subjects requires an index on 'name'. Please create it.");
        throw new Error("Firestore 科目クエリに必要なインデックス(name)がありません。作成してください。");
    }
    throw error;
  }
};

/**
 * Adds a new subject to the current class.
 * @param {string} name - The name of the subject.
 * @param {string} teacherName - The name of the teacher.
 * @returns {Promise<string>} The ID of the newly created subject.
 */
export const addSubject = async (name: string, teacherName: string): Promise<string> => {
  if (!name || !teacherName) {
    throw new Error("科目名と教員名は必須です。");
  }
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: teacherName.trim(),
  };
  try {
    const docRef = await addDoc(subjectsCollectionRef, dataToSet); // Automatically generates ID
    const newSubjectLogData = { id: docRef.id, ...dataToSet }; // Include ID for context in log if needed
    await logAction('add_subject', {
        before: null,
        after: prepareSubjectForLog(newSubjectLogData) // Log the plain object
    });
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

/**
 * Updates an existing subject.
 * @param {string} id - The ID of the subject to update.
 * @param {string} name - The updated name of the subject.
 * @param {string} teacherName - The updated name of the teacher.
 * @returns {Promise<void>}
 */
export const updateSubject = async (id: string, name: string, teacherName: string): Promise<void> => {
   if (!id) throw new Error("Subject ID is required for updates.");
   if (!name || !teacherName) throw new Error("科目名と教員名は必須です。");

  const docRef = doc(subjectsCollectionRef, id);
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: teacherName.trim(),
  };
  let beforeState: Subject | null = null;

  try {
    // Fetch old data for logging 'before' state
    const oldSnap = await getDoc(docRef);
    if (oldSnap.exists()) {
        beforeState = { id: oldSnap.id, ...oldSnap.data() } as Subject;
    }

    await setDoc(docRef, dataToSet, { merge: true }); // Use merge:true or simply setDoc to overwrite
    const afterState = { id, ...dataToSet };
    await logAction('update_subject', {
        before: prepareSubjectForLog(beforeState), // Log plain objects
        after: prepareSubjectForLog(afterState)
     });
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

/**
 * Deletes a subject.
 * @param {string} id - The ID of the subject to delete.
 * @returns {Promise<void>}
 */
export const deleteSubject = async (id: string): Promise<void> => {
  if (!id) throw new Error("Subject ID is required for deletion.");
  const docRef = doc(subjectsCollectionRef, id);
  let beforeState: Subject | null = null;

  // --- Optional: Check if subject is in use before deleting ---
  // This requires querying fixedTimetable and potentially dailyAnnouncements
  // For simplicity, this check is omitted here, but crucial for production.
  // const fixedTimetableRef = collection(db, 'classes', CURRENT_CLASS_ID, 'fixedTimetable');
  // const q = query(fixedTimetableRef, where('subjectId', '==', id), limit(1));
  // const usageCheck = await getDocs(q);
  // if (!usageCheck.empty) {
  //   throw new Error("削除できません。この科目は時間割で使用されています。");
  // }
  // --- End Optional Check ---

  try {
     // Fetch old data for logging 'before' state
     const oldSnap = await getDoc(docRef);
     if (oldSnap.exists()) {
         beforeState = { id: oldSnap.id, ...oldSnap.data() } as Subject;
     }

    await deleteDoc(docRef);

    if (beforeState) { // Only log if the document actually existed
        await logAction('delete_subject', {
            before: prepareSubjectForLog(beforeState), // Log plain object
            after: null
        });
    }
  } catch (error) {
    console.error("Error deleting subject:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため科目を削除できませんでした。");
    }
    throw error;
  }
};

/**
 * Subscribes to real-time updates for the subjects list.
 * @param {(subjects: Subject[]) => void} callback - Function to call with the updated subjects list.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
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
              onError(new Error("Firestore 科目クエリに必要なインデックス(name)がありません (realtime)。作成してください。"));
          }
      } else if (onError) {
         onError(error);
      }
    });
};


// --- React Query Integration Helpers ---
export const queryFnGetSubjects = () => getSubjects();

