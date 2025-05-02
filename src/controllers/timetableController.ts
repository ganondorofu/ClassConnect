
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  writeBatch,
  deleteDoc,
  orderBy,
  limit, // Import limit
  FirestoreError, // Import FirestoreError type
  runTransaction, // Import runTransaction
} from 'firebase/firestore';
import type {
  FixedTimeSlot,
  TimetableSettings,
  DayOfWeek,
  SchoolEvent,
} from '@/models/timetable';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, AllDays, DayOfWeek as DayOfWeekEnum } from '@/models/timetable';
import { format, addDays, startOfDay, getDay } from 'date-fns';
import { logAction } from '@/services/logService'; // Import logAction

/**
 * Placeholder for the current class ID.
 * In a real app, this would come from user context or routing.
 */
const CURRENT_CLASS_ID = 'defaultClass'; // Replace with dynamic class ID logic
const FUTURE_WEEKS_TO_APPLY = 3; // Number of future weeks to auto-apply fixed timetable

// --- Firestore Collection References ---

const settingsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'settings');
const fixedTimetableCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'fixedTimetable');
const dailyAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'dailyAnnouncements');
const generalAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'generalAnnouncements'); // New collection for general announcements
const eventsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'events');
// Logs are handled by logService

// --- Timetable Settings ---

/**
 * Fetches the timetable settings for the current class.
 * If no settings exist, initializes with default values.
 * @returns {Promise<TimetableSettings>} The timetable settings.
 */
export const getTimetableSettings = async (): Promise<TimetableSettings> => {
  const docRef = doc(settingsCollectionRef, 'timetable');
  try {
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0
        ? data.activeDays
        : DEFAULT_TIMETABLE_SETTINGS.activeDays;

      return {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: activeDays,
      } as TimetableSettings;
    } else {
      console.log("No settings found, initializing with defaults.");
      await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
      await logAction('initialize_settings', { before: null, after: DEFAULT_TIMETABLE_SETTINGS });
      return DEFAULT_TIMETABLE_SETTINGS;
    }
  } catch (error) {
    console.error("Error fetching timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') {
       console.warn("Client is offline. Returning default settings.");
       return DEFAULT_TIMETABLE_SETTINGS;
    }
    throw error;
  }
};

/**
 * Updates the timetable settings for the current class.
 * Handles adding/removing fixed timetable slots if numberOfPeriods or activeDays change.
 * Triggers future application of fixed timetable.
 * @param {Partial<TimetableSettings>} settingsUpdates - The partial settings to update.
 * @returns {Promise<void>}
 */
export const updateTimetableSettings = async (settingsUpdates: Partial<TimetableSettings>): Promise<void> => {
  let currentSettings: TimetableSettings;
  try {
      currentSettings = await getTimetableSettings();
  } catch (fetchError) {
      console.error("Critical error fetching current settings before update:", fetchError);
      throw fetchError;
  }

  const newSettings: TimetableSettings = {
      numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
      activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
  };
  const docRef = doc(settingsCollectionRef, 'timetable');

  try {
    let fixedTimetableNeedsUpdate = false;
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      const currentSettingsInTx = settingsDoc.exists()
          ? (settingsDoc.data() as TimetableSettings)
          : DEFAULT_TIMETABLE_SETTINGS;

      const currentActiveDays = currentSettingsInTx.activeDays && Array.isArray(currentSettingsInTx.activeDays) && currentSettingsInTx.activeDays.length > 0
          ? currentSettingsInTx.activeDays
          : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettings.activeDays && Array.isArray(newSettings.activeDays) && newSettings.activeDays.length > 0
          ? newSettings.activeDays
          : DEFAULT_TIMETABLE_SETTINGS.activeDays;

      transaction.set(docRef, newSettings); // Update settings document

      const currentPeriods = currentSettingsInTx.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
      const newPeriodsValue = settingsUpdates.numberOfPeriods;

      if (newPeriodsValue !== undefined && newPeriodsValue !== currentPeriods) {
        fixedTimetableNeedsUpdate = true;
        const daysToUpdate = newActiveDays;

        if (newPeriodsValue > currentPeriods) {
          for (let day of daysToUpdate) {
            for (let period = currentPeriods + 1; period <= newPeriodsValue; period++) {
              const slotId = `${day}_${period}`;
              const newSlotRef = doc(fixedTimetableCollectionRef, slotId);
              const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subjectId: null };
              transaction.set(newSlotRef, defaultSlot);
            }
          }
        } else {
          // Fetching inside transaction is generally discouraged, but might be needed here.
          // Alternatively, update controller logic to handle this outside transaction if possible.
          const q = query(fixedTimetableCollectionRef, where('period', '>', newPeriodsValue), where('day', 'in', daysToUpdate));
          const snapshot = await getDocs(q); // This requires network
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      }
      else if (settingsUpdates.activeDays && JSON.stringify(newActiveDays.sort()) !== JSON.stringify(currentActiveDays.sort())) {
          fixedTimetableNeedsUpdate = true;
          const addedDays = newActiveDays.filter(d => !currentActiveDays.includes(d));
          const removedDays = currentActiveDays.filter(d => !newActiveDays.includes(d));
          const periodsToManage = newSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;

          for (const day of addedDays) {
              for (let period = 1; period <= periodsToManage; period++) {
                  const slotId = `${day}_${period}`;
                  const newSlotRef = doc(fixedTimetableCollectionRef, slotId);
                  const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subjectId: null };
                  transaction.set(newSlotRef, defaultSlot);
              }
          }

          if (removedDays.length > 0) {
              const q = query(fixedTimetableCollectionRef, where('day', 'in', removedDays));
              const snapshot = await getDocs(q); // Requires network
              snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
          }
      }
    });

    // Log outside transaction after success
    await logAction('update_settings', { before: currentSettings, after: newSettings });

    if (fixedTimetableNeedsUpdate) {
      console.log("Settings changed, applying fixed timetable to future...");
      await applyFixedTimetableForFuture(); // This logs internally
    }

  } catch (error) {
    console.error("Error updating timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') {
       throw new Error("オフラインのため設定を更新できませんでした。");
    }
    throw error;
  }
};


/**
 * Subscribes to real-time updates for timetable settings.
 * @param {(settings: TimetableSettings) => void} callback - Function to call with updated settings.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onTimetableSettingsUpdate = (
    callback: (settings: TimetableSettings) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
  const docRef = doc(settingsCollectionRef, 'timetable');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
       const data = docSnap.data();
       const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0
          ? data.activeDays
          : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const settings: TimetableSettings = {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: activeDays,
      };
      callback(settings);
    } else {
       console.log("Settings document deleted, attempting to re-initialize.");
       getTimetableSettings().then(callback).catch(err => onError ? onError(err) : console.error("Error re-fetching settings after deletion:", err));
    }
  }, (error) => {
    console.error("Snapshot error on timetable settings:", error);
    if (onError) {
      onError(error);
    }
  });
};


// --- Fixed Timetable ---

/**
 * Fetches the entire fixed timetable for the current class.
 * @returns {Promise<FixedTimeSlot[]>} Array of fixed time slots.
 */
export const getFixedTimetable = async (): Promise<FixedTimeSlot[]> => {
   try {
      // Query without explicit order initially
      const snapshot = await getDocs(fixedTimetableCollectionRef);
      let slots = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);

      slots = slots.map(slot => ({
          ...slot,
          subjectId: slot.subjectId === undefined ? null : slot.subjectId
      }));

       // Custom sort based on AllDays order
       slots.sort((a, b) => {
           const dayAIndex = AllDays.indexOf(a.day);
           const dayBIndex = AllDays.indexOf(b.day);
           if (dayAIndex !== dayBIndex) {
               return dayAIndex - dayBIndex;
           }
           return a.period - b.period;
       });
       return slots;
   } catch (error) {
      console.error("Error fetching fixed timetable:", error);
      if ((error as FirestoreError).code === 'unavailable') {
          console.warn("Client is offline. Returning empty fixed timetable.");
          return [];
      }
        // Index error handling might be less relevant without query order, but keep if needed
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query requires an index. Please check the Firebase console error for a link to create it: ", (error as FirestoreError).message);
            throw new Error("Firestore クエリに必要なインデックスがありません。Firebaseコンソールのエラーメッセージを確認し、リンクから作成してください。");
        }
      throw error;
   }
};


/**
 * Updates multiple fixed timetable slots in a batch.
 * Also triggers applying these changes to future daily announcements.
 * Logs the changes with before/after states for the batch.
 * @param {FixedTimeSlot[]} slots - Array of slots to update.
 * @returns {Promise<void>}
 */
export const batchUpdateFixedTimetable = async (slots: FixedTimeSlot[]): Promise<void> => {
  const batch = writeBatch(db);
  let changesMade = false;
  let existingSlotsMap: Map<string, FixedTimeSlot> = new Map();
  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  const afterStates: Array<{ id: string, subjectId: string | null }> = [];


  try {
      const currentTimetable = await getFixedTimetable();
      currentTimetable.forEach(slot => existingSlotsMap.set(slot.id, slot));
  } catch (error) {
      if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため現在の時間割を取得できず、保存できませんでした。");
      }
       if (error instanceof Error && error.message.includes("Firestore クエリに必要なインデックスがありません")) {
          throw error; // Rethrow the specific index error
      }
      console.error("Failed to fetch current fixed timetable for comparison:", error);
      throw new Error(`現在の固定時間割の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }


  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) {
      console.warn("Skipping slot update due to missing ID, day, or period:", slot);
      return;
    }
    const docRef = doc(fixedTimetableCollectionRef, slot.id);
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubjectId = slot.subjectId === undefined ? null : slot.subjectId;

    if (!existingSlot || (existingSlot.subjectId ?? null) !== newSubjectId) {
        const dataToSet: FixedTimeSlot = {
            id: slot.id,
            day: slot.day,
            period: slot.period,
            subjectId: newSubjectId,
        };
        batch.set(docRef, dataToSet);
        changesMade = true;
        beforeStates.push({ id: slot.id, subjectId: existingSlot?.subjectId ?? null });
        afterStates.push({ id: slot.id, subjectId: newSubjectId });
    }
  });

  if (!changesMade) {
      console.log("No changes detected in fixed timetable.");
      return;
  }

  try {
    await batch.commit();
    await logAction('batch_update_fixed_timetable', {
        before: beforeStates,
        after: afterStates,
        count: afterStates.length
    }); // Log the batch operation with details

    console.log("Fixed timetable updated, applying to future...");
    await applyFixedTimetableForFuture(); // Logs internally

  } catch (error) {
    console.error("Error batch updating fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため固定時間割を一括更新できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
          console.error("Firestore Error: Attempted to save 'undefined' during batch update. Check slot data:", afterStates);
          throw new Error("固定時間割データに無効な値(undefined)が含まれていました。");
     }
    throw error;
  }
};

/**
 * Resets all fixed timetable slots by setting their subjectId to null.
 * Triggers future application of fixed timetable after reset.
 * Logs the reset action.
 * @returns {Promise<void>}
 */
export const resetFixedTimetable = async (): Promise<void> => {
  console.log('Resetting fixed timetable...');
  const batch = writeBatch(db);
  let resetCount = 0;
  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];

  try {
    const snapshot = await getDocs(fixedTimetableCollectionRef);

    snapshot.forEach((docSnap) => {
      const slot = docSnap.data() as FixedTimeSlot;
      if ((slot.subjectId ?? null) !== null) {
        beforeStates.push({ id: docSnap.id, subjectId: slot.subjectId }); // Log the state before reset
        batch.update(docSnap.ref, { subjectId: null });
        resetCount++;
      }
    });

    if (resetCount === 0) {
      console.log("Fixed timetable is already empty. No reset needed.");
      return;
    }

    await batch.commit();
    await logAction('reset_fixed_timetable', {
        before: beforeStates, // Log what was reset
        after: null, // Indicate reset to empty state
        count: resetCount
    });

    console.log("Fixed timetable reset, applying to future...");
    await applyFixedTimetableForFuture(); // Logs internally

  } catch (error) {
    console.error("Error resetting fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため固定時間割を初期化できませんでした。");
    }
    throw error;
  }
};


/**
 * Subscribes to real-time updates for the fixed timetable.
 * @param {(timetable: FixedTimeSlot[]) => void} callback - Function to call with the updated timetable.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onFixedTimetableUpdate = (
    callback: (timetable: FixedTimeSlot[]) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
    const q = query(fixedTimetableCollectionRef); // Query without order for snapshot
    return onSnapshot(q, (snapshot) => {
        let timetable = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
         timetable = timetable.map(slot => ({
            ...slot,
            subjectId: slot.subjectId === undefined ? null : slot.subjectId
        }));
        // Sort client-side
        timetable.sort((a, b) => {
            const dayAIndex = AllDays.indexOf(a.day);
            const dayBIndex = AllDays.indexOf(b.day);
            if (dayAIndex !== dayBIndex) {
                return dayAIndex - dayBIndex;
            }
            return a.period - b.period;
        });
        callback(timetable);
    }, (error) => {
     console.error("Snapshot error on fixed timetable:", error);
       // Index error less likely without query order, but keep if needed
       if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
           console.error("Firestore query requires an index for realtime updates. Please check Firebase console error: ", (error as FirestoreError).message);
           if (onError) {
                onError(new Error("Firestore 固定時間割のリアルタイム更新に必要なインデックスがありません。Firebaseコンソールのエラーメッセージを確認してください。"));
           }
       } else if (onError) {
         onError(error);
       }
  });
};

// --- Daily Announcements ---

/**
 * Fetches daily announcements for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @returns {Promise<DailyAnnouncement[]>} Array of announcements for the given date.
 */
export const getDailyAnnouncements = async (date: string): Promise<DailyAnnouncement[]> => {
   try {
      const q = query(dailyAnnouncementsCollectionRef, where('date', '==', date));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          subjectIdOverride: doc.data().subjectIdOverride === undefined ? null : doc.data().subjectIdOverride, // Ensure null default
          updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
        }) as DailyAnnouncement);
    } catch (error) {
        console.error(`Error fetching daily announcements for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn(`Client is offline. Returning empty announcements for ${date}.`);
            return [];
        }
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error(`Firestore query for daily announcements on ${date} requires an index on 'date'. Please create it via the Firebase console link.`);
            throw new Error(`Firestore 連絡クエリ(日付: ${date})に必要なインデックス(date)がありません。Firebaseコンソールのリンクから作成してください。`);
        }
        throw error;
    }
};

/**
 * Creates or updates a daily announcement/note for a specific date and period.
 * Overwrites existing announcement for that slot on that day.
 * If `text` and `subjectIdOverride` are both empty/null, deletes the document.
 * Triggers applying fixed timetable to future after update/delete.
 * Logs the change with before/after states.
 * @param {Omit<DailyAnnouncement, 'id' | 'updatedAt'>} announcementData - The announcement data.
 * @returns {Promise<void>}
 */
export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>): Promise<void> => {
  const { date, period } = announcementData;
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollectionRef, docId);

  const text = announcementData.text ?? '';
  const subjectIdOverride = announcementData.subjectIdOverride === undefined ? null : announcementData.subjectIdOverride;

  let beforeState: DailyAnnouncement | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        beforeState = { ...oldDataSnap.data(), id: oldDataSnap.id } as DailyAnnouncement;
        beforeState.subjectIdOverride = beforeState.subjectIdOverride === undefined ? null : beforeState.subjectIdOverride;
    }

    // If both text and subjectIdOverride are null/empty, delete the document
    if (!text && subjectIdOverride === null) {
        if (beforeState) { // Only delete if it exists
            await deleteDailyAnnouncement(date, period); // Reuse delete function (logs internally)
        } else {
            console.log(`Announcement ${docId} does not exist and content is empty, no action needed.`);
        }
        return; // Exit early
    }

    const dataToSet: Omit<DailyAnnouncement, 'id'> = {
      date: date,
      period: period,
      subjectIdOverride: subjectIdOverride,
      text: text,
      updatedAt: Timestamp.now(),
    };
    const afterState = { id: docId, ...dataToSet, updatedAt: new Date() }; // Represent 'after' state

    const hasChanged = !beforeState
        || beforeState.text !== text
        || (beforeState.subjectIdOverride ?? null) !== (subjectIdOverride ?? null);

    if (hasChanged) {
        await setDoc(docRef, dataToSet); // Create or overwrite
        await logAction('upsert_announcement', { before: beforeState, after: afterState });
        // Apply fixed timetable to future after a manual change
        console.log("Manual announcement change, applying fixed timetable to future...");
        await applyFixedTimetableForFuture(); // Logs internally
    } else {
        console.log(`No changes to save for announcement ${docId}.`);
    }

  } catch (error) {
     console.error("Error upserting daily announcement:", error);
     if ((error as FirestoreError).code === 'unavailable') {
        throw new Error("オフラインのため連絡を保存できませんでした。");
     }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
          console.error("Firestore Error: Attempted to save 'undefined'. Check data structure.", announcementData); // Log input data
          throw new Error("保存データに無効な値(undefined)が含まれていました。");
     }
     throw error;
  }
};


/**
 * Deletes a daily announcement for a specific date and period.
 * Also triggers applying fixed timetable to future.
 * Logs the deletion with the state before deletion.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {number} period - The period number.
 * @returns {Promise<void>}
 */
export const deleteDailyAnnouncement = async (date: string, period: number): Promise<void> => {
    const docId = `${date}_${period}`;
    const docRef = doc(dailyAnnouncementsCollectionRef, docId);
    let beforeState: DailyAnnouncement | null = null;
    try {
        const oldDataSnap = await getDoc(docRef);
        if (oldDataSnap.exists()) {
            beforeState = { ...oldDataSnap.data(), id: docId } as DailyAnnouncement;
             beforeState.subjectIdOverride = beforeState.subjectIdOverride === undefined ? null : beforeState.subjectIdOverride;

            await deleteDoc(docRef);
            await logAction('delete_announcement', { before: beforeState, after: null });
             // Apply fixed timetable to future after a manual deletion
             console.log("Manual announcement deletion, applying fixed timetable to future...");
             await applyFixedTimetableForFuture(); // Logs internally
        } else {
            console.log(`Announcement ${docId} not found for deletion.`);
        }
    } catch (error) {
       console.error("Error deleting daily announcement:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため連絡を削除できませんでした。");
       }
       throw error;
    }
};


/**
 * Subscribes to real-time updates for daily announcements for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {(announcements: DailyAnnouncement[]) => void} callback - Function to call with updated announcements.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onDailyAnnouncementsUpdate = (
    date: string,
    callback: (announcements: DailyAnnouncement[]) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
  const q = query(dailyAnnouncementsCollectionRef, where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      subjectIdOverride: doc.data().subjectIdOverride === undefined ? null : doc.data().subjectIdOverride,
      updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
    }) as DailyAnnouncement);
    callback(announcements);
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
     if (onError) {
      if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
          onError(new Error(`Firestore 連絡のリアルタイム更新に必要なインデックス(date)がありません(日付:${date})。Firebaseコンソールのリンクから作成してください。`));
      } else {
         onError(error);
      }
    }
  });
};


// --- Daily General Announcements ---

/**
 * Fetches the general announcement for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @returns {Promise<DailyGeneralAnnouncement | null>} The general announcement or null if not found.
 */
export const getDailyGeneralAnnouncement = async (date: string): Promise<DailyGeneralAnnouncement | null> => {
    const docRef = doc(generalAnnouncementsCollectionRef, date);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                date: data.date,
                content: data.content ?? '',
                updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
            } as DailyGeneralAnnouncement;
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error fetching general announcement for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn(`Client is offline. Cannot fetch general announcement for ${date}.`);
            return null;
        }
        throw error;
    }
};

/**
 * Creates or updates a general announcement for a specific date.
 * If content is empty, deletes the document. Logs the change.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {string} content - The announcement content in Markdown format.
 * @returns {Promise<void>}
 */
export const upsertDailyGeneralAnnouncement = async (date: string, content: string): Promise<void> => {
    const docRef = doc(generalAnnouncementsCollectionRef, date);
    const trimmedContent = content.trim();
    let beforeState: DailyGeneralAnnouncement | null = null;

    try {
        const oldSnap = await getDoc(docRef);
        if (oldSnap.exists()) {
            beforeState = { id: date, ...oldSnap.data() } as DailyGeneralAnnouncement;
        }

        if (!trimmedContent) {
            if (beforeState) { // Only delete if it existed
                await deleteDoc(docRef);
                await logAction('delete_general_announcement', { before: beforeState, after: null });
            } else {
                 console.log(`General announcement for ${date} does not exist and content is empty.`);
            }
            return;
        }

        const dataToSet: Omit<DailyGeneralAnnouncement, 'id'> = {
            date: date,
            content: trimmedContent,
            updatedAt: Timestamp.now(),
        };
        const afterState = { id: date, ...dataToSet, updatedAt: new Date() };

        if (beforeState?.content !== trimmedContent) {
            await setDoc(docRef, dataToSet);
            await logAction('upsert_general_announcement', { before: beforeState, after: afterState });
        } else {
            console.log(`No changes to save for general announcement on ${date}.`);
        }
    } catch (error) {
        console.error(`Error upserting general announcement for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            throw new Error("オフラインのためお知らせを保存できませんでした。");
        }
        if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
             console.error("Firestore Error: Attempted to save 'undefined'. Check data structure.", content);
             throw new Error("保存データに無効な値(undefined)が含まれていました。");
        }
        throw error;
    }
};

/**
 * Subscribes to real-time updates for the general announcement for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {(announcement: DailyGeneralAnnouncement | null) => void} callback - Function to call with the updated announcement or null.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onDailyGeneralAnnouncementUpdate = (
    date: string,
    callback: (announcement: DailyGeneralAnnouncement | null) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
    const docRef = doc(generalAnnouncementsCollectionRef, date);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const announcement: DailyGeneralAnnouncement = {
                id: docSnap.id,
                date: data.date,
                content: data.content ?? '',
                updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
            };
            callback(announcement);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error(`Snapshot error on general announcement for ${date}:`, error);
        if (onError) {
            onError(error);
        }
    });
};


// --- School Events ---

/**
 * Fetches all non-regular school events.
 * @returns {Promise<SchoolEvent[]>} Array of school events.
 */
export const getSchoolEvents = async (): Promise<SchoolEvent[]> => {
    try {
        const q = query(eventsCollectionRef, orderBy('startDate'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
    } catch (error) {
       console.error("Error fetching school events:", error);
       if ((error as FirestoreError).code === 'unavailable') {
           console.warn("Client is offline. Returning empty school events.");
           return [];
       }
       if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query for events requires an index on 'startDate'. Please create it via the Firebase console link.");
            throw new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません。Firebaseコンソールのリンクから作成してください。");
        }
       throw error;
    }
};

/**
 * Adds a new school event. Logs the action.
 * @param {Omit<SchoolEvent, 'id'>} eventData - The event data.
 * @returns {Promise<string>} The ID of the newly created event.
 */
export const addSchoolEvent = async (eventData: Omit<SchoolEvent, 'id'>): Promise<string> => {
    const newDocRef = doc(eventsCollectionRef); // Auto-generate ID
    const dataToSet = {
        title: eventData.title || '',
        startDate: eventData.startDate, // Ensure format is YYYY-MM-DD
        endDate: eventData.endDate || eventData.startDate,
        description: eventData.description || '',
        createdAt: Timestamp.now()
    };
    try {
        await setDoc(newDocRef, dataToSet);
        const afterState = { id: newDocRef.id, ...dataToSet };
        await logAction('add_event', { before: null, after: afterState });
        return newDocRef.id;
    } catch (error) {
       console.error("Error adding school event:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため行事を追加できませんでした。");
       }
       if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
            console.error("Firestore Error: Attempted to save 'undefined' in event. Check data structure.", dataToSet);
            throw new Error("行事データに無効な値(undefined)が含まれていました。");
       }
       throw error;
    }
};

/**
 * Updates an existing school event. Logs the change.
 * @param {SchoolEvent} eventData - The updated event data (must include id).
 * @returns {Promise<void>}
 */
export const updateSchoolEvent = async (eventData: SchoolEvent): Promise<void> => {
    if (!eventData.id) throw new Error("Event ID is required for updates.");
    const docRef = doc(eventsCollectionRef, eventData.id);
    const dataToUpdate = {
        title: eventData.title || '',
        startDate: eventData.startDate,
        endDate: eventData.endDate || eventData.startDate,
        description: eventData.description || '',
    };
    let beforeState: SchoolEvent | null = null;

    try {
        const oldDataSnap = await getDoc(docRef);
        if (oldDataSnap.exists()) {
             beforeState = { id: eventData.id, ...oldDataSnap.data() } as SchoolEvent;
        }

        await setDoc(docRef, dataToUpdate, { merge: true });
        const afterState = { id: eventData.id, ...dataToUpdate }; // Construct after state

        // Check if data actually changed before logging
        if (!beforeState || JSON.stringify(beforeState) !== JSON.stringify(afterState)) {
             await logAction('update_event', { before: beforeState, after: afterState });
        } else {
            console.log(`No changes detected for event ${eventData.id}.`);
        }
    } catch (error) {
       console.error("Error updating school event:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため行事を更新できませんでした。");
       }
       if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
            console.error("Firestore Error: Attempted to save 'undefined' in event update. Check data structure.", dataToUpdate);
            throw new Error("更新データに無効な値(undefined)が含まれていました。");
       }
       throw error;
    }
};

/**
 * Deletes a school event. Logs the action.
 * @param {string} eventId - The ID of the event to delete.
 * @returns {Promise<void>}
 */
export const deleteSchoolEvent = async (eventId: string): Promise<void> => {
    const docRef = doc(eventsCollectionRef, eventId);
    let beforeState: SchoolEvent | null = null;
    try {
        const oldDataSnap = await getDoc(docRef);
        if (oldDataSnap.exists()) {
             beforeState = { id: eventId, ...oldDataSnap.data()} as SchoolEvent;
            await deleteDoc(docRef);
            await logAction('delete_event', { before: beforeState, after: null });
        } else {
            console.log(`Event ${eventId} not found for deletion.`);
        }
    } catch (error) {
       console.error("Error deleting school event:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため行事を削除できませんでした。");
       }
       throw error;
    }
};

/**
 * Subscribes to real-time updates for school events.
 * @param {(events: SchoolEvent[]) => void} callback - Function to call with the updated events list.
 * @param {(error: Error) => void} [onError] - Optional function to call on error.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onSchoolEventsUpdate = (
    callback: (events: SchoolEvent[]) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
    const q = query(eventsCollectionRef, orderBy('startDate'));
    return onSnapshot(q, (snapshot) => {
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
        callback(events);
    }, (error) => {
      console.error("Snapshot error on school events:", error);
       if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
           console.error("Firestore query for events requires an index on 'startDate' for realtime updates. Please create it via Firebase console.");
            if (onError) {
                onError(new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません (realtime)。Firebaseコンソールのリンクから作成してください。"));
            }
        } else if (onError) {
           onError(error);
        }
    });
};

// --- Future Timetable Application ---

/**
 * Applies the fixed timetable subjects to future daily announcements
 * for the next N weeks, but only for slots that don't already have
 * a daily announcement (text or subjectIdOverride).
 * Logs the overall operation.
 * @returns {Promise<void>}
 */
export const applyFixedTimetableForFuture = async (): Promise<void> => {
    console.log("Starting to apply fixed timetable for future dates...");
    let operationsCount = 0;
    let datesAffected: string[] = [];
    try {
        const settings = await getTimetableSettings();
        const fixedTimetable = await getFixedTimetable();

        if (!fixedTimetable || fixedTimetable.length === 0) {
            console.warn("No fixed timetable data found. Cannot apply to future.");
            return;
        }

        const today = startOfDay(new Date());
        const batch = writeBatch(db);

        const dayMapping: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY,
            6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY,
        };

        const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

        for (let i = 0; i < FUTURE_WEEKS_TO_APPLY * 7; i++) {
            const futureDate = addDays(today, i + 1);
            const dateStr = format(futureDate, 'yyyy-MM-dd');
            const dayOfWeekJs = getDay(futureDate);
            const dayOfWeekEnum = dayMapping[dayOfWeekJs];

            if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) {
                continue;
            }

            const existingAnnouncements = await getDailyAnnouncements(dateStr);
            const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));

            const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);
            let dateNeedsUpdate = false;

            for (const fixedSlot of fixedSlotsForDay) {
                if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                    continue;
                }

                const existingAnn = existingAnnouncementsMap.get(fixedSlot.period);
                const fixedSubjectIdOrNull = fixedSlot.subjectId ?? null;

                if (!existingAnn) {
                    const docId = `${dateStr}_${fixedSlot.period}`;
                    const docRef = doc(dailyAnnouncementsCollectionRef, docId);
                    const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = {
                        date: dateStr,
                        period: fixedSlot.period,
                        subjectIdOverride: fixedSubjectIdOrNull,
                        text: '',
                        updatedAt: Timestamp.now(),
                    };
                    batch.set(docRef, newAnnouncementData);
                    operationsCount++;
                    dateNeedsUpdate = true;
                } else {
                     if (!existingAnn.text && (existingAnn.subjectIdOverride ?? null) === null) {
                         if ((existingAnn.subjectIdOverride ?? null) !== fixedSubjectIdOrNull) {
                            const docId = `${dateStr}_${fixedSlot.period}`;
                            const docRef = doc(dailyAnnouncementsCollectionRef, docId);
                            batch.update(docRef, {
                                subjectIdOverride: fixedSubjectIdOrNull,
                                updatedAt: Timestamp.now()
                            });
                            operationsCount++;
                            dateNeedsUpdate = true;
                         }
                     }
                }
            }
            if (dateNeedsUpdate && !datesAffected.includes(dateStr)) {
                datesAffected.push(dateStr);
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Successfully applied/updated fixed timetable for ${operationsCount} future slots across ${datesAffected.length} days.`);
            await logAction('apply_fixed_timetable_future', {
                meta: { operationsCount, daysAffected: datesAffected.length, weeksApplied: FUTURE_WEEKS_TO_APPLY }
             });
        } else {
            console.log("No future slots needed updating based on fixed timetable.");
        }

    } catch (error) {
        console.error("Error applying fixed timetable to future dates:", error);
        await logAction('apply_fixed_timetable_future_error', { meta: { error: String(error) } });
         if ((error as FirestoreError).code === 'unavailable') {
            console.warn("Client is offline. Cannot apply fixed timetable to future.");
        } else if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
             console.error("Firestore index required for applying fixed timetable to future. Check getDailyAnnouncements index requirements. ", (error as FirestoreError).message);
        }
        // Avoid throwing error here as it's a background task, just log it.
    }
};

/**
 * Overwrites future daily announcements with the fixed timetable data for the next N weeks.
 * Unlike `applyFixedTimetableForFuture`, this function *always* overwrites existing announcements.
 * Logs the operation.
 * @returns {Promise<void>}
 */
export const resetFutureDailyAnnouncements = async (): Promise<void> => {
    console.log("Starting to reset future daily announcements with fixed timetable...");
    let operationsCount = 0;
    let datesAffected: string[] = [];
    const beforeStates: { [date: string]: DailyAnnouncement[] } = {}; // Track overwritten state

    try {
        const settings = await getTimetableSettings();
        const fixedTimetable = await getFixedTimetable();

        // No need to proceed if fixed timetable is empty, reset already implies empty state
        // if (!fixedTimetable || fixedTimetable.length === 0) {
        //     console.warn("No fixed timetable data found. Cannot reset future.");
        //     return;
        // }

        const today = startOfDay(new Date());
        const batch = writeBatch(db);

        const dayMapping: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY,
            6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY,
        };

        const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

        for (let i = 0; i < FUTURE_WEEKS_TO_APPLY * 7; i++) {
            const futureDate = addDays(today, i + 1);
            const dateStr = format(futureDate, 'yyyy-MM-dd');
            const dayOfWeekJs = getDay(futureDate);
            const dayOfWeekEnum = dayMapping[dayOfWeekJs];

            if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) {
                continue;
            }

            const existingAnnouncements = await getDailyAnnouncements(dateStr);
            if (existingAnnouncements.length > 0) {
                beforeStates[dateStr] = existingAnnouncements; // Log the state being overwritten
            }
            const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
            let dateNeedsUpdate = false;

            const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

            for (const fixedSlot of fixedSlotsForDay) {
                if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                    continue;
                }

                const docId = `${dateStr}_${fixedSlot.period}`;
                const docRef = doc(dailyAnnouncementsCollectionRef, docId);

                const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = {
                    date: dateStr,
                    period: fixedSlot.period,
                    subjectIdOverride: fixedSlot.subjectId ?? null,
                    text: '',
                    updatedAt: Timestamp.now(),
                };

                batch.set(docRef, newAnnouncementData); // Always overwrite
                operationsCount++;
                dateNeedsUpdate = true;
            }
             if (dateNeedsUpdate && !datesAffected.includes(dateStr)) {
                datesAffected.push(dateStr);
            }

            existingAnnouncementsMap.forEach((ann, period) => {
                const existsInFixed = fixedSlotsForDay.some(fs => fs.period === period);
                 if (!existsInFixed && period <= (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                    const docId = `${dateStr}_${period}`;
                    const docRef = doc(dailyAnnouncementsCollectionRef, docId);
                    batch.delete(docRef);
                    operationsCount++;
                     if (!datesAffected.includes(dateStr)) datesAffected.push(dateStr);
                }
            });
        }

        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Successfully reset future daily announcements for ${operationsCount} slots across ${datesAffected.length} days.`);
            await logAction('reset_future_daily_announcements', {
                 meta: { operationsCount, daysAffected: datesAffected.length, weeksApplied: FUTURE_WEEKS_TO_APPLY },
                 // Optionally log the 'before' states, but this could be large
                 // before: beforeStates
             });
        } else {
            console.log("No future slots needed resetting.");
        }

    } catch (error) {
        console.error("Error resetting future daily announcements:", error);
        await logAction('reset_future_daily_announcements_error', { meta: { error: String(error) } });
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn("Client is offline. Cannot reset future daily announcements.");
        } else if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore index required for resetting future daily announcements. Check getDailyAnnouncements index requirements. ", (error as FirestoreError).message);
        }
         // Avoid throwing error here as it's a background task, just log it.
    }
};


// --- Logs Retrieval (Moved from logService for direct use with React Query) ---

/**
 * Fetches recent logs.
 * @param {number} limitCount - Maximum number of logs to retrieve.
 * @returns {Promise<any[]>} Array of log entries.
 */
export const getLogs = async (limitCount: number = 50): Promise<any[]> => {
    const logsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'logs'); // Reference here
    try {
        const q = query(logsCollection, orderBy('timestamp', 'desc'), limit(limitCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: (doc.data().timestamp as Timestamp)?.toDate(),
        }));
    } catch (error) {
       console.error("Error fetching logs:", error);
       if ((error as FirestoreError).code === 'unavailable') {
           console.warn("Client is offline. Returning empty logs.");
           return [];
       }
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query for logs requires an index on 'timestamp'. Please create it via Firebase console.");
            throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。Firebaseコンソールのリンクから作成してください。");
        }
       throw error;
    }
};


// --- React Query Integration Helper ---

export const queryFnGetTimetableSettings = () => getTimetableSettings();
export const queryFnGetFixedTimetable = () => getFixedTimetable();
export const queryFnGetDailyAnnouncements = (date: string) => () => getDailyAnnouncements(date);
export const queryFnGetDailyGeneralAnnouncement = (date: string) => () => getDailyGeneralAnnouncement(date);
export const queryFnGetSchoolEvents = () => getSchoolEvents();
// getLogs is already exported above for direct use
