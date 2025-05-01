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
} from 'firebase/firestore';
import type {
  FixedTimeSlot,
  TimetableSettings,
  DayOfWeek,
  SchoolEvent,
} from '@/models/timetable';
import type { DailyAnnouncement, AnnouncementType } from '@/models/announcement';
import { DEFAULT_TIMETABLE_SETTINGS } from '@/models/timetable';

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
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as TimetableSettings;
  } else {
    // Initialize with default settings if not found
    await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
    await logAction('initialize_settings', { settings: DEFAULT_TIMETABLE_SETTINGS });
    return DEFAULT_TIMETABLE_SETTINGS;
  }
};

/**
 * Updates the timetable settings for the current class.
 * Handles adding/removing fixed timetable slots if numberOfPeriods changes.
 * @param {Partial<TimetableSettings>} settingsUpdates - The partial settings to update.
 * @returns {Promise<void>}
 */
export const updateTimetableSettings = async (settingsUpdates: Partial<TimetableSettings>): Promise<void> => {
  const currentSettings = await getTimetableSettings();
  const newSettings = { ...currentSettings, ...settingsUpdates };
  const docRef = doc(settingsCollection, 'timetable');

  const batch = writeBatch(db);
  batch.set(docRef, newSettings); // Update settings document

  // Adjust fixed timetable if numberOfPeriods changed
  if (settingsUpdates.numberOfPeriods !== undefined && settingsUpdates.numberOfPeriods !== currentSettings.numberOfPeriods) {
    const oldPeriods = currentSettings.numberOfPeriods;
    const newPeriods = settingsUpdates.numberOfPeriods;

    if (newPeriods > oldPeriods) {
      // Add new empty slots
      for (let day of newSettings.activeDays) {
        for (let period = oldPeriods + 1; period <= newPeriods; period++) {
          const slotId = `${day}_${period}`;
          const newSlotRef = doc(fixedTimetableCollection, slotId);
          const defaultSlot: FixedTimeSlot = { id: slotId, day, period, subject: '', room: '' };
          batch.set(newSlotRef, defaultSlot);
        }
      }
    } else {
      // Remove excess slots
      const q = query(fixedTimetableCollection, where('period', '>', newPeriods));
      const snapshot = await getDocs(q);
      snapshot.forEach((doc) => batch.delete(doc.ref));

       // Also remove corresponding future daily announcements (optional, consider implications)
       // Example: Query and delete dailyAnnouncements where period > newPeriods
    }
  }

  await batch.commit(); // Commit all changes atomically
  await logAction('update_settings', { oldSettings: currentSettings, newSettings });
};

/**
 * Subscribes to real-time updates for timetable settings.
 * @param {(settings: TimetableSettings) => void} callback - Function to call with updated settings.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onTimetableSettingsUpdate = (callback: (settings: TimetableSettings) => void): Unsubscribe => {
  const docRef = doc(settingsCollection, 'timetable');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as TimetableSettings);
    } else {
      // Handle case where settings might be deleted, potentially reset to default
       getTimetableSettings().then(callback); // Re-fetch or initialize
    }
  });
};


// --- Fixed Timetable ---

/**
 * Fetches the entire fixed timetable for the current class.
 * @returns {Promise<FixedTimeSlot[]>} Array of fixed time slots.
 */
export const getFixedTimetable = async (): Promise<FixedTimeSlot[]> => {
  const snapshot = await getDocs(fixedTimetableCollection);
  return snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
};

/**
 * Updates a specific fixed time slot.
 * @param {FixedTimeSlot} slotData - The updated slot data.
 * @returns {Promise<void>}
 */
export const updateFixedTimeSlot = async (slotData: FixedTimeSlot): Promise<void> => {
    if (!slotData.id) throw new Error("Slot ID is required for updates.");
    const docRef = doc(fixedTimetableCollection, slotData.id);
    const oldDataSnap = await getDoc(docRef);
    const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;
    await setDoc(docRef, slotData, { merge: true }); // Use merge to avoid overwriting other fields if any
    await logAction('update_fixed_slot', { slotId: slotData.id, oldData, newData: slotData });
};

/**
 * Subscribes to real-time updates for the fixed timetable.
 * @param {(timetable: FixedTimeSlot[]) => void} callback - Function to call with the updated timetable.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onFixedTimetableUpdate = (callback: (timetable: FixedTimeSlot[]) => void): Unsubscribe => {
  return onSnapshot(fixedTimetableCollection, (snapshot) => {
    const timetable = snapshot.docs.map(doc => doc.data() as FixedTimeSlot);
    callback(timetable);
  });
};

// --- Daily Announcements ---

/**
 * Fetches daily announcements for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @returns {Promise<DailyAnnouncement[]>} Array of announcements for the given date.
 */
export const getDailyAnnouncements = async (date: string): Promise<DailyAnnouncement[]> => {
  const q = query(dailyAnnouncementsCollection, where('date', '==', date));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      // Ensure updatedAt is a Date object
      updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
    }) as DailyAnnouncement);
};

/**
 * Creates or updates a daily announcement for a specific date and period.
 * Overwrites existing announcement for that slot on that day.
 * @param {Omit<DailyAnnouncement, 'id' | 'updatedAt'>} announcementData - The announcement data.
 * @returns {Promise<void>}
 */
export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>): Promise<void> => {
  const { date, period } = announcementData;
  // Use date and period to create a predictable document ID
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollection, docId);

  const dataToSet: Omit<DailyAnnouncement, 'id'> = {
    ...announcementData,
    updatedAt: new Date(), // Set update timestamp
  };

  const oldDataSnap = await getDoc(docRef);
  const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;

  await setDoc(docRef, dataToSet);
  await logAction('upsert_announcement', { docId, oldData, newData: dataToSet });
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
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        await deleteDoc(docRef);
        await logAction('delete_announcement', { docId, oldData: oldDataSnap.data() });
    }
};


/**
 * Subscribes to real-time updates for daily announcements for a specific date.
 * @param {string} date - The date in "YYYY-MM-DD" format.
 * @param {(announcements: DailyAnnouncement[]) => void} callback - Function to call with updated announcements.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onDailyAnnouncementsUpdate = (date: string, callback: (announcements: DailyAnnouncement[]) => void): Unsubscribe => {
  const q = query(dailyAnnouncementsCollection, where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date(),
    }) as DailyAnnouncement);
    callback(announcements);
  });
};

// --- School Events ---

/**
 * Fetches all non-regular school events.
 * @returns {Promise<SchoolEvent[]>} Array of school events.
 */
export const getSchoolEvents = async (): Promise<SchoolEvent[]> => {
    // Optionally order by start date
    const q = query(eventsCollection, orderBy('startDate'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
};

/**
 * Adds a new school event.
 * @param {Omit<SchoolEvent, 'id'>} eventData - The event data.
 * @returns {Promise<string>} The ID of the newly created event.
 */
export const addSchoolEvent = async (eventData: Omit<SchoolEvent, 'id'>): Promise<string> => {
    const newDocRef = doc(collection(db, 'classes', CURRENT_CLASS_ID, 'events')); // Auto-generate ID
    const dataToSet = { ...eventData, createdAt: Timestamp.now() }; // Add creation timestamp
    await setDoc(newDocRef, dataToSet);
    await logAction('add_event', { eventId: newDocRef.id, eventData: dataToSet });
    return newDocRef.id;
};

/**
 * Updates an existing school event.
 * @param {SchoolEvent} eventData - The updated event data (must include id).
 * @returns {Promise<void>}
 */
export const updateSchoolEvent = async (eventData: SchoolEvent): Promise<void> => {
    if (!eventData.id) throw new Error("Event ID is required for updates.");
    const docRef = doc(eventsCollection, eventData.id);
    const oldDataSnap = await getDoc(docRef);
    const oldData = oldDataSnap.exists() ? oldDataSnap.data() : null;
    await setDoc(docRef, eventData, { merge: true });
    await logAction('update_event', { eventId: eventData.id, oldData, newData: eventData });
};

/**
 * Deletes a school event.
 * @param {string} eventId - The ID of the event to delete.
 * @returns {Promise<void>}
 */
export const deleteSchoolEvent = async (eventId: string): Promise<void> => {
    const docRef = doc(eventsCollection, eventId);
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        await deleteDoc(docRef);
        await logAction('delete_event', { eventId, oldData: oldDataSnap.data() });
    }
};

/**
 * Subscribes to real-time updates for school events.
 * @param {(events: SchoolEvent[]) => void} callback - Function to call with the updated events list.
 * @returns {Unsubscribe} Function to unsubscribe from updates.
 */
export const onSchoolEventsUpdate = (callback: (events: SchoolEvent[]) => void): Unsubscribe => {
    const q = query(eventsCollection, orderBy('startDate'));
    return onSnapshot(q, (snapshot) => {
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
        callback(events);
    });
};


// --- Logging ---

/**
 * Logs an action performed by a user (or system).
 * @param {string} actionType - Type of action (e.g., 'update_settings', 'add_announcement').
 * @param {object} details - Additional details about the action.
 * @param {string} [userId='anonymous'] - ID of the user performing the action.
 */
const logAction = async (actionType: string, details: object, userId: string = 'anonymous') => {
  // Basic logging - In a real app, expand this with more structured data, user info, etc.
  // Consider using a dedicated logging service or more robust Firestore structure.
  try {
    const logEntry = {
      action: actionType,
      timestamp: Timestamp.now(),
      userId: userId, // Placeholder for future authentication
      details: details, // Store relevant data changes
    };
    const newLogRef = doc(logsCollection); // Auto-generate ID
    await setDoc(newLogRef, logEntry);
  } catch (error) {
    console.error("Failed to log action:", error);
    // Handle logging failure (e.g., retry, alert)
  }
};

/**
 * Fetches recent logs.
 * @param {number} limitCount - Maximum number of logs to retrieve.
 * @returns {Promise<any[]>} Array of log entries.
 */
export const getLogs = async (limitCount: number = 50): Promise<any[]> => {
    const q = query(logsCollection, orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp)?.toDate(), // Convert Timestamp
    }));
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
