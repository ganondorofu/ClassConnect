
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
import { prepareStateForLog } from '@/lib/logUtils'; // Import from new location
import { getCurrentClassId } from '@/lib/classUtils';

const getInquiriesCollectionRef = () => collection(db, 'classes', getCurrentClassId(), 'inquiries');

const parseInquiryTimestamp = (timestampField: any): Date | Timestamp => {
  if (!timestampField) return new Date(); 
  if (timestampField instanceof Timestamp) return timestampField;
  if (typeof timestampField.toDate === 'function') return timestampField.toDate();
  if (timestampField instanceof Date) return timestampField;
  if (typeof timestampField === 'object' && timestampField.seconds !== undefined && timestampField.nanoseconds !== undefined) {
    try {
      return new Timestamp(timestampField.seconds, timestampField.nanoseconds).toDate();
    } catch (e) {
      console.warn("Failed to parse plain object as Timestamp for inquiry:", timestampField, e);
      return new Date(); 
    }
  }
  return new Date(); 
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
    const docRef = await addDoc(getInquiriesCollectionRef(), inquiryData);
    // For logging, we can't get serverTimestamp value client-side easily before logging.
    // We'll log what we have, or re-fetch if exact timestamp is critical for log.
    // For simplicity, log the data sent, acknowledging serverTimestamp will be different.
    const afterState = { id: docRef.id, ...data, status: 'new', createdAt: new Date(), updatedAt: new Date() }; // Approximate
    await logAction('add_inquiry', { after: prepareStateForLog(afterState) }, 'anonymous_inquiry_submission');
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
    const q = query(getInquiriesCollectionRef(), orderBy('createdAt', 'desc'));
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
  const docRef = doc(getInquiriesCollectionRef(), inquiryId);
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
    
    // For logging, approximate 'after' state.
    const afterState = { ...beforeState, status, updatedAt: new Date() } as Inquiry;
    await logAction('update_inquiry_status', { 
        before: prepareStateForLog(beforeState), 
        after: prepareStateForLog(afterState), 
        inquiryId 
    }, userId);
  } catch (error) {
    console.error("Error updating inquiry status:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため問い合わせステータスを更新できませんでした。");
    }
    throw error;
  }
};

