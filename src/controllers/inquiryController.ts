
import { db } from '@/config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
  FirestoreError,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import type { Inquiry, InquiryStatus } from '@/models/inquiry';
import { logAction } from '@/services/logService';

const CURRENT_CLASS_ID = 'defaultClass';
const inquiriesCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'inquiries');

// Helper to parse Firestore Timestamps
const parseInquiryTimestamp = (timestampField: any): Date | Timestamp => {
  if (!timestampField) return new Date(); // Default to now if undefined
  if (timestampField instanceof Timestamp) return timestampField;
  if (typeof timestampField.toDate === 'function') return timestampField.toDate();
  if (timestampField instanceof Date) return timestampField;
  // Attempt to parse from seconds/nanoseconds if it's a plain object
  if (typeof timestampField === 'object' && timestampField.seconds !== undefined && timestampField.nanoseconds !== undefined) {
    try {
      return new Timestamp(timestampField.seconds, timestampField.nanoseconds).toDate();
    } catch (e) {
      console.warn("Failed to parse plain object as Timestamp for inquiry:", timestampField, e);
      return new Date(); // Fallback
    }
  }
  return new Date(); // Fallback for other unexpected types
};


export const addInquiry = async (data: Omit<Inquiry, 'id' | 'createdAt' | 'status' | 'updatedAt'>): Promise<string> => {
  try {
    const inquiryData = {
      ...data,
      email: data.email || null,
      status: 'new' as InquiryStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(inquiriesCollectionRef, inquiryData);
    await logAction('add_inquiry', { after: { id: docRef.id, ...inquiryData } }, 'anonymous_inquiry_submission');
    return docRef.id;
  } catch (error) {
    console.error("Error adding inquiry:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため問い合わせを送信できませんでした。");
    }
    throw error;
  }
};

export const getInquiries = async (): Promise<Inquiry[]> => {
  try {
    const q = query(inquiriesCollectionRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type,
        content: data.content,
        email: data.email,
        status: data.status,
        createdAt: parseInquiryTimestamp(data.createdAt),
        updatedAt: data.updatedAt ? parseInquiryTimestamp(data.updatedAt) : parseInquiryTimestamp(data.createdAt),
      } as Inquiry;
    });
  } catch (error) {
    console.error("Error fetching inquiries:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      return [];
    }
    if ((error as FirestoreError).code === 'failed-precondition') {
        console.error("Firestore query for inquiries requires an index on 'createdAt'. Please create it in firestore.indexes.json.");
        throw new Error("Firestore 問い合わせクエリに必要なインデックス(createdAt)がありません。作成してください。");
    }
    throw error;
  }
};
export const queryFnGetInquiries = () => getInquiries();

export const updateInquiryStatus = async (inquiryId: string, status: InquiryStatus, userId: string): Promise<void> => {
  const docRef = doc(inquiriesCollectionRef, inquiryId);
  try {
    const oldSnap = await getDoc(docRef);
    let beforeState: Inquiry | null = null;
    if (oldSnap.exists()) {
        const oldData = oldSnap.data();
        beforeState = {
             id: oldSnap.id, ...oldData,
             createdAt: parseInquiryTimestamp(oldData.createdAt),
             updatedAt: oldData.updatedAt ? parseInquiryTimestamp(oldData.updatedAt) : parseInquiryTimestamp(oldData.createdAt),
        } as Inquiry;
    }

    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });

    // For logging, approximate 'after' state. Actual timestamp is server-side.
    const afterState = { ...beforeState, status, updatedAt: new Date() } as Inquiry;
    await logAction('update_inquiry_status', { before: beforeState, after: afterState, inquiryId }, userId);
  } catch (error) {
    console.error("Error updating inquiry status:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため問い合わせステータスを更新できませんでした。");
    }
    throw error;
  }
};
