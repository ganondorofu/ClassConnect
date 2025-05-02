
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
  collectionGroup, // Import collectionGroup for broader queries if needed later
} from 'firebase/firestore';
import type {
  FixedTimeSlot,
  TimetableSettings,
  DayOfWeek,
  SchoolEvent,
} from '@/models/timetable';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement'; // Import DailyGeneralAnnouncement
import type { Subject } from '@/models/subject'; // Import Subject
// Correctly import DEFAULT_TIMETABLE_SETTINGS from the model file
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, AllDays, DayOfWeek as DayOfWeekEnum } from '@/models/timetable';
import { format, addDays, startOfDay, getDay, parseISO } from 'date-fns';
import { getSubjects } from './subjectController'; // Import getSubjects

/**
 * Placeholder for the current class ID.
 * In a real app, this would come from user context or routing.
 */
const CURRENT_CLASS_ID = 'defaultClass'; // Replace with dynamic class ID logic
const FUTURE_WEEKS_TO_APPLY = 3; // Number of future weeks to auto-apply fixed timetable

// --- Firestore Collection References ---

const settingsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'settings');
const fixedTimetableCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'fixedTimetable');
const dailyAnnouncementsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'dailyAnnouncements');
const generalAnnouncementsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'generalAnnouncements'); // New collection for general announcements
const eventsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'events');
const logsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'logs'); // For audit logs

// --- Timetable Settings ---

/**
 * Fetches the timetable settings for the current class.
 * If no settings exist, initializes with default values.
 * @returns {Promise<TimetableSettings>} The timetable settings.
 */
export const getTimetableSettings = async (): Promise<TimetableSettings> => {
  const docRef = doc(settingsCollection, 'timetable');
  try {
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      // Ensure activeDays defaults correctly if missing
      const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0
        ? data.activeDays
        : DEFAULT_TIMETABLE_SETTINGS.activeDays;

      return {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: activeDays,
      } as TimetableSettings;
    } else {
      console.log("No settings found, initializing with defaults.");
      // Use the imported DEFAULT_TIMETABLE_SETTINGS
      await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
      await logAction('initialize_settings', { settings: DEFAULT_TIMETABLE_SETTINGS });
      return DEFAULT_TIMETABLE_SETTINGS;
    }
  } catch (error) {
    console.error("Error fetching timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') {
       console.warn("Client is offline. Returning default settings.");
       // Use the imported DEFAULT_TIMETABLE_SETTINGS
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

  // Use imported DEFAULT_TIMETABLE_SETTINGS for defaults
  const newSettings: TimetableSettings = {
      numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
      activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
  };
  const docRef = doc(settingsCollection, 'timetable');

  try {
    let fixedTimetableNeedsUpdate = false;
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      // Use imported DEFAULT_TIMETABLE_SETTINGS for defaults in transaction
      const currentSettingsInTx = settingsDoc.exists()
          ? (settingsDoc.data() as TimetableSettings)
          : DEFAULT_TIMETABLE_SETTINGS;

      // Ensure activeDays defaults correctly if missing in transaction
      const currentActiveDays = currentSettingsInTx.activeDays && Array.isArray(currentSettingsInTx.activeDays) && currentSettingsInTx.activeDays.length > 0
          ? currentSettingsInTx.activeDays
          : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettings.activeDays && Array.isArray(newSettings.activeDays) && newSettings.activeDays.length > 0
          ? newSettings.activeDays
          : DEFAULT_TIMETABLE_SETTINGS.activeDays;

      transaction.set(docRef, newSettings); // Update settings document

      // Check if number of periods changed
      const currentPeriods = currentSettingsInTx.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
      const newPeriodsValue = settingsUpdates.numberOfPeriods; // Use the update value directly

      if (newPeriodsValue !== undefined && newPeriodsValue !== currentPeriods) {
        fixedTimetableNeedsUpdate = true;
        const daysToUpdate = newActiveDays; // Use the potentially updated active days

        if (newPeriodsValue > currentPeriods) {
          // Add new period slots
          for (let day of daysToUpdate) {
            for (let period = currentPeriods + 1; period <= newPeriodsValue; period++) {
              const slotId = `${day}_${period}`;
              const newSlotRef = doc(fixedTimetableCollection, slotId);
              const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subjectId: null };
              transaction.set(newSlotRef, defaultSlot);
            }
          }
        } else {
          // Remove extra period slots
          const q = query(fixedTimetableCollection, where('period', '>', newPeriodsValue), where('day', 'in', daysToUpdate));
          const snapshot = await getDocs(q); // This requires network
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      }
      // Check if active days changed, even if number of periods didn't
      else if (settingsUpdates.activeDays && JSON.stringify(newActiveDays.sort()) !== JSON.stringify(currentActiveDays.sort())) {
          fixedTimetableNeedsUpdate = true;
          const addedDays = newActiveDays.filter(d => !currentActiveDays.includes(d));
          const removedDays = currentActiveDays.filter(d => !newActiveDays.includes(d));
          const periodsToManage = newSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;

          // Add slots for newly added days
          for (const day of addedDays) {
              for (let period = 1; period <= periodsToManage; period++) {
                  const slotId = `${day}_${period}`;
                  const newSlotRef = doc(fixedTimetableCollection, slotId);
                  const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subjectId: null };
                  transaction.set(newSlotRef, defaultSlot);
              }
          }

          // Remove slots for removed days
          if (removedDays.length > 0) {
              const q = query(fixedTimetableCollection, where('day', 'in', removedDays));
              const snapshot = await getDocs(q); // Requires network
              snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
          }
      }
    });

    await logAction('update_settings', { oldSettings: currentSettings, newSettings });

    // Trigger future application *after* transaction succeeds if changes occurred
    if (fixedTimetableNeedsUpdate) {
      console.log("Settings changed, applying fixed timetable to future...");
      await applyFixedTimetableForFuture();
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
  const docRef = doc(settingsCollection, 'timetable');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
       const data = docSnap.data();
       // Use imported DEFAULT_TIMETABLE_SETTINGS for defaults
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
       // Re-initialize using the function which now uses the imported default
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
      const q = query(fixedTimetableCollection, orderBy('day'), orderBy('period'));
      const snapshot = await getDocs(q);
      let slots = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);

      // Ensure subjectId exists, default to null if not
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
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            // Provide a more specific message if possible, or guide user to check console
            console.error("Firestore query requires an index. Please check the Firebase console error for a link to create it: ", (error as FirestoreError).message);
            throw new Error("Firestore クエリに必要なインデックスがありません。Firebaseコンソールのエラーメッセージを確認し、リンクから作成してください。");
        }
      throw error;
   }
};


/**
 * Updates multiple fixed timetable slots in a batch.
 * Also triggers applying these changes to future daily announcements.
 * @param {FixedTimeSlot[]} slots - Array of slots to update.
 * @returns {Promise<void>}
 */
export const batchUpdateFixedTimetable = async (slots: FixedTimeSlot[]): Promise<void> => {
  const batch = writeBatch(db);
  let changesMade = false;
  let existingSlotsMap: Map<string, FixedTimeSlot> = new Map();

  try {
      // Fetch existing data for comparison (requires network)
      const currentTimetable = await getFixedTimetable();
      currentTimetable.forEach(slot => existingSlotsMap.set(slot.id, slot));
  } catch (error) {
      if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため現在の時間割を取得できず、保存できませんでした。");
      }
       if (error instanceof Error && error.message.includes("Firestore クエリに必要なインデックスがありません")) {
          throw error; // Rethrow the specific index error
      }
      // Log and rethrow other fetch errors
      console.error("Failed to fetch current fixed timetable for comparison:", error);
      throw new Error(`現在の固定時間割の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }


  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) {
      console.warn("Skipping slot update due to missing ID, day, or period:", slot);
      return; // Skip if essential fields are missing
    }
    const docRef = doc(fixedTimetableCollection, slot.id);
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubjectId = slot.subjectId === undefined ? null : slot.subjectId; // Ensure subjectId is null if undefined

    // Only add to batch if the subjectId has actually changed
    if (!existingSlot || (existingSlot.subjectId ?? null) !== newSubjectId) {
        const dataToSet: FixedTimeSlot = {
            id: slot.id,
            day: slot.day,
            period: slot.period,
            subjectId: newSubjectId, // Save null if no subject
        };
        batch.set(docRef, dataToSet);
        changesMade = true;
    }
  });

  if (!changesMade) {
      console.log("No changes detected in fixed timetable.");
      return; // Nothing to commit
  }

  try {
    await batch.commit();
    await logAction('batch_update_fixed_timetable', { count: slots.length }); // Log the batch operation

    // After successful commit, apply changes to future dates
    console.log("Fixed timetable updated, applying to future...");
    await applyFixedTimetableForFuture();

  } catch (error) {
    console.error("Error batch updating fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため固定時間割を一括更新できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
          console.error("Firestore Error: Attempted to save 'undefined' during batch update. Check slot data:", slots.filter(s => !existingSlotsMap.has(s.id) || (existingSlotsMap.get(s.id)?.subjectId ?? null) !== (s.subjectId ?? null)));
          throw new Error("固定時間割データに無効な値(undefined)が含まれていました。");
     }
    throw error;
  }
};

/**
 * Resets all fixed timetable slots by setting their subjectId to null.
 * Triggers future application of fixed timetable after reset.
 * @returns {Promise<void>}
 */
export const resetFixedTimetable = async (): Promise<void> => {
  console.log('Resetting fixed timetable...');
  const batch = writeBatch(db);
  let resetCount = 0;

  try {
    // Fetch all existing slots
    const q = query(fixedTimetableCollection);
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      const slot = docSnap.data() as FixedTimeSlot;
      // Only add to batch if the subjectId is not already null
      if ((slot.subjectId ?? null) !== null) {
        batch.update(docSnap.ref, { subjectId: null });
        resetCount++;
      }
    });

    if (resetCount === 0) {
      console.log("Fixed timetable is already empty. No reset needed.");
      return; // Nothing to commit
    }

    await batch.commit();
    await logAction('reset_fixed_timetable', { count: resetCount });

    // Apply the reset (empty slots) to future dates
    console.log("Fixed timetable reset, applying to future...");
    await applyFixedTimetableForFuture();

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
    // Order by day (using AllDays order) and then period for consistency
    const q = query(fixedTimetableCollection);
    return onSnapshot(q, (snapshot) => {
        let timetable = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
         // Ensure subjectId exists, default to null if not
         timetable = timetable.map(slot => ({
            ...slot,
            subjectId: slot.subjectId === undefined ? null : slot.subjectId
        }));
        // Custom sort based on AllDays order
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
      const q = query(dailyAnnouncementsCollection, where('date', '==', date));
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
         // Check for index error
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
 * @param {Omit<DailyAnnouncement, 'id' | 'updatedAt'>} announcementData - The announcement data.
 * @returns {Promise<void>}
 */
export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>): Promise<void> => {
  const { date, period } = announcementData;
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollection, docId);

  const text = announcementData.text ?? '';
  const subjectIdOverride = announcementData.subjectIdOverride === undefined ? null : announcementData.subjectIdOverride; // Ensure null default

  // If both text and subjectIdOverride are null/empty, delete the document
  if (!text && subjectIdOverride === null) {
      await deleteDailyAnnouncement(date, period); // Reuse delete function (logs internally)
      return; // Exit early
  }

  const dataToSet: Omit<DailyAnnouncement, 'id'> = {
    date: date,
    period: period,
    subjectIdOverride: subjectIdOverride, // Save null if no override
    text: text,
    updatedAt: Timestamp.now(),
  };

  let oldData: DailyAnnouncement | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        oldData = { ...oldDataSnap.data(), id: oldDataSnap.id } as DailyAnnouncement;
        // Ensure default for comparison
        oldData.subjectIdOverride = oldData.subjectIdOverride === undefined ? null : oldData.subjectIdOverride;
    }

    const hasChanged = !oldData
        || oldData.text !== text
        || (oldData.subjectIdOverride ?? null) !== (subjectIdOverride ?? null);

    if (hasChanged) {
        await setDoc(docRef, dataToSet); // Create or overwrite
        await logAction('upsert_announcement', {
            docId,
            date,
            period,
            oldText: oldData?.text ?? null,
            newText: text,
            oldSubjectIdOverride: oldData?.subjectIdOverride ?? null,
            newSubjectIdOverride: subjectIdOverride ?? null
        });
        // Apply fixed timetable to future after a manual change
        console.log("Manual announcement change, applying fixed timetable to future...");
        await applyFixedTimetableForFuture();
    } else {
        console.log(`No changes to save for announcement ${docId}.`);
    }

  } catch (error) {
     console.error("Error upserting daily announcement:", error);
     if ((error as FirestoreError).code === 'unavailable') {
        throw new Error("オフラインのため連絡を保存できませんでした。");
     }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
          console.error("Firestore Error: Attempted to save 'undefined'. Check data structure.", dataToSet);
          throw new Error("保存データに無効な値(undefined)が含まれていました。");
     }
     throw error;
  }
};


/**
 * Deletes a daily announcement for a specific date and period.
 * Also triggers applying fixed timetable to future.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {number} period - The period number.
 * @returns {Promise<void>}
 */
export const deleteDailyAnnouncement = async (date: string, period: number): Promise<void> => {
    const docId = `${date}_${period}`;
    const docRef = doc(dailyAnnouncementsCollection, docId);
    try {
        const oldDataSnap = await getDoc(docRef); // Might fail offline
        if (oldDataSnap.exists()) {
            const oldData = oldDataSnap.data();
            await deleteDoc(docRef);
            await logAction('delete_announcement', {
                 docId,
                 date,
                 period,
                 oldText: oldData?.text ?? null,
                 oldSubjectIdOverride: oldData?.subjectIdOverride === undefined ? null : oldData?.subjectIdOverride
            });
             // Apply fixed timetable to future after a manual deletion
             console.log("Manual announcement deletion, applying fixed timetable to future...");
             await applyFixedTimetableForFuture();
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
  const q = query(dailyAnnouncementsCollection, where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      subjectIdOverride: doc.data().subjectIdOverride === undefined ? null : doc.data().subjectIdOverride, // Ensure null default
      updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
    }) as DailyAnnouncement);
    callback(announcements);
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
     if (onError) {
      // Pass the specific index error message if available
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
    const docRef = doc(generalAnnouncementsCollection, date);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                date: data.date,
                content: data.content ?? '', // Default to empty string if content is missing
                updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
            } as DailyGeneralAnnouncement;
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error fetching general announcement for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn(`Client is offline. Cannot fetch general announcement for ${date}.`);
            return null; // Return null on offline error
        }
        throw error;
    }
};

/**
 * Creates or updates a general announcement for a specific date.
 * If content is empty, deletes the document.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {string} content - The announcement content in Markdown format.
 * @returns {Promise<void>}
 */
export const upsertDailyGeneralAnnouncement = async (date: string, content: string): Promise<void> => {
    const docRef = doc(generalAnnouncementsCollection, date);
    const trimmedContent = content.trim();

    if (!trimmedContent) {
        // Delete if content is empty
        try {
            const oldSnap = await getDoc(docRef);
            if (oldSnap.exists()) {
                await deleteDoc(docRef);
                await logAction('delete_general_announcement', { date, oldContent: oldSnap.data().content });
            }
        } catch (error) {
             console.error(`Error deleting empty general announcement for ${date}:`, error);
             if ((error as FirestoreError).code === 'unavailable') {
                 throw new Error("オフラインのため空のお知らせを削除できませんでした。");
             }
             throw error;
        }
        return;
    }

    const dataToSet: Omit<DailyGeneralAnnouncement, 'id'> = {
        date: date,
        content: trimmedContent,
        updatedAt: Timestamp.now(),
    };

    try {
        const oldSnap = await getDoc(docRef);
        const oldContent = oldSnap.exists() ? oldSnap.data().content : null;
        if (oldContent !== trimmedContent) {
            await setDoc(docRef, dataToSet);
            await logAction('upsert_general_announcement', { date, oldContent, newContent: trimmedContent });
        } else {
            console.log(`No changes to save for general announcement on ${date}.`);
        }
    } catch (error) {
        console.error(`Error upserting general announcement for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            throw new Error("オフラインのためお知らせを保存できませんでした。");
        }
        if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
             console.error("Firestore Error: Attempted to save 'undefined'. Check data structure.", dataToSet);
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
    const docRef = doc(generalAnnouncementsCollection, date);
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
            callback(null); // No announcement for this date
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
        const q = query(eventsCollection, orderBy('startDate'));
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
 * Adds a new school event.
 * @param {Omit<SchoolEvent, 'id'>} eventData - The event data.
 * @returns {Promise<string>} The ID of the newly created event.
 */
export const addSchoolEvent = async (eventData: Omit<SchoolEvent, 'id'>): Promise<string> => {
    const newDocRef = doc(collection(db, 'classes', CURRENT_CLASS_ID, 'events')); // Auto-generate ID
    const dataToSet = {
        ...eventData,
        startDate: eventData.startDate, // Ensure format is YYYY-MM-DD
        endDate: eventData.endDate || eventData.startDate, // Default end date to start date
        createdAt: Timestamp.now()
    };
    try {
        await setDoc(newDocRef, dataToSet);
        await logAction('add_event', { eventId: newDocRef.id, title: eventData.title, startDate: dataToSet.startDate, endDate: dataToSet.endDate });
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
 * Updates an existing school event.
 * @param {SchoolEvent} eventData - The updated event data (must include id).
 * @returns {Promise<void>}
 */
export const updateSchoolEvent = async (eventData: SchoolEvent): Promise<void> => {
    if (!eventData.id) throw new Error("Event ID is required for updates.");
    const docRef = doc(eventsCollection, eventData.id);
    // Prepare data, ensure endDate defaults to startDate if empty/null
    const dataToUpdate = {
        title: eventData.title || '',
        startDate: eventData.startDate,
        endDate: eventData.endDate || eventData.startDate,
        description: eventData.description || '',
    };

    try {
        const oldDataSnap = await getDoc(docRef); // Might fail offline
        const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;
        await setDoc(docRef, dataToUpdate, { merge: true }); // Use merge to update fields

        if (JSON.stringify(oldData) !== JSON.stringify({ ...oldData, ...dataToUpdate })) { // Compare relevant fields
            await logAction('update_event', { eventId: eventData.id, oldData: oldData, newData: dataToUpdate });
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
 * Deletes a school event.
 * @param {string} eventId - The ID of the event to delete.
 * @returns {Promise<void>}
 */
export const deleteSchoolEvent = async (eventId: string): Promise<void> => {
    const docRef = doc(eventsCollection, eventId);
    try {
        const oldDataSnap = await getDoc(docRef); // Might fail offline
        if (oldDataSnap.exists()) {
             const oldData = oldDataSnap.data();
            await deleteDoc(docRef);
            await logAction('delete_event', { eventId, oldTitle: oldData?.title, oldStartDate: oldData?.startDate });
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
    const q = query(eventsCollection, orderBy('startDate'));
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
 * This is triggered after saving fixed timetable or settings, or manual daily changes.
 * @returns {Promise<void>}
 */
export const applyFixedTimetableForFuture = async (): Promise<void> => {
    console.log("Starting to apply fixed timetable for future dates...");
    try {
        const settings = await getTimetableSettings();
        const fixedTimetable = await getFixedTimetable();

        if (!fixedTimetable || fixedTimetable.length === 0) {
            console.warn("No fixed timetable data found. Cannot apply to future.");
            return;
        }

        const today = startOfDay(new Date());
        const batch = writeBatch(db);
        let operationsCount = 0;
        let datesAffected: string[] = [];

        const dayMapping: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY,
            6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY,
        };

        // Use the activeDays from settings
        const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

        // Iterate through the next N weeks
        for (let i = 0; i < FUTURE_WEEKS_TO_APPLY * 7; i++) {
            const futureDate = addDays(today, i + 1); // Start from tomorrow
            const dateStr = format(futureDate, 'yyyy-MM-dd');
            const dayOfWeekJs = getDay(futureDate);
            const dayOfWeekEnum = dayMapping[dayOfWeekJs];

            // Skip if it's not an active day according to settings
            if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) {
                continue;
            }

            // Fetch existing announcements for this future date
            const existingAnnouncements = await getDailyAnnouncements(dateStr);
            const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));

            // Apply fixed slots for this day
            const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);
            let dateNeedsUpdate = false;

            for (const fixedSlot of fixedSlotsForDay) {
                const existingAnn = existingAnnouncementsMap.get(fixedSlot.period);

                // Only consider periods within the defined number of periods
                 if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                     continue;
                 }


                if (!existingAnn) {
                    // No existing announcement, create a default one based on fixed slot
                    const docId = `${dateStr}_${fixedSlot.period}`;
                    const docRef = doc(dailyAnnouncementsCollection, docId);
                    const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = {
                        date: dateStr,
                        period: fixedSlot.period,
                        subjectIdOverride: fixedSlot.subjectId ?? null, // Apply fixed subject ID (or null)
                        text: '',
                        updatedAt: Timestamp.now(),
                    };
                    batch.set(docRef, newAnnouncementData);
                    operationsCount++;
                    dateNeedsUpdate = true;
                } else {
                     // If existing announcement has NO text and NO subject override,
                     // update it with the fixed subject ID (or null if fixed slot has no subject).
                     if (!existingAnn.text && (existingAnn.subjectIdOverride ?? null) === null) {
                         // Only update if the fixed slot's subject ID is different
                         if ((existingAnn.subjectIdOverride ?? null) !== (fixedSlot.subjectId ?? null)) {
                            const docId = `${dateStr}_${fixedSlot.period}`;
                            const docRef = doc(dailyAnnouncementsCollection, docId);
                            batch.update(docRef, {
                                subjectIdOverride: fixedSlot.subjectId ?? null, // Update with fixed ID or null
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
            await logAction('apply_fixed_timetable_future', { operationsCount, daysAffected: datesAffected.length, weeksApplied: FUTURE_WEEKS_TO_APPLY });
        } else {
            console.log("No future slots needed updating based on fixed timetable.");
        }

    } catch (error) {
        console.error("Error applying fixed timetable to future dates:", error);
        await logAction('apply_fixed_timetable_future_error', { error: String(error) });
         if ((error as FirestoreError).code === 'unavailable') {
            console.warn("Client is offline. Cannot apply fixed timetable to future.");
        } else if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
             console.error("Firestore index required for applying fixed timetable to future. Check getDailyAnnouncements index requirements. ", (error as FirestoreError).message);
        }
    }
};

/**
 * Overwrites future daily announcements with the fixed timetable data for the next N weeks.
 * Unlike `applyFixedTimetableForFuture`, this function *always* overwrites existing announcements.
 * @returns {Promise<void>}
 */
export const resetFutureDailyAnnouncements = async (): Promise<void> => {
    console.log("Starting to reset future daily announcements with fixed timetable...");
    try {
        const settings = await getTimetableSettings();
        const fixedTimetable = await getFixedTimetable();

        if (!fixedTimetable || fixedTimetable.length === 0) {
            console.warn("No fixed timetable data found. Cannot reset future.");
            // Consider deleting future announcements if fixed timetable is empty? For now, just return.
            return;
        }

        const today = startOfDay(new Date());
        const batch = writeBatch(db);
        let operationsCount = 0;
        let datesAffected: string[] = [];

        const dayMapping: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY,
            6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY,
        };

        const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

        // Iterate through the next N weeks
        for (let i = 0; i < FUTURE_WEEKS_TO_APPLY * 7; i++) {
            const futureDate = addDays(today, i + 1); // Start from tomorrow
            const dateStr = format(futureDate, 'yyyy-MM-dd');
            const dayOfWeekJs = getDay(futureDate);
            const dayOfWeekEnum = dayMapping[dayOfWeekJs];

            if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) {
                continue;
            }

            // Fetch existing announcements for deletion/overwrite check (optional but good for logging)
            const existingAnnouncements = await getDailyAnnouncements(dateStr);
            const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
            let dateNeedsUpdate = false;

            const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

            for (const fixedSlot of fixedSlotsForDay) {
                if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                    continue;
                }

                const docId = `${dateStr}_${fixedSlot.period}`;
                const docRef = doc(dailyAnnouncementsCollection, docId);
                const existingAnn = existingAnnouncementsMap.get(fixedSlot.period);

                const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = {
                    date: dateStr,
                    period: fixedSlot.period,
                    subjectIdOverride: fixedSlot.subjectId ?? null, // Apply fixed subject ID (or null)
                    text: '', // Reset text
                    updatedAt: Timestamp.now(),
                };

                // Overwrite regardless of existing content
                batch.set(docRef, newAnnouncementData);
                operationsCount++;
                dateNeedsUpdate = true;
            }
             if (dateNeedsUpdate && !datesAffected.includes(dateStr)) {
                datesAffected.push(dateStr);
            }

            // Optionally delete announcements for periods that *don't* exist in the fixed timetable for this day
            // This ensures future days perfectly match the fixed schedule after a reset.
            existingAnnouncementsMap.forEach((ann, period) => {
                const existsInFixed = fixedSlotsForDay.some(fs => fs.period === period);
                if (!existsInFixed && period <= (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) {
                    const docId = `${dateStr}_${period}`;
                    const docRef = doc(dailyAnnouncementsCollection, docId);
                    batch.delete(docRef);
                    operationsCount++; // Count deletions too
                     if (!datesAffected.includes(dateStr)) datesAffected.push(dateStr);
                }
            });
        }

        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Successfully reset future daily announcements for ${operationsCount} slots across ${datesAffected.length} days.`);
            await logAction('reset_future_daily_announcements', { operationsCount, daysAffected: datesAffected.length, weeksApplied: FUTURE_WEEKS_TO_APPLY });
        } else {
            console.log("No future slots needed resetting.");
        }

    } catch (error) {
        console.error("Error resetting future daily announcements:", error);
        await logAction('reset_future_daily_announcements_error', { error: String(error) });
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn("Client is offline. Cannot reset future daily announcements.");
        } else if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore index required for resetting future daily announcements. Check getDailyAnnouncements index requirements. ", (error as FirestoreError).message);
        }
    }
};


// --- Logging ---

/**
 * Logs an action performed by a user (or system).
 * Replaces undefined values in details with null.
 */
const logAction = async (actionType: string, details: object, userId: string = 'anonymous') => {
  // Ensure details are serializable (replace undefined with null)
  const cleanDetails = JSON.parse(JSON.stringify(details, (key, value) =>
    value === undefined ? null : value
  ));

  const logEntry = {
      action: actionType,
      timestamp: Timestamp.now(),
      userId: userId,
      details: cleanDetails,
    };

  try {
    const newLogRef = doc(logsCollection); // Auto-generate ID
    await setDoc(newLogRef, logEntry);
  } catch (error) {
    console.error(`Failed to log action '${actionType}' (might be offline):`, error);
    if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
       console.error("Firestore Logging Error: Attempted to save 'undefined' in log details.", logEntry);
   }
     // Don't throw error for logging failures
  }
};

/**
 * Fetches recent logs.
 * @param {number} limitCount - Maximum number of logs to retrieve.
 * @returns {Promise<any[]>} Array of log entries.
 */
export const getLogs = async (limitCount: number = 50): Promise<any[]> => {
    try {
        const q = query(logsCollection, orderBy('timestamp', 'desc'), limit(limitCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: (doc.data().timestamp as Timestamp)?.toDate(), // Convert Timestamp
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
export const queryFnGetDailyGeneralAnnouncement = (date: string) => () => getDailyGeneralAnnouncement(date); // Added for general announcements
export const queryFnGetSchoolEvents = () => getSchoolEvents();
