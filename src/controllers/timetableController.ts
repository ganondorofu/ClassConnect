
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
import type { DailyAnnouncement } from '@/models/announcement';
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, AllDays, DayOfWeek as DayOfWeekEnum } from '@/models/timetable';
import { format, addDays, startOfDay, getDay, parseISO } from 'date-fns';


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
      // Ensure activeDays is always present, falling back to default if missing
      const data = docSnap.data();
      return {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: data.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
      } as TimetableSettings;
    } else {
      // Initialize with default settings if not found
      console.log("No settings found, initializing with defaults.");
      await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
      await logAction('initialize_settings', { settings: DEFAULT_TIMETABLE_SETTINGS });
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
      numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods,
      activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays,
  };
  const docRef = doc(settingsCollection, 'timetable');

  try {
    let fixedTimetableNeedsUpdate = false;
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      const currentSettingsInTx = settingsDoc.exists() ? (settingsDoc.data() as TimetableSettings) : DEFAULT_TIMETABLE_SETTINGS;

      const currentActiveDays = currentSettingsInTx.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;

      transaction.set(docRef, newSettings); // Update settings document

      if (settingsUpdates.numberOfPeriods !== undefined && settingsUpdates.numberOfPeriods !== currentSettingsInTx.numberOfPeriods) {
        fixedTimetableNeedsUpdate = true;
        const oldPeriods = currentSettingsInTx.numberOfPeriods;
        const newPeriods = settingsUpdates.numberOfPeriods;
        const daysToUpdate = newActiveDays; // Use the potentially updated active days

        if (newPeriods > oldPeriods) {
          for (let day of daysToUpdate) {
            for (let period = oldPeriods + 1; period <= newPeriods; period++) {
              const slotId = `${day}_${period}`;
              const newSlotRef = doc(fixedTimetableCollection, slotId);
              const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subject: '' };
              transaction.set(newSlotRef, defaultSlot);
            }
          }
        } else {
          // Query outside transaction, delete inside
          const q = query(fixedTimetableCollection, where('period', '>', newPeriods), where('day', 'in', daysToUpdate));
          const snapshot = await getDocs(q); // This requires network
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      } else if (settingsUpdates.activeDays) {
          fixedTimetableNeedsUpdate = true;
          const addedDays = newActiveDays.filter(d => !currentActiveDays.includes(d));
          const removedDays = currentActiveDays.filter(d => !newActiveDays.includes(d));

          for (const day of addedDays) {
              for (let period = 1; period <= newSettings.numberOfPeriods; period++) {
                  const slotId = `${day}_${period}`;
                  const newSlotRef = doc(fixedTimetableCollection, slotId);
                  const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subject: '' };
                  transaction.set(newSlotRef, defaultSlot);
              }
          }

          if (removedDays.length > 0) {
              const q = query(fixedTimetableCollection, where('day', 'in', removedDays));
              const snapshot = await getDocs(q); // Requires network
              snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
          }
      }
    });

    await logAction('update_settings', { oldSettings: currentSettings, newSettings });

    // Trigger future application *after* transaction succeeds
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
      const settings: TimetableSettings = {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: data.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
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
      const snapshot = await getDocs(fixedTimetableCollection);
      const slots = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
       slots.sort((a, b) => {
           const dayOrder = AllDays.indexOf(a.day) - AllDays.indexOf(b.day); // Use AllDays for correct sorting
           if (dayOrder !== 0) return dayOrder;
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
            console.error("Firestore query requires an index. Please create the index in the Firebase console using the link provided in the error message.");
            throw new Error("Firestore クエリに必要なインデックスがありません。Firebaseコンソールのエラーメッセージ内のリンクを使用して作成してください。");
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
      throw error; // Rethrow other fetch errors
  }


  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) {
      console.warn("Skipping slot update due to missing ID, day, or period:", slot);
      return; // Skip if essential fields are missing
    }
    const docRef = doc(fixedTimetableCollection, slot.id);
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubject = slot.subject || ''; // Ensure subject is string

    // Only add to batch if the subject has actually changed
    if (!existingSlot || existingSlot.subject !== newSubject) {
        const dataToSet: FixedTimeSlot = {
            id: slot.id,
            day: slot.day,
            period: slot.period,
            subject: newSubject,
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
    const q = query(fixedTimetableCollection);
    return onSnapshot(q, (snapshot) => {
        const timetable = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
        timetable.sort((a, b) => {
             const dayOrder = AllDays.indexOf(a.day) - AllDays.indexOf(b.day); // Use AllDays
            if (dayOrder !== 0) return dayOrder;
            return a.period - b.period;
        });
        callback(timetable);
    }, (error) => {
     console.error("Snapshot error on fixed timetable:", error);
      if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
           console.error("Firestore query requires an index for realtime updates. Please create the index in the Firebase console using the link provided in previous errors.");
           if (onError) {
                onError(new Error("Firestore クエリに必要なインデックスがありません (realtime)。Firebaseコンソールのエラーメッセージ内のリンクを使用して作成してください。"));
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
            console.error(`Firestore query for daily announcements on ${date} requires an index on 'date'. Please create it.`);
            throw new Error(`Firestore 連絡クエリ(日付: ${date})に必要なインデックス(date)がありません。作成してください。`);
        }
        throw error;
    }
};

/**
 * Creates or updates a daily announcement/note for a specific date and period.
 * Overwrites existing announcement for that slot on that day.
 * If `text` and `subjectOverride` are both empty/null, deletes the document.
 * Triggers applying fixed timetable to future after update/delete.
 * @param {Omit<DailyAnnouncement, 'id' | 'updatedAt'>} announcementData - The announcement data.
 * @returns {Promise<void>}
 */
export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>): Promise<void> => {
  const { date, period } = announcementData;
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollection, docId);

  const text = announcementData.text ?? '';
  const subjectOverride = announcementData.subjectOverride || null; // Store null for empty override

  // If both text and subjectOverride are empty/null, delete the document
  if (!text && !subjectOverride) {
      await deleteDailyAnnouncement(date, period); // Reuse delete function (logs internally)
      return; // Exit early
  }

  const dataToSet: Omit<DailyAnnouncement, 'id'> = {
    date: date,
    period: period,
    subjectOverride: subjectOverride,
    text: text,
    updatedAt: Timestamp.now(),
  };

  let oldData: DailyAnnouncement | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        oldData = { ...oldDataSnap.data(), id: oldDataSnap.id } as DailyAnnouncement;
        // Ensure updatedAt is Date object if needed for comparison, though Timestamp.now() is used for setting
        // oldData.updatedAt = (oldData.updatedAt as Timestamp)?.toDate() ?? new Date();
    }

    const hasChanged = !oldData
        || oldData.text !== text
        || (oldData.subjectOverride ?? null) !== subjectOverride;

    if (hasChanged) {
        await setDoc(docRef, dataToSet); // Create or overwrite
        await logAction('upsert_announcement', {
            docId,
            date,
            period,
            oldText: oldData?.text ?? null,
            newText: text,
            oldSubjectOverride: oldData?.subjectOverride ?? null,
            newSubjectOverride: subjectOverride
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
                 oldSubjectOverride: oldData?.subjectOverride ?? null
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
      updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
    }) as DailyAnnouncement);
    callback(announcements);
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
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
            console.error("Firestore query for events requires an index on 'startDate'. Please create it.");
            throw new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません。作成してください。");
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
           console.error("Firestore query for events requires an index on 'startDate' for realtime updates. Please create it.");
            if (onError) {
                onError(new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません (realtime)。作成してください。"));
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
 * a daily announcement (text or subjectOverride).
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

        // Mapping from JS day index (0=Sun, 1=Mon...) to DayOfWeek enum ("月", "火"...)
        const dayMapping: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY,
            2: DayOfWeekEnum.TUESDAY,
            3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY,
            5: DayOfWeekEnum.FRIDAY,
            // Add Saturday/Sunday if they can be active days
            // 6: DayOfWeekEnum.SATURDAY,
            // 0: DayOfWeekEnum.SUNDAY,
        };

        // Iterate through the next N weeks (e.g., 3 weeks * 7 days)
        for (let i = 0; i < FUTURE_WEEKS_TO_APPLY * 7; i++) {
            const futureDate = addDays(today, i + 1); // Start from tomorrow
            const dateStr = format(futureDate, 'yyyy-MM-dd');
            const dayOfWeekJs = getDay(futureDate); // 0 for Sunday, 1 for Monday, etc.
            const dayOfWeekEnum = dayMapping[dayOfWeekJs];

            // Skip if it's not an active day according to settings
            if (!dayOfWeekEnum || !settings.activeDays.includes(dayOfWeekEnum)) {
                continue;
            }

            // Fetch existing announcements for this future date
            const existingAnnouncements = await getDailyAnnouncements(dateStr);
            const existingPeriods = new Set(existingAnnouncements.map(a => a.period));

            // Apply fixed slots for this day
            const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

            for (const fixedSlot of fixedSlotsForDay) {
                // Check if an announcement already exists for this period
                if (!existingPeriods.has(fixedSlot.period)) {
                    // No existing announcement, create a default one based on fixed slot
                    const docId = `${dateStr}_${fixedSlot.period}`;
                    const docRef = doc(dailyAnnouncementsCollection, docId);
                    const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = {
                        date: dateStr,
                        period: fixedSlot.period,
                        subjectOverride: fixedSlot.subject || null, // Apply fixed subject as override
                        text: '', // Default to empty text
                        updatedAt: Timestamp.now(), // Mark when it was auto-applied
                    };
                    batch.set(docRef, newAnnouncementData);
                    operationsCount++;
                    // console.log(`Applying fixed slot to ${docId}: ${fixedSlot.subject}`);
                } else {
                     // Optional: Check if existing announcement ONLY has text and NO subjectOverride
                     // If so, maybe update the subjectOverride based on fixed timetable? Decide based on desired behavior.
                     const existingAnn = existingAnnouncements.find(a => a.period === fixedSlot.period);
                     if (existingAnn && !existingAnn.text && (existingAnn.subjectOverride ?? null) !== (fixedSlot.subject || null)) {
                          // If existing announcement has NO text and subject differs, update it
                          const docId = `${dateStr}_${fixedSlot.period}`;
                          const docRef = doc(dailyAnnouncementsCollection, docId);
                          batch.update(docRef, { subjectOverride: fixedSlot.subject || null, updatedAt: Timestamp.now() });
                          operationsCount++;
                           // console.log(`Updating subjectOverride for ${docId} based on fixed slot: ${fixedSlot.subject}`);
                     }
                }
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Successfully applied/updated fixed timetable for ${operationsCount} future slots.`);
            await logAction('apply_fixed_timetable_future', { operationsCount, weeksApplied: FUTURE_WEEKS_TO_APPLY });
        } else {
            console.log("No future slots needed updating based on fixed timetable.");
        }

    } catch (error) {
        console.error("Error applying fixed timetable to future dates:", error);
        // Don't throw UI errors for this background task, just log it.
        await logAction('apply_fixed_timetable_future_error', { error: String(error) });
         if ((error as FirestoreError).code === 'unavailable') {
            console.warn("Client is offline. Cannot apply fixed timetable to future.");
            // Don't throw, this is a background task
        } else if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
             console.error("Firestore index required for applying fixed timetable to future. Check getDailyAnnouncements index requirements.");
             // Don't throw, log is sufficient
        }
        // Do not re-throw, as this is often a background process
    }
};


// --- Logging ---

/**
 * Logs an action performed by a user (or system).
 * Attempts to log even if offline, but might fail.
 * Replaces undefined values in details with null.
 * @param {string} actionType - Type of action (e.g., 'update_settings', 'add_announcement').
 * @param {object} details - Additional details about the action.
 * @param {string} [userId='anonymous'] - ID of the user performing the action.
 */
const logAction = async (actionType: string, details: object, userId: string = 'anonymous') => {
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
            console.error("Firestore query for logs requires an index on 'timestamp'. Please create it.");
            throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。作成してください。");
        }
       throw error;
    }
};

// --- React Query Integration Helper ---

export const queryFnGetTimetableSettings = () => getTimetableSettings();
export const queryFnGetFixedTimetable = () => getFixedTimetable();
export const queryFnGetDailyAnnouncements = (date: string) => () => getDailyAnnouncements(date);
export const queryFnGetSchoolEvents = () => getSchoolEvents();
