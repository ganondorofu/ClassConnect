
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
import type { DailyAnnouncement } from '@/models/announcement'; // Updated import
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays } from '@/models/timetable';

/**
 * Placeholder for the current class ID.
 * In a real app, this would come from user context or routing.
 */
const CURRENT_CLASS_ID = 'defaultClass'; // Replace with dynamic class ID logic

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
    // Check if it's an offline error
    if ((error as FirestoreError).code === 'unavailable') {
       console.warn("Client is offline. Returning default settings.");
       // Consider returning cached data if available, otherwise default
       return DEFAULT_TIMETABLE_SETTINGS; // Or throw a specific offline error
    }
    throw error; // Re-throw other errors
  }
};

/**
 * Updates the timetable settings for the current class.
 * Handles adding/removing fixed timetable slots if numberOfPeriods changes.
 * @param {Partial<TimetableSettings>} settingsUpdates - The partial settings to update.
 * @returns {Promise<void>}
 */
export const updateTimetableSettings = async (settingsUpdates: Partial<TimetableSettings>): Promise<void> => {
  // Fetch current settings even if offline might return defaults, which is acceptable for comparison
  let currentSettings: TimetableSettings;
  try {
      currentSettings = await getTimetableSettings();
  } catch (fetchError) {
      // If fetching fails drastically (not just offline defaults), rethrow
      console.error("Critical error fetching current settings before update:", fetchError);
      throw fetchError;
  }

  const newSettings: TimetableSettings = {
      numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods,
      activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays,
  };
  const docRef = doc(settingsCollection, 'timetable');

  try {
    // Use a transaction for atomicity
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      // Use fetched settings within transaction if needed for consistency check,
      const currentSettingsInTx = settingsDoc.exists() ? (settingsDoc.data() as TimetableSettings) : DEFAULT_TIMETABLE_SETTINGS;

       // Ensure activeDays are always arrays
      const currentActiveDays = currentSettingsInTx.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;

      transaction.set(docRef, newSettings); // Update settings document

      // Adjust fixed timetable if numberOfPeriods changed
      if (settingsUpdates.numberOfPeriods !== undefined && settingsUpdates.numberOfPeriods !== currentSettingsInTx.numberOfPeriods) {
        const oldPeriods = currentSettingsInTx.numberOfPeriods;
        const newPeriods = settingsUpdates.numberOfPeriods;
        const daysToUpdate = newActiveDays;

        if (newPeriods > oldPeriods) {
          // Add new empty slots
          for (let day of daysToUpdate) {
            for (let period = oldPeriods + 1; period <= newPeriods; period++) {
              const slotId = `${day}_${period}`;
              const newSlotRef = doc(fixedTimetableCollection, slotId);
              const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subject: '' }; // Removed room
              transaction.set(newSlotRef, defaultSlot);
            }
          }
        } else {
          // Remove excess slots - Query outside transaction, delete inside
          const q = query(fixedTimetableCollection, where('period', '>', newPeriods));
          const snapshot = await getDocs(q); // This requires network
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));

          // Also remove corresponding future daily announcements (optional, consider implications)
          // Example: Query and delete dailyAnnouncements where period > newPeriods
          // This might be complex and better handled separately or via user confirmation
        }
      } else if (settingsUpdates.activeDays) {
          // Handle changes in activeDays (add/remove rows for entire days)
          const addedDays = newActiveDays.filter(d => !currentActiveDays.includes(d));
          const removedDays = currentActiveDays.filter(d => !newActiveDays.includes(d));

          // Add slots for newly activated days
          for (const day of addedDays) {
              for (let period = 1; period <= newSettings.numberOfPeriods; period++) {
                  const slotId = `${day}_${period}`;
                  const newSlotRef = doc(fixedTimetableCollection, slotId);
                  const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subject: '' };
                  transaction.set(newSlotRef, defaultSlot);
              }
          }

          // Remove slots for deactivated days
           // Query outside transaction, delete inside
           if (removedDays.length > 0) {
              const q = query(fixedTimetableCollection, where('day', 'in', removedDays));
              const snapshot = await getDocs(q); // Requires network
              snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
           }
      }
    });

    await logAction('update_settings', { oldSettings: currentSettings, newSettings });

  } catch (error) {
    console.error("Error updating timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') {
       throw new Error("オフラインのため設定を更新できませんでした。");
    }
    throw error; // Re-throw other errors
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
      // Ensure activeDays is always present
      const settings: TimetableSettings = {
          numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays: data.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
      };
      callback(settings);
    } else {
      // Handle case where settings might be deleted, potentially reset to default
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
      // No longer sorting here as index is not guaranteed for multi-field sorts without explicit index
      const snapshot = await getDocs(fixedTimetableCollection);
      // Sort manually after fetching
      const slots = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
       slots.sort((a, b) => {
           const dayOrder = WeekDays.indexOf(a.day) - WeekDays.indexOf(b.day);
           if (dayOrder !== 0) return dayOrder;
           return a.period - b.period;
       });
       return slots;
   } catch (error) {
      console.error("Error fetching fixed timetable:", error);
      if ((error as FirestoreError).code === 'unavailable') {
          console.warn("Client is offline. Returning empty fixed timetable.");
          // Consider returning cached data if available
          return []; // Or throw a specific offline error
      }
       // Check for index error specifically
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query requires an index. Please create the index in the Firebase console using the link provided in the error message.");
            // Optionally, re-throw a more specific error or handle it gracefully
            throw new Error("Firestore クエリに必要なインデックスがありません。Firebaseコンソールのエラーメッセージ内のリンクを使用して作成してください。");
        }
      throw error;
   }
};

/**
 * Updates a specific fixed time slot. Use for saving changes from settings page.
 * @param {FixedTimeSlot} slotData - The updated slot data (must include id, day, period).
 * @returns {Promise<void>}
 */
export const updateFixedTimeSlot = async (slotData: FixedTimeSlot): Promise<void> => {
    if (!slotData.id) throw new Error("Slot ID is required for updates.");
    if (!slotData.day || !slotData.period) throw new Error("Day and Period are required.");
    const docRef = doc(fixedTimetableCollection, slotData.id);
    try {
        const oldDataSnap = await getDoc(docRef); // Might fail offline
        const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;
        // Explicitly set fields to ensure structure
        const dataToSet: FixedTimeSlot = {
            id: slotData.id,
            day: slotData.day,
            period: slotData.period,
            subject: slotData.subject || '', // Ensure subject is always a string
            // room: slotData.room || '', // Ensure room is always a string if needed
        };
        await setDoc(docRef, dataToSet); // Overwrite with new data, ensures clean structure
        // Log only if data actually changed
        if (JSON.stringify(oldData) !== JSON.stringify(dataToSet)) {
             await logAction('update_fixed_slot', { slotId: slotData.id, oldSubject: oldData?.subject, newSubject: dataToSet.subject });
        }
    } catch (error) {
        console.error("Error updating fixed time slot:", error);
        if ((error as FirestoreError).code === 'unavailable') {
           throw new Error("オフラインのため固定時間割を更新できませんでした。");
        }
        throw error;
    }
};

/**
 * Updates multiple fixed timetable slots in a batch.
 * Ideal for saving all changes from the settings page at once.
 * @param {FixedTimeSlot[]} slots - Array of slots to update.
 * @returns {Promise<void>}
 */
export const batchUpdateFixedTimetable = async (slots: FixedTimeSlot[]): Promise<void> => {
  const batch = writeBatch(db);
  let changesMade = false;

  // Fetch existing data to compare (requires network)
  let existingSlotsMap: Map<string, FixedTimeSlot> = new Map();
  try {
      const currentTimetable = await getFixedTimetable();
      currentTimetable.forEach(slot => existingSlotsMap.set(slot.id, slot));
  } catch (error) {
      if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため現在の時間割を取得できず、保存できませんでした。");
      }
      // Handle index error from getFixedTimetable
       if (error instanceof Error && error.message.includes("Firestore クエリに必要なインデックスがありません")) {
           throw error; // Rethrow the specific index error
       }
      throw error; // Rethrow other fetch errors
  }


  slots.forEach(slot => {
    if (!slot.id) {
      console.warn("Skipping slot update due to missing ID:", slot);
      return; // Skip if ID is missing
    }
    const docRef = doc(fixedTimetableCollection, slot.id);
    const existingSlot = existingSlotsMap.get(slot.id);

     // Only add to batch if the subject has changed
    if (!existingSlot || existingSlot.subject !== (slot.subject || '')) {
        const dataToSet: FixedTimeSlot = {
            id: slot.id,
            day: slot.day,
            period: slot.period,
            subject: slot.subject || '',
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
    // No longer sorting here to avoid index requirement on snapshot listener
    const q = query(fixedTimetableCollection);
    return onSnapshot(q, (snapshot) => {
         // Sort manually after receiving snapshot
        const timetable = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
        timetable.sort((a, b) => {
            const dayOrder = WeekDays.indexOf(a.day) - WeekDays.indexOf(b.day);
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
          // Ensure updatedAt is a Date object
          updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
        }) as DailyAnnouncement);
    } catch (error) {
        console.error(`Error fetching daily announcements for ${date}:`, error);
        if ((error as FirestoreError).code === 'unavailable') {
            console.warn(`Client is offline. Returning empty announcements for ${date}.`);
            // Consider returning cached data if available
            return []; // Or throw a specific offline error
        }
        throw error;
    }
};

/**
 * Creates or updates a daily announcement/note for a specific date and period.
 * Overwrites existing announcement for that slot on that day.
 * @param {Omit<DailyAnnouncement, 'id' | 'updatedAt'>} announcementData - The announcement data (date, period, text, optional subjectOverride).
 * @returns {Promise<void>}
 */
export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>): Promise<void> => {
  const { date, period } = announcementData;
  // Use date and period to create a predictable document ID
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollection, docId);

  // Ensure text is defined, default to empty string if not
  const text = announcementData.text ?? '';
  // Handle subjectOverride, ensuring it's either a string or null (instead of undefined)
  const subjectOverride = announcementData.subjectOverride || null;


  const dataToSet: Omit<DailyAnnouncement, 'id'> = {
    date: announcementData.date,
    period: announcementData.period,
    subjectOverride: subjectOverride, // Include subjectOverride (now null if empty)
    text: text, // Use sanitized text
    updatedAt: Timestamp.now(), // Use server timestamp for consistency
  };

  try {
    const oldDataSnap = await getDoc(docRef); // Might fail offline
    const oldData = oldDataSnap.exists() ? oldDataSnap.data() as DailyAnnouncement : null;

    // Only log if data actually changed (text or subjectOverride)
    const hasChanged = !oldData || oldData.text !== text || (oldData.subjectOverride ?? null) !== subjectOverride;

    await setDoc(docRef, dataToSet); // This will create or overwrite

    if (hasChanged) {
         await logAction('upsert_announcement', {
            docId,
            oldText: oldData?.text,
            newText: text,
            oldSubjectOverride: oldData?.subjectOverride ?? null, // Log null instead of undefined
            newSubjectOverride: subjectOverride // Log null instead of undefined
        });
    }

  } catch (error) {
     console.error("Error upserting daily announcement:", error);
     if ((error as FirestoreError).code === 'unavailable') {
        throw new Error("オフラインのため連絡を保存できませんでした。");
     }
      // Check for invalid data error (likely due to undefined)
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
          console.error("Firestore Error: Attempted to save 'undefined'. Check data structure.", dataToSet);
          throw new Error("保存データに無効な値(undefined)が含まれていました。");
     }
     throw error;
  }
};

/**
 * Deletes a daily announcement for a specific date and period.
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
                 oldText: oldData.text,
                 oldSubjectOverride: oldData.subjectOverride ?? null // Log null instead of undefined
            });
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
        // Optionally order by start date
        const q = query(eventsCollection, orderBy('startDate'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
    } catch (error) {
       console.error("Error fetching school events:", error);
       if ((error as FirestoreError).code === 'unavailable') {
           console.warn("Client is offline. Returning empty school events.");
           // Consider returning cached data if available
           return []; // Or throw a specific offline error
       }
       // Check for index error
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
    const dataToSet = { ...eventData, createdAt: Timestamp.now() }; // Add creation timestamp
    try {
        await setDoc(newDocRef, dataToSet);
        await logAction('add_event', { eventId: newDocRef.id, title: eventData.title, startDate: eventData.startDate });
        return newDocRef.id;
    } catch (error) {
       console.error("Error adding school event:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため行事を追加できませんでした。");
       }
       // Check for invalid data error (likely due to undefined)
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
    // Ensure no undefined values are being sent
    const dataToUpdate = JSON.parse(JSON.stringify(eventData, (key, value) =>
        value === undefined ? null : value
    ));
    delete dataToUpdate.id; // Don't overwrite ID in the document data itself

    try {
        const oldDataSnap = await getDoc(docRef); // Might fail offline
        const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;
        await setDoc(docRef, dataToUpdate, { merge: true }); // Use merge to update fields

         // Log only if data actually changed
        // Compare cleaned objects (null instead of undefined)
         const oldDataCleaned = oldData ? JSON.parse(JSON.stringify(oldData, (key, value) => value === undefined ? null : value)) : null;

        if (JSON.stringify(oldDataCleaned) !== JSON.stringify(dataToUpdate)) {
            await logAction('update_event', { eventId: eventData.id, oldTitle: oldData?.title, newTitle: eventData.title });
        }
    } catch (error) {
       console.error("Error updating school event:", error);
       if ((error as FirestoreError).code === 'unavailable') {
          throw new Error("オフラインのため行事を更新できませんでした。");
       }
       // Check for invalid data error (likely due to undefined)
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
            await deleteDoc(docRef);
            await logAction('delete_event', { eventId, oldTitle: oldDataSnap.data()?.title });
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
  // Basic logging - In a real app, expand this with more structured data, user info, etc.
  // Recursively replace undefined with null in the details object
  const cleanDetails = JSON.parse(JSON.stringify(details, (key, value) =>
      value === undefined ? null : value
  ));

  try {
    const logEntry = {
      action: actionType,
      timestamp: Timestamp.now(), // Firestore handles offline timestamping
      userId: userId, // Placeholder for future authentication
      details: cleanDetails, // Store cleaned data
    };
    const newLogRef = doc(logsCollection); // Auto-generate ID
    await setDoc(newLogRef, logEntry);
  } catch (error) {
    // Don't throw error here, logging is best-effort, but log the logging failure itself
    console.error(`Failed to log action '${actionType}' (might be offline):`, error);
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
        console.error("Firestore Logging Error: Attempted to save 'undefined' in log details.", logEntry);
        // Don't throw, but maybe send to a different logging service if critical
    }
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
           // Consider returning cached data if available
           return []; // Or throw a specific offline error
       }
        // Check for index error
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query for logs requires an index on 'timestamp'. Please create it.");
            throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。作成してください。");
        }
       throw error;
    }
};

// --- React Query Integration Helper ---
// It's often useful to wrap Firestore calls for use with libraries like React Query

// Example: Wrap getTimetableSettings for React Query
export const queryFnGetTimetableSettings = () => getTimetableSettings();

// Example: Wrap getFixedTimetable for React Query
export const queryFnGetFixedTimetable = () => getFixedTimetable();

// Example: Wrap getDailyAnnouncements for React Query
export const queryFnGetDailyAnnouncements = (date: string) => () => getDailyAnnouncements(date);

// Example: Wrap getSchoolEvents for React Query
export const queryFnGetSchoolEvents = () => getSchoolEvents();

    