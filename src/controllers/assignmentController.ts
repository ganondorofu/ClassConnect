
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
  FirestoreError,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { getCurrentClassId } from '@/lib/classUtils';
import type { Assignment, GetAssignmentsFilters, GetAssignmentsSort } from '@/models/assignment';
import { logAction } from '@/services/logService';
import { prepareStateForLog } from '@/lib/logUtils';
import { parseISO, isValid, format, startOfDay } from 'date-fns';

const getAssignmentsCollectionRef = () => collection(db, 'classes', getCurrentClassId(), 'assignments');

const parseAssignmentTimestamp = (timestampField: any): Date => {
  if (!timestampField) return new Date();
  if (timestampField instanceof Timestamp) return timestampField.toDate();
  if (typeof timestampField.toDate === 'function') return timestampField.toDate();
  if (timestampField instanceof Date) return timestampField;
  if (typeof timestampField === 'object' && timestampField.seconds !== undefined && timestampField.nanoseconds !== undefined) {
    try {
      return new Timestamp(timestampField.seconds, timestampField.nanoseconds).toDate();
    } catch (e) {
      console.warn("Failed to parse plain object as Timestamp for assignment:", timestampField, e);
      return new Date();
    }
  }
  console.warn("Unparseable timestamp field for assignment:", timestampField);
  return new Date();
};

export const addAssignment = async (data: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'itemType'>, userId: string): Promise<string> => {
  try {
    const assignmentData: Omit<Assignment, 'id'> = {
      ...data,
      subjectId: data.subjectId || null,
      dueDate: format(parseISO(data.dueDate), 'yyyy-MM-dd'),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      itemType: 'assignment',
    };
    const docRef = await addDoc(getAssignmentsCollectionRef(), assignmentData);
    const afterState = { id: docRef.id, ...assignmentData };
    await logAction('add_assignment', { after: prepareStateForLog(afterState) }, userId);
    return docRef.id;
  } catch (error) {
    console.error("Error adding assignment:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため課題を追加できませんでした。");
    }
    throw error;
  }
};

export const updateAssignment = async (assignmentId: string, data: Partial<Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'itemType'>>, userId: string): Promise<void> => {
  const docRef = doc(getAssignmentsCollectionRef(), assignmentId);
  try {
    const oldSnap = await getDoc(docRef);
    let beforeState: Assignment | null = null;
    if (oldSnap.exists()) {
      const oldData = oldSnap.data();
      beforeState = {
        id: oldSnap.id, ...oldData,
        createdAt: parseAssignmentTimestamp(oldData.createdAt),
        updatedAt: parseAssignmentTimestamp(oldData.updatedAt),
        itemType: 'assignment',
      } as Assignment;
    }

    const updateData = { ...data, updatedAt: Timestamp.now() };
    if (updateData.dueDate && typeof updateData.dueDate === 'string') {
        updateData.dueDate = format(parseISO(updateData.dueDate), 'yyyy-MM-dd');
    } else if (updateData.dueDate instanceof Date) {
        updateData.dueDate = format(updateData.dueDate, 'yyyy-MM-dd');
    }

    await updateDoc(docRef, updateData);
    
    const newSnap = await getDoc(docRef);
    let afterState: Assignment | null = null;
    if (newSnap.exists()) {
        const newData = newSnap.data();
        afterState = {
            id: newSnap.id, ...newData,
            createdAt: parseAssignmentTimestamp(newData.createdAt),
            updatedAt: parseAssignmentTimestamp(newData.updatedAt),
            itemType: 'assignment',
        } as Assignment;
    }
    
    await logAction('update_assignment', { 
        before: prepareStateForLog(beforeState), 
        after: prepareStateForLog(afterState), 
        assignmentId 
    }, userId);
  } catch (error) {
    console.error("Error updating assignment:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため課題を更新できませんでした。");
    }
    throw error;
  }
};

export const deleteAssignment = async (assignmentId: string, userId: string): Promise<void> => {
  const docRef = doc(getAssignmentsCollectionRef(), assignmentId);
  try {
    const oldSnap = await getDoc(docRef);
    let beforeState: Assignment | null = null;
    if (oldSnap.exists()) {
      const oldData = oldSnap.data();
      beforeState = {
        id: oldSnap.id, ...oldData,
        createdAt: parseAssignmentTimestamp(oldData.createdAt),
        updatedAt: parseAssignmentTimestamp(oldData.updatedAt),
        itemType: 'assignment',
      } as Assignment;
    }
    await deleteDoc(docRef);
    await logAction('delete_assignment', { before: prepareStateForLog(beforeState), assignmentId }, userId);
  } catch (error) {
    console.error("Error deleting assignment:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため課題を削除できませんでした。");
    }
    throw error;
  }
};

export const getAssignments = async (
  filters?: GetAssignmentsFilters,
  sort?: GetAssignmentsSort
): Promise<Assignment[]> => {
  let q = query(getAssignmentsCollectionRef());
  const todayString = format(startOfDay(new Date()), 'yyyy-MM-dd');

  if (filters) {
    if (filters.subjectId !== undefined) {
      q = query(q, where('subjectId', '==', filters.subjectId));
    }
    if (filters.dueDateStart) {
      q = query(q, where('dueDate', '>=', filters.dueDateStart));
    }
    if (filters.dueDateEnd) {
      q = query(q, where('dueDate', '<=', filters.dueDateEnd));
    }
    if (filters.duePeriod !== undefined) { 
      q = query(q, where('duePeriod', '==', filters.duePeriod));
    }
    // Handle includePastDue filter
    if (filters.includePastDue === false || filters.includePastDue === undefined) {
      q = query(q, where('dueDate', '>=', todayString));
    }
  } else {
    // Default: do not include past due if no filters object is provided
    q = query(q, where('dueDate', '>=', todayString));
  }


  const sortBy = sort?.field || 'dueDate';
  const sortDirection = sort?.direction || 'asc';
  q = query(q, orderBy(sortBy, sortDirection));
  if (sortBy !== 'dueDate') { 
    q = query(q, orderBy('dueDate', 'asc'));
  }


  try {
    const snapshot = await getDocs(q);
    let assignments = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        title: data.title,
        description: data.description,
        subjectId: data.subjectId,
        customSubjectName: data.customSubjectName,
        dueDate: data.dueDate,
        duePeriod: data.duePeriod,
        submissionMethod: data.submissionMethod,
        targetAudience: data.targetAudience,
        createdAt: parseAssignmentTimestamp(data.createdAt),
        updatedAt: parseAssignmentTimestamp(data.updatedAt),
        itemType: 'assignment',
      } as Assignment;
    });

    if (filters?.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      assignments = assignments.filter(
        (a) =>
          a.title.toLowerCase().includes(term) ||
          a.description.toLowerCase().includes(term) ||
          (a.customSubjectName && a.customSubjectName.toLowerCase().includes(term)) ||
          (a.submissionMethod && a.submissionMethod.toLowerCase().includes(term)) ||
          (a.targetAudience && a.targetAudience.toLowerCase().includes(term))
      );
    }

    return assignments;
  } catch (error) {
    console.error("Error fetching assignments:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      return [];
    }
    if ((error as FirestoreError).code === 'failed-precondition') {
        console.error("Firestore query for assignments might require an index. Error:", (error as FirestoreError).message);
    }
    throw error;
  }
};

export const queryFnGetAssignments = (filters?: GetAssignmentsFilters, sort?: GetAssignmentsSort) => 
  () => getAssignments(filters, sort);


type Unsubscribe = () => void;

export const onAssignmentsUpdate = (
    callback: (assignments: Assignment[]) => void,
    onError: (error: Error) => void,
    filters?: GetAssignmentsFilters, 
    sort?: GetAssignmentsSort 
): Unsubscribe => {
    let q = query(getAssignmentsCollectionRef());
    const todayString = format(startOfDay(new Date()), 'yyyy-MM-dd');

    if (filters) {
        if (filters.subjectId !== undefined) {
            q = query(q, where('subjectId', '==', filters.subjectId));
        }
        if (filters.dueDateStart) {
            q = query(q, where('dueDate', '>=', filters.dueDateStart));
        }
        if (filters.dueDateEnd) {
            q = query(q, where('dueDate', '<=', filters.dueDateEnd));
        }
        if (filters.duePeriod !== undefined) {
            q = query(q, where('duePeriod', '==', filters.duePeriod));
        }
        if (filters.includePastDue === false || filters.includePastDue === undefined) {
          q = query(q, where('dueDate', '>=', todayString));
        }
    } else {
        q = query(q, where('dueDate', '>=', todayString));
    }


    const sortBy = sort?.field || 'dueDate';
    const sortDirection = sort?.direction || 'asc';
    q = query(q, orderBy(sortBy, sortDirection));
    if (sortBy !== 'dueDate') {
        q = query(q, orderBy('dueDate', 'asc'));
    }


    return onSnapshot(q, (snapshot) => {
        let assignments = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                title: data.title,
                description: data.description,
                subjectId: data.subjectId,
                customSubjectName: data.customSubjectName,
                dueDate: data.dueDate,
                duePeriod: data.duePeriod,
                submissionMethod: data.submissionMethod,
                targetAudience: data.targetAudience,
                createdAt: parseAssignmentTimestamp(data.createdAt),
                updatedAt: parseAssignmentTimestamp(data.updatedAt),
                itemType: 'assignment',
            } as Assignment;
        });
        
        if (filters?.searchTerm) {
            const term = filters.searchTerm.toLowerCase();
            assignments = assignments.filter(
                (a) =>
                a.title.toLowerCase().includes(term) ||
                a.description.toLowerCase().includes(term) ||
                (a.customSubjectName && a.customSubjectName.toLowerCase().includes(term)) ||
                (a.submissionMethod && a.submissionMethod.toLowerCase().includes(term)) ||
                (a.targetAudience && a.targetAudience.toLowerCase().includes(term))
            );
        }
        callback(assignments);
    }, (error) => {
        console.error("Snapshot error on assignments:", error);
        if (onError) {
            onError(error);
        }
    });
};
