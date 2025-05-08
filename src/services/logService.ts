
'use server';

/**
 * @fileOverview Service for logging user and system actions to Firestore.
 */

import { db } from '@/config/firebase';
import { collection, doc, setDoc, Timestamp, FirestoreError, getDoc, writeBatch } from 'firebase/firestore';
import type { Subject } from '@/models/subject'; // Import Subject type

// --- Firestore Collection Reference ---
const CURRENT_CLASS_ID = 'defaultClass'; // Replace with dynamic class ID logic
const logsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'logs');

export interface LogEntry {
  id?: string;
  action: string;
  timestamp: Timestamp;
  userId: string;
  details: {
    before?: any; // State before the action
    after?: any; // State after the action
    meta?: any; // Additional context (e.g., rolled back log ID)
    originalLogId?: string; // Added for rollback tracking
    originalAction?: string; // Added for rollback tracking
    [key: string]: any; // Allow other details
  };
}

// Helper function to convert Timestamp/Date to ISO string for logging
const formatTimestampForLog = (timestamp: Date | Timestamp | undefined): string | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return null; // Or handle other cases if necessary
};

// Helper to prepare state for logging (converts timestamps)
// Also ensures undefined values are replaced with null
const prepareStateForLog = (state: any): any => {
  if (state === undefined || state === null) return null;
  // Deep clone and replace undefined with null
  return JSON.parse(JSON.stringify(state, (key, value) =>
    value === undefined ? null : value
  ), (key, value) => {
      if (typeof value === 'string') {
          const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
          if (isoDateRegex.test(value)) {
              return value;
          }
      }
       if (value instanceof Timestamp) {
          return value.toDate().toISOString();
       }
       if (value instanceof Date) {
           return value.toISOString();
       }
      return value;
  });
};


/**
 * Logs an action performed by a user (or system).
 * Stores 'before' and 'after' states if provided.
 * Replaces undefined values in details with null for Firestore compatibility.
 * Converts Date/Timestamp objects to ISO strings within details for consistent logging.
 *
 * @param actionType - The type of action being logged (e.g., 'update_subject').
 * @param details - An object containing action details, potentially including 'before' and 'after' states.
 * @param userId - The ID of the user performing the action (defaults to 'anonymous').
 * @returns The ID of the newly created log entry, or null if logging failed.
 */
export const logAction = async (
  actionType: string,
  details: object,
  userId: string = 'anonymous'
): Promise<string | null> => {
  const cleanDetails = prepareStateForLog(details);

  const logEntry: Omit<LogEntry, 'id'> = {
      action: actionType,
      timestamp: Timestamp.now(),
      userId: userId,
      details: cleanDetails ?? {},
  };

  try {
    const newLogRef = doc(logsCollectionRef);
    await setDoc(newLogRef, logEntry);
    console.log(`Action logged: ${actionType} by ${userId}`);
    return newLogRef.id;
  } catch (error) {
    console.error(`Failed to log action '${actionType}' (might be offline):`, error);
    if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
       console.error("Firestore Logging Error: Attempted to save 'undefined' in log details.", logEntry);
   }
   return null;
  }
};


/**
 * Attempts to roll back a previously logged action.
 */
export const rollbackAction = async (logId: string, userId: string = 'system_rollback'): Promise<void> => {
    const logRef = doc(logsCollectionRef, logId);
    let logEntry: LogEntry | null = null;

    try {
        const logSnap = await getDoc(logRef);
        if (!logSnap.exists()) {
            throw new Error(`Log entry with ID ${logId} not found.`);
        }
        const rawData = logSnap.data();
        logEntry = {
            id: logSnap.id,
            action: rawData.action,
            timestamp: rawData.timestamp,
            userId: rawData.userId,
            details: rawData.details || {},
        } as LogEntry;

        const { action, details } = logEntry;
        const { before, after, originalLogId } = details;

        if (action === 'rollback_action') {
            if (!originalLogId) {
                 throw new Error(`Cannot roll back a rollback action (Log ID: ${logId}) without the originalLogId.`);
            }
             console.warn(`Attempting to re-apply original action from Log ID: ${originalLogId} due to rollback of Log ID: ${logId}`);
             const originalLogRef = doc(logsCollectionRef, originalLogId);
             const originalLogSnap = await getDoc(originalLogRef);
             if (!originalLogSnap.exists()) {
                 throw new Error(`Original log entry (ID: ${originalLogId}) for rollback action (Log ID: ${logId}) not found.`);
             }
             const originalLogData = originalLogSnap.data() as LogEntry;
             const originalActionToReapply = originalLogData.action;
             const originalDetailsToReapply = originalLogData.details || {};
             await performActionBasedOnLog(originalActionToReapply, originalDetailsToReapply.after, originalDetailsToReapply.before, userId, `reapply_after_rollback_${logId}`);
             await logAction('rollback_rollback_action', {
                 originalRollbackLogId: logId,
                 reappliedOriginalLogId: originalLogId,
                 reappliedAction: originalActionToReapply,
             }, userId);
            return;
        }

        if (action === 'rollback_action_failed' || action === 'rollback_rollback_action') {
            throw new Error(`Action type '${action}' (Log ID: ${logId}) cannot be rolled back.`);
        }

        let rollbackDetails: any = { originalLogId: logId, originalAction: action };
        const batch = writeBatch(db);

        console.log(`Attempting rollback for action: ${action}`, logEntry);

         const prepareDataForFirestore = (data: any): any => {
            if (!data) return null;
            const firestoreData = { ...data };
             Object.keys(firestoreData).forEach(key => {
                 if (typeof firestoreData[key] === 'string') {
                     const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
                     if (isoDateRegex.test(firestoreData[key])) {
                         try {
                            firestoreData[key] = Timestamp.fromDate(new Date(firestoreData[key]));
                         } catch (e) {
                             console.warn(`Could not convert string ${firestoreData[key]} to Timestamp for key ${key}. Keeping as string.`);
                         }
                     }
                 }
                  if (firestoreData[key] === undefined) {
                      firestoreData[key] = null;
                  }
             });
             firestoreData.updatedAt = Timestamp.now();
             return firestoreData;
         };

        if (action.startsWith('add_')) {
            const docId = after?.id ?? after?.subjectId ?? after?.eventId ?? (action.includes('general_announcement') ? after?.date : null);
            if (!docId) throw new Error(`Cannot determine document ID to delete for rollback of add action (Log ID: ${logId}). After state: ${JSON.stringify(after)}`);
            const collectionPath = getCollectionPathForAction(action);
            if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
            const docToDeleteRef = doc(db, collectionPath, docId);
            batch.delete(docToDeleteRef);
            rollbackDetails.deletedDocId = docId;
            rollbackDetails.deletedDocPath = docToDeleteRef.path;

        } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
             const docId = before?.id ?? after?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? before?.date ?? after?.date : null));
             if (!docId) throw new Error(`Cannot determine document ID to update for rollback of action ${action} (Log ID: ${logId}). Before: ${JSON.stringify(before)}, After: ${JSON.stringify(after)}`);
             const collectionPath = getCollectionPathForAction(action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
             const docToUpdateRef = doc(db, collectionPath, docId);

            if (before === null || Object.keys(before).length === 0) {
                batch.delete(docToUpdateRef);
                rollbackDetails.deletedDocId = docId;
                rollbackDetails.deletedDocPath = docToUpdateRef.path;
            } else {
                 const dataToRestore = { ...before };
                 delete dataToRestore.id;
                 const firestoreReadyData = prepareDataForFirestore(dataToRestore);
                 batch.set(docToUpdateRef, firestoreReadyData);
                 rollbackDetails.restoredDocId = docId;
                 rollbackDetails.restoredDocPath = docToUpdateRef.path;
            }

        } else if (action.startsWith('delete_')) {
             const docId = before?.id ?? (action.includes('general_announcement') ? before?.date : null);
             if (!docId || before === null) throw new Error(`Cannot determine document ID/data to restore for rollback of delete action (Log ID: ${logId}). Before state: ${JSON.stringify(before)}`);
             const collectionPath = getCollectionPathForAction(action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
             const docToRestoreRef = doc(db, collectionPath, docId);
             
             let dataToRestore: Partial<Subject> | any = {};
             if (action === 'delete_subject') {
                // Specifically for subject, only restore name and teacherName to avoid issues
                if (!before.name || !before.teacherName) {
                    throw new Error(`Cannot restore subject (Log ID: ${logId}) without name and teacherName in 'before' state.`);
                }
                dataToRestore = { name: before.name, teacherName: before.teacherName };
             } else {
                dataToRestore = { ...before };
                delete dataToRestore.id; // Remove ID from data if it was part of it
             }

             const firestoreReadyData = prepareDataForFirestore(dataToRestore);
            batch.set(docToRestoreRef, firestoreReadyData);
            rollbackDetails.restoredDocId = docId;
            rollbackDetails.restoredDocPath = docToRestoreRef.path;

        } else if (action === 'batch_update_fixed_timetable') {
            const beforeSlots: Array<{ id: string, subjectId: string | null }> = details.before || [];
            if (!Array.isArray(beforeSlots)) {
                 throw new Error(`Rollback for ${action} requires 'before' details to be an array of slot changes.`);
            }
            let restoredCount = 0;
            for(const beforeSlot of beforeSlots) {
                if (!beforeSlot || typeof beforeSlot.id !== 'string') continue;
                const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, beforeSlot.id);
                batch.update(slotRef, { subjectId: beforeSlot.subjectId ?? null, updatedAt: Timestamp.now() });
                restoredCount++;
            }
             rollbackDetails.restoredSlotsCount = restoredCount;

        } else if (action === 'reset_fixed_timetable') {
             const beforeSlots: Array<{ id: string, subjectId: string | null }> = details.before || [];
             if (!Array.isArray(beforeSlots)) {
                 throw new Error(`Rollback for ${action} requires 'before' details to be an array of slot states.`);
             }
             let restoredCount = 0;
             for(const beforeSlot of beforeSlots) {
                if (!beforeSlot || typeof beforeSlot.id !== 'string') continue;
                const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, beforeSlot.id);
                batch.update(slotRef, { subjectId: beforeSlot.subjectId ?? null, updatedAt: Timestamp.now() });
                restoredCount++;
             }
             rollbackDetails.restoredSlotsCount = restoredCount;

        } else if (action === 'apply_fixed_timetable_future' || action === 'reset_future_daily_announcements') {
             throw new Error(`Action '${action}' affects future dates and cannot be automatically rolled back.`);
        }
         else {
            throw new Error(`Unsupported action type for automatic rollback: ${action}`);
        }

        await batch.commit();
        console.log(`Rollback successful for Log ID: ${logId}, Action: ${action}`);
        await logAction('rollback_action', rollbackDetails, userId);

    } catch (error) {
        console.error(`Rollback failed for Log ID: ${logId}:`, error);
        await logAction('rollback_action_failed', {
             originalLogId: logId,
             originalAction: logEntry?.action,
             error: String(error),
        }, userId);
        throw error;
    }
};

/**
 * Helper function to perform an action based on log data, used for re-applying actions
 * during a rollback of a rollback.
 */
async function performActionBasedOnLog(action: string, targetState: any, previousState: any, userId: string, context: string): Promise<void> {
    const collectionPath = getCollectionPathForAction(action);
    if (!collectionPath) throw new Error(`Unsupported action type for re-apply: ${action}`);

    const batch = writeBatch(db);

    const prepareDataForFirestore = (data: any): any => {
        if (!data) return null;
        const firestoreData = { ...data };
        Object.keys(firestoreData).forEach(key => {
            if (typeof firestoreData[key] === 'string') {
                const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
                if (isoDateRegex.test(firestoreData[key])) {
                    try {
                        firestoreData[key] = Timestamp.fromDate(new Date(firestoreData[key]));
                    } catch (e) {
                         console.warn(`Could not convert string ${firestoreData[key]} to Timestamp for key ${key}. Keeping as string.`);
                    }
                }
            }
            if (firestoreData[key] === undefined) firestoreData[key] = null;
        });
        firestoreData.updatedAt = Timestamp.now();
        return firestoreData;
    };

    if (action.startsWith('add_')) {
        const docId = targetState?.id ?? targetState?.date;
        if (!docId || !targetState) throw new Error(`Cannot determine document ID/data to re-add for action ${action} (${context})`);
        const docRef = doc(db, collectionPath, docId);
        const dataToRestore = { ...targetState };
        delete dataToRestore.id;
        batch.set(docRef, prepareDataForFirestore(dataToRestore));

    } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
         const docId = targetState?.id ?? previousState?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? targetState?.date ?? previousState?.date : null));
         if (!docId) throw new Error(`Cannot determine document ID to re-update for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);
        if (targetState === null || Object.keys(targetState).length === 0) {
            batch.delete(docRef);
        } else {
             const dataToRestore = { ...targetState };
             delete dataToRestore.id;
             batch.set(docRef, prepareDataForFirestore(dataToRestore));
        }

    } else if (action.startsWith('delete_')) {
         const docId = previousState?.id ?? (action.includes('general_announcement') ? previousState?.date : null);
         if (!docId) throw new Error(`Cannot determine document ID to re-delete for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);
         batch.delete(docRef);

    } else if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable') {
         const targetSlots: Array<{ id: string, subjectId: string | null }> = (action === 'reset_fixed_timetable') ? (previousState || []).map((s: any) => ({ ...s, subjectId: null })) : (targetState || []);
         if (!Array.isArray(targetSlots)) throw new Error(`Re-apply for ${action} requires target state to be an array.`);
         targetSlots.forEach(slot => {
             if (!slot || typeof slot.id !== 'string') return;
             const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, slot.id);
             batch.update(slotRef, { subjectId: slot.subjectId ?? null, updatedAt: Timestamp.now() });
         });

    } else {
        throw new Error(`Unsupported action type for re-apply: ${action} (${context})`);
    }

    await batch.commit();
}


function getCollectionPathForAction(action: string): string | null {
    if (action.includes('subject')) {
        return `classes/${CURRENT_CLASS_ID}/subjects`;
    }
    if (action.includes('event')) {
        return `classes/${CURRENT_CLASS_ID}/events`;
    }
    if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable' || action === 'update_fixed_slot') {
        return `classes/${CURRENT_CLASS_ID}/fixedTimetable`;
    }
    if (action.includes('announcement') && !action.includes('general')) {
        return `classes/${CURRENT_CLASS_ID}/dailyAnnouncements`;
    }
     if (action.includes('general_announcement')) {
        return `classes/${CURRENT_CLASS_ID}/generalAnnouncements`;
    }
    if (action.includes('settings')) {
         return `classes/${CURRENT_CLASS_ID}/settings`;
    }
    console.warn(`Could not determine collection path for action: ${action}`);
    return null;
}
