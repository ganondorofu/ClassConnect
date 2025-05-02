
'use server';

/**
 * @fileOverview Service for logging user and system actions to Firestore.
 */

import { db } from '@/config/firebase';
import { collection, doc, setDoc, Timestamp, FirestoreError, getDoc, writeBatch } from 'firebase/firestore'; // Import writeBatch

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
      // Attempt to parse ISO strings back to Date objects if applicable,
      // but primarily ensure timestamps are handled correctly before stringify.
      // For logging, ISO string representation is generally safer.
      if (typeof value === 'string') {
          // Basic check for ISO date format - adjust regex if needed
          const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
          if (isoDateRegex.test(value)) {
              // Keep as ISO string for logging to avoid Firestore issues with mixed types
              return value;
          }
      }
       // Convert Date/Timestamp to ISO string before stringify catches them
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
  // Ensure details are serializable (replace undefined with null, convert dates/timestamps)
  const cleanDetails = prepareStateForLog(details);

  const logEntry: Omit<LogEntry, 'id'> = {
      action: actionType,
      timestamp: Timestamp.now(), // Store as Firestore Timestamp
      userId: userId,
      details: cleanDetails ?? {}, // Ensure details is an object
  };

  try {
    const newLogRef = doc(logsCollectionRef); // Auto-generate ID
    await setDoc(newLogRef, logEntry);
    console.log(`Action logged: ${actionType} by ${userId}`); // Log to console for debugging
    return newLogRef.id;
  } catch (error) {
    console.error(`Failed to log action '${actionType}' (might be offline):`, error);
    if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
       console.error("Firestore Logging Error: Attempted to save 'undefined' in log details.", logEntry);
   }
   // Don't throw error for logging failures, but return null
   return null;
  }
};


/**
 * Attempts to roll back a previously logged action.
 * This is a complex operation and might not be suitable for all action types.
 * Supports simple create/update/delete reversals based on 'before'/'after' data.
 * Also supports rolling back a 'rollback_action' by attempting to roll back the original action.
 *
 * IMPORTANT: Rollback for batch operations or complex state changes (like applying timetable) is NOT fully implemented due to complexity.
 *
 * @param logId - The ID of the log entry to roll back.
 * @param userId - The ID of the user performing the rollback.
 * @returns {Promise<void>}
 * @throws {Error} If the log entry is not found, not reversible, or rollback fails.
 */
export const rollbackAction = async (logId: string, userId: string = 'system_rollback'): Promise<void> => {
    const logRef = doc(logsCollectionRef, logId);
    let logEntry: LogEntry | null = null;

    try {
        const logSnap = await getDoc(logRef);
        if (!logSnap.exists()) {
            throw new Error(`Log entry with ID ${logId} not found.`);
        }
        // Convert Timestamps in log entry details back to Date if needed for logic,
        // but Firestore operations need Timestamps or direct values.
        const rawData = logSnap.data();
        logEntry = {
            id: logSnap.id,
            action: rawData.action,
            timestamp: rawData.timestamp, // Keep as Timestamp
            userId: rawData.userId,
            // Keep details as they are, handle potential date strings during restoration
            details: rawData.details || {},
        } as LogEntry;

        const { action, details } = logEntry;
        const { before, after, meta, originalLogId } = details;

        // --- Handle Rollback of a Rollback ---
        if (action === 'rollback_action') {
            if (!originalLogId) {
                 throw new Error(`Cannot roll back a rollback action (Log ID: ${logId}) without the originalLogId.`);
            }
             console.warn(`Attempting to re-apply original action from Log ID: ${originalLogId} due to rollback of Log ID: ${logId}`);
             // Re-fetch the *original* log entry to determine the action to re-apply
             const originalLogRef = doc(logsCollectionRef, originalLogId);
             const originalLogSnap = await getDoc(originalLogRef);
             if (!originalLogSnap.exists()) {
                 throw new Error(`Original log entry (ID: ${originalLogId}) for rollback action (Log ID: ${logId}) not found.`);
             }
             const originalLogData = originalLogSnap.data() as LogEntry;
             const originalAction = originalLogData.action;
             const originalDetails = originalLogData.details || {};

            // Essentially, we re-do the original action based on its 'after' state (if it was add/update)
             // or delete it (if it was delete). This is like re-applying the change that was rolled back.
             await performActionBasedOnLog(originalAction, originalDetails.after, originalDetails.before, userId, `reapply_after_rollback_${logId}`); // Pass 'after' as target, 'before' for delete context
             await logAction('rollback_rollback_action', {
                 originalRollbackLogId: logId,
                 reappliedOriginalLogId: originalLogId,
                 reappliedAction: originalAction,
             }, userId);
            return; // Finish after re-applying
        }
        // --- End Handle Rollback of a Rollback ---


        // Prevent rolling back a rollback failure log
        if (action === 'rollback_action_failed') {
            throw new Error(`Cannot roll back a failed rollback action (Log ID: ${logId}).`);
        }

        let rollbackDetails: any = { originalLogId: logId, originalAction: action };
        const batch = writeBatch(db); // Use batch for potential multi-doc changes

        console.log(`Attempting rollback for action: ${action}`, logEntry);

        // Helper to convert data for Firestore (e.g., ISO date strings to Timestamps if needed)
         const prepareDataForFirestore = (data: any): any => {
            if (!data) return null;
            const firestoreData = { ...data };
             Object.keys(firestoreData).forEach(key => {
                 // Convert ISO strings back to Timestamps if they represent dates
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
                  // Ensure no undefined values slip through
                  if (firestoreData[key] === undefined) {
                      firestoreData[key] = null;
                  }
             });
             // Ensure updatedAt is always a Server Timestamp for consistency on restore/update
             firestoreData.updatedAt = Timestamp.now();
             return firestoreData;
         };

        // --- Determine Rollback Operation ---
        if (action.startsWith('add_')) {
            // Rollback 'add' means 'delete'
            const docId = after?.id ?? after?.subjectId ?? after?.eventId ?? (action.includes('general_announcement') ? after?.date : null); // Infer document ID from 'after' state
            if (!docId) throw new Error(`Cannot determine document ID to delete for rollback of add action (Log ID: ${logId}). After state: ${JSON.stringify(after)}`);
            const collectionPath = getCollectionPathForAction(action); // Helper to get collection path
            if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
            const docToDeleteRef = doc(db, collectionPath, docId);
            batch.delete(docToDeleteRef);
            rollbackDetails.deletedDocId = docId;
            rollbackDetails.deletedDocPath = docToDeleteRef.path;

        } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
            // Rollback 'update/upsert' means 'set' back to 'before' state
             const docId = before?.id ?? after?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? before?.date ?? after?.date : null));
             if (!docId) throw new Error(`Cannot determine document ID to update for rollback of action ${action} (Log ID: ${logId}). Before: ${JSON.stringify(before)}, After: ${JSON.stringify(after)}`);
             const collectionPath = getCollectionPathForAction(action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);

             const docToUpdateRef = doc(db, collectionPath, docId);

            if (before === null || Object.keys(before).length === 0) {
                // If 'before' was null/empty, rollback means delete
                batch.delete(docToUpdateRef);
                rollbackDetails.deletedDocId = docId;
                rollbackDetails.deletedDocPath = docToUpdateRef.path;
            } else {
                 // Ensure 'before' state is clean (no ID if it's part of the data itself)
                 const dataToRestore = { ...before };
                 delete dataToRestore.id; // Remove ID if it exists in the 'before' object

                 const firestoreReadyData = prepareDataForFirestore(dataToRestore);

                 batch.set(docToUpdateRef, firestoreReadyData); // Set back to 'before' state
                 rollbackDetails.restoredDocId = docId;
                 rollbackDetails.restoredDocPath = docToUpdateRef.path;
                 // rollbackDetails.restoredData = firestoreReadyData; // Maybe too large for logs
            }

        } else if (action.startsWith('delete_')) {
            // Rollback 'delete' means 'set' back to 'before' state
             const docId = before?.id ?? (action.includes('general_announcement') ? before?.date : null); // Infer ID from 'before' state
             if (!docId || before === null) throw new Error(`Cannot determine document ID/data to restore for rollback of delete action (Log ID: ${logId}). Before state: ${JSON.stringify(before)}`);
             const collectionPath = getCollectionPathForAction(action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);

             const docToRestoreRef = doc(db, collectionPath, docId);
             const dataToRestore = { ...before };
             delete dataToRestore.id;

             const firestoreReadyData = prepareDataForFirestore(dataToRestore);

            batch.set(docToRestoreRef, firestoreReadyData); // Restore the document
            rollbackDetails.restoredDocId = docId;
            rollbackDetails.restoredDocPath = docToRestoreRef.path;
            // rollbackDetails.restoredData = firestoreReadyData; // Maybe too large

        } else if (action === 'batch_update_fixed_timetable') {
            // Rollback batch update: Revert individual slots.
            const beforeSlots: Array<{ id: string, subjectId: string | null }> = details.before || [];
            const afterSlots: Array<{ id: string, subjectId: string | null }> = details.after || [];

            if (!Array.isArray(beforeSlots) || !Array.isArray(afterSlots)) {
                 throw new Error(`Rollback for ${action} requires 'before' and 'after' details to be arrays of slot changes.`);
            }

             // Fetch current state of affected slots to ensure idempotency (optional but safer)
             // For simplicity, we'll directly revert based on the log. Be careful if other changes happened since.
            let restoredCount = 0;
            for(const beforeSlot of beforeSlots) {
                if (!beforeSlot || typeof beforeSlot.id !== 'string') continue; // Skip invalid entries
                const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, beforeSlot.id);
                batch.update(slotRef, { subjectId: beforeSlot.subjectId ?? null, updatedAt: Timestamp.now() }); // Revert to the 'before' subjectId
                restoredCount++;
            }
             rollbackDetails.restoredSlotsCount = restoredCount;
             if (restoredCount === 0) console.warn(`Rollback for ${logId}: No slots needed reverting.`);

        } else if (action === 'reset_fixed_timetable') {
             // Rollback reset: Restore based on 'before' array
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
             // Rollback future application: Very complex, affects many documents non-atomically.
             // Mark as not directly reversible.
             throw new Error(`Action '${action}' affects future dates and cannot be automatically rolled back.`);
        }
         else {
            throw new Error(`Unsupported action type for automatic rollback: ${action}`);
        }

        // Commit the rollback batch
        await batch.commit();
        console.log(`Rollback successful for Log ID: ${logId}, Action: ${action}`);

        // Log the rollback action itself
        await logAction('rollback_action', rollbackDetails, userId);

    } catch (error) {
        console.error(`Rollback failed for Log ID: ${logId}:`, error);
        // Log the rollback failure
        await logAction('rollback_action_failed', {
             originalLogId: logId,
             originalAction: logEntry?.action,
             error: String(error),
        }, userId);
        throw error; // Re-throw the error to be handled by the caller
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

     // Helper to convert data for Firestore
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
        firestoreData.updatedAt = Timestamp.now(); // Always update timestamp
        return firestoreData;
    };

    if (action.startsWith('add_')) {
        // Re-apply 'add' means 'set' using the 'after' state from the original log
        const docId = targetState?.id ?? targetState?.date;
        if (!docId || !targetState) throw new Error(`Cannot determine document ID/data to re-add for action ${action} (${context})`);
        const docRef = doc(db, collectionPath, docId);
        const dataToRestore = { ...targetState };
        delete dataToRestore.id;
        batch.set(docRef, prepareDataForFirestore(dataToRestore));
        console.log(`Re-applying add: Setting doc ${docRef.path}`);

    } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
         // Re-apply 'update/upsert' means 'set' using the 'after' state from the original log
         const docId = targetState?.id ?? previousState?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? targetState?.date ?? previousState?.date : null));
         if (!docId) throw new Error(`Cannot determine document ID to re-update for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);

        if (targetState === null || Object.keys(targetState).length === 0) {
            // If the original 'after' was null/empty, re-apply means delete
            batch.delete(docRef);
            console.log(`Re-applying update (to empty): Deleting doc ${docRef.path}`);
        } else {
             const dataToRestore = { ...targetState };
             delete dataToRestore.id;
             batch.set(docRef, prepareDataForFirestore(dataToRestore)); // Set back to 'after' state
             console.log(`Re-applying update: Setting doc ${docRef.path}`);
        }

    } else if (action.startsWith('delete_')) {
         // Re-apply 'delete' means 'delete' again, using the 'before' state to get the ID
         const docId = previousState?.id ?? (action.includes('general_announcement') ? previousState?.date : null);
         if (!docId) throw new Error(`Cannot determine document ID to re-delete for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);
         batch.delete(docRef);
         console.log(`Re-applying delete: Deleting doc ${docRef.path}`);

    } else if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable') {
         // Re-apply batch/reset means 'update' using the 'after' state (or null for reset)
         const targetSlots: Array<{ id: string, subjectId: string | null }> = (action === 'reset_fixed_timetable') ? (previousState || []).map((s: any) => ({ ...s, subjectId: null })) : (targetState || []);
         if (!Array.isArray(targetSlots)) throw new Error(`Re-apply for ${action} requires target state to be an array.`);
         targetSlots.forEach(slot => {
             if (!slot || typeof slot.id !== 'string') return;
             const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, slot.id);
             batch.update(slotRef, { subjectId: slot.subjectId ?? null, updatedAt: Timestamp.now() });
         });
         console.log(`Re-applying ${action}: Updating ${targetSlots.length} slots.`);

    } else {
        throw new Error(`Unsupported action type for re-apply: ${action} (${context})`);
    }

    await batch.commit();
}


// Helper function to determine the Firestore collection path based on action type
// Needs to be kept in sync with controller actions
function getCollectionPathForAction(action: string): string | null {
    if (action.includes('subject')) {
        return `classes/${CURRENT_CLASS_ID}/subjects`;
    }
    if (action.includes('event')) {
        return `classes/${CURRENT_CLASS_ID}/events`;
    }
    // Specific matches first
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
    // Add more mappings as needed
    console.warn(`Could not determine collection path for action: ${action}`);
    return null;
}

