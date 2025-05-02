
'use server';

/**
 * @fileOverview Service for logging user and system actions to Firestore.
 */

import { db } from '@/config/firebase';
import { collection, doc, setDoc, Timestamp, FirestoreError, getDoc } from 'firebase/firestore';

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
    [key: string]: any; // Allow other details
  };
}

/**
 * Logs an action performed by a user (or system).
 * Stores 'before' and 'after' states if provided.
 * Replaces undefined values in details with null for Firestore compatibility.
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
  // Ensure details are serializable (replace undefined with null)
  const cleanDetails = JSON.parse(JSON.stringify(details, (key, value) =>
    value === undefined ? null : value
  ));

  const logEntry: Omit<LogEntry, 'id'> = {
      action: actionType,
      timestamp: Timestamp.now(),
      userId: userId,
      details: cleanDetails,
  };

  try {
    const newLogRef = doc(logsCollectionRef); // Auto-generate ID
    await setDoc(newLogRef, logEntry);
    console.log(`Action logged: ${actionType}`, logEntry); // Log to console for debugging
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
 * Currently supports simple create/update/delete reversals based on 'before'/'after' data.
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
        logEntry = { id: logSnap.id, ...logSnap.data() } as LogEntry;

        // Prevent rolling back a rollback action itself
        if (logEntry.action === 'rollback_action') {
            throw new Error(`Cannot roll back a rollback action (Log ID: ${logId}).`);
        }

        const { action, details } = logEntry;
        const { before, after, meta } = details;

        let rollbackDetails: any = { originalLogId: logId, originalAction: action };
        const batch = writeBatch(db); // Use batch for potential multi-doc changes

        console.log(`Attempting rollback for action: ${action}`, logEntry);

        // --- Determine Rollback Operation ---
        if (action.startsWith('add_')) {
            // Rollback 'add' means 'delete'
            const docId = after?.id ?? after?.subjectId ?? after?.eventId; // Infer document ID from 'after' state
            if (!docId) throw new Error(`Cannot determine document ID to delete for rollback of add action (Log ID: ${logId}).`);
            const collectionPath = getCollectionPathForAction(action); // Helper to get collection path
            if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
            const docToDeleteRef = doc(db, collectionPath, docId);
            batch.delete(docToDeleteRef);
            rollbackDetails.deletedDocId = docId;
            rollbackDetails.deletedDocPath = docToDeleteRef.path;

        } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
            // Rollback 'update/upsert' means 'set' back to 'before' state
             const docId = before?.id ?? after?.id ?? before?.subjectId ?? after?.subjectId ?? before?.eventId ?? after?.eventId ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? before?.date ?? after?.date : null));
             if (!docId) throw new Error(`Cannot determine document ID to update for rollback of action ${action} (Log ID: ${logId}).`);
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
                 // Handle Timestamp conversion if needed (assuming 'before' might have Date objects from initial log)
                 Object.keys(dataToRestore).forEach(key => {
                     if (dataToRestore[key] instanceof Date) {
                         dataToRestore[key] = Timestamp.fromDate(dataToRestore[key]);
                     }
                 });

                 batch.set(docToUpdateRef, dataToRestore); // Set back to 'before' state
                 rollbackDetails.restoredDocId = docId;
                 rollbackDetails.restoredDocPath = docToUpdateRef.path;
                 rollbackDetails.restoredData = dataToRestore; // Log what was restored
            }

        } else if (action.startsWith('delete_')) {
            // Rollback 'delete' means 'set' back to 'before' state
             const docId = before?.id ?? before?.subjectId ?? before?.eventId ?? (action.includes('general_announcement') ? before?.date : null); // Infer ID from 'before' state
             if (!docId) throw new Error(`Cannot determine document ID/data to restore for rollback of delete action (Log ID: ${logId}).`);
             const collectionPath = getCollectionPathForAction(action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);

             const docToRestoreRef = doc(db, collectionPath, docId);
             const dataToRestore = { ...before };
             delete dataToRestore.id;
             // Handle Timestamp conversion
             Object.keys(dataToRestore).forEach(key => {
                 if (dataToRestore[key] instanceof Date) {
                     dataToRestore[key] = Timestamp.fromDate(dataToRestore[key]);
                 }
             });

            batch.set(docToRestoreRef, dataToRestore); // Restore the document
            rollbackDetails.restoredDocId = docId;
            rollbackDetails.restoredDocPath = docToRestoreRef.path;
            rollbackDetails.restoredData = dataToRestore;

        } else if (action === 'batch_update_fixed_timetable') {
            // Rollback batch update: More complex. Need to revert individual slots.
            // This requires the log details to contain an array of before/after states for each slot.
            // Assuming details.before and details.after are arrays of { id: string, subjectId: string | null }
            const beforeSlots: Array<{ id: string, subjectId: string | null }> = details.before || [];
            const afterSlots: Array<{ id: string, subjectId: string | null }> = details.after || [];

            if (!Array.isArray(beforeSlots) || !Array.isArray(afterSlots)) {
                 throw new Error(`Rollback for ${action} requires 'before' and 'after' details to be arrays of slot changes.`);
            }

            const changedSlotsMap = new Map(afterSlots.map(s => [s.id, s.subjectId]));
            let restoredCount = 0;

            for(const beforeSlot of beforeSlots) {
                const currentSubjectId = changedSlotsMap.get(beforeSlot.id);
                // Only revert if the current state matches the 'after' state from the log
                if (currentSubjectId !== undefined && (beforeSlot.subjectId ?? null) !== (currentSubjectId ?? null)) {
                    const slotRef = doc(db, `classes/${CURRENT_CLASS_ID}/fixedTimetable`, beforeSlot.id);
                    batch.update(slotRef, { subjectId: beforeSlot.subjectId ?? null });
                    restoredCount++;
                }
            }
             rollbackDetails.restoredSlotsCount = restoredCount;
             if (restoredCount === 0) console.warn(`Rollback for ${logId}: No slots needed reverting.`);

        } else if (action === 'reset_fixed_timetable') {
             // Rollback reset: Extremely complex as it requires storing the entire state before reset.
             // Mark as not directly reversible via this simple mechanism.
             throw new Error(`Action '${action}' cannot be automatically rolled back. Manual intervention required.`);

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


// Helper function to determine the Firestore collection path based on action type
// Needs to be kept in sync with controller actions
function getCollectionPathForAction(action: string): string | null {
    if (action.includes('subject')) {
        return `classes/${CURRENT_CLASS_ID}/subjects`;
    }
    if (action.includes('event')) {
        return `classes/${CURRENT_CLASS_ID}/events`;
    }
    if (action.includes('fixed_timetable') || action.includes('fixed_slot')) {
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
    return null;
}
