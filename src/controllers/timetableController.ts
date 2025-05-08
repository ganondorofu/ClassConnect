
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
  limit,
  FirestoreError,
  runTransaction,
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
import { logAction } from '@/services/logService';

const CURRENT_CLASS_ID = 'defaultClass';
const FUTURE_DAYS_TO_APPLY = 60;

const settingsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'settings');
const fixedTimetableCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'fixedTimetable');
const dailyAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'dailyAnnouncements');
const generalAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'generalAnnouncements');
const eventsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'events');

const prepareStateForLog = (state: any): any => {
  if (state === undefined || state === null) return null;
  return JSON.parse(JSON.stringify(state, (key, value) =>
    value === undefined ? null : value
  ), (key, value) => {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    // Basic check for ISO date format
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
      return value; // Keep as ISO string
    }
    return value;
  });
};

export const getTimetableSettings = async (): Promise<TimetableSettings> => {
  const docRef = doc(settingsCollectionRef, 'timetable');
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0 ? data.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      return {
        numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
        activeDays: activeDays,
      } as TimetableSettings;
    } else {
      await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
      await logAction('initialize_settings', { before: null, after: DEFAULT_TIMETABLE_SETTINGS }, 'system_init_settings');
      return DEFAULT_TIMETABLE_SETTINGS;
    }
  } catch (error) {
    console.error("Error fetching timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') return DEFAULT_TIMETABLE_SETTINGS;
    throw error;
  }
};

export const updateTimetableSettings = async (settingsUpdates: Partial<TimetableSettings>, userId: string = 'system_update_settings'): Promise<void> => {
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
      const currentSettingsInTx = settingsDoc.exists() ? (settingsDoc.data() as TimetableSettings) : DEFAULT_TIMETABLE_SETTINGS;
      const currentActiveDays = currentSettingsInTx.activeDays && Array.isArray(currentSettingsInTx.activeDays) && currentSettingsInTx.activeDays.length > 0 ? currentSettingsInTx.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettings.activeDays && Array.isArray(newSettings.activeDays) && newSettings.activeDays.length > 0 ? newSettings.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      transaction.set(docRef, newSettings);

      const currentPeriods = currentSettingsInTx.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
      const newPeriodsValue = settingsUpdates.numberOfPeriods;

      if (newPeriodsValue !== undefined && newPeriodsValue !== currentPeriods) {
        fixedTimetableNeedsUpdate = true;
        const daysToUpdate = newActiveDays;
        if (newPeriodsValue > currentPeriods) {
          for (let day of daysToUpdate) {
            for (let period = currentPeriods + 1; period <= newPeriodsValue; period++) {
              const slotId = `${day}_${period}`;
              transaction.set(doc(fixedTimetableCollectionRef, slotId), { id: slotId, day, period, subjectId: null });
            }
          }
        } else {
          const q = query(fixedTimetableCollectionRef, where('period', '>', newPeriodsValue), where('day', 'in', daysToUpdate));
          const snapshot = await getDocs(q);
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      } else if (settingsUpdates.activeDays && JSON.stringify(newActiveDays.sort()) !== JSON.stringify(currentActiveDays.sort())) {
        fixedTimetableNeedsUpdate = true;
        const addedDays = newActiveDays.filter(d => !currentActiveDays.includes(d));
        const removedDays = currentActiveDays.filter(d => !newActiveDays.includes(d));
        const periodsToManage = newSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
        for (const day of addedDays) for (let period = 1; period <= periodsToManage; period++) transaction.set(doc(fixedTimetableCollectionRef, `${day}_${period}`), { id: `${day}_${period}`, day, period, subjectId: null });
        if (removedDays.length > 0) {
          const q = query(fixedTimetableCollectionRef, where('day', 'in', removedDays));
          const snapshot = await getDocs(q);
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      }
    });

    await logAction('update_settings', { before: currentSettings, after: newSettings }, userId);
    if (fixedTimetableNeedsUpdate) await applyFixedTimetableForFuture(userId);
  } catch (error) {
    console.error("Error updating timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため設定を更新できませんでした。");
    throw error;
  }
};

export const onTimetableSettingsUpdate = (callback: (settings: TimetableSettings) => void, onError?: (error: Error) => void): Unsubscribe => {
  const docRef = doc(settingsCollectionRef, 'timetable');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0 ? data.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      callback({ numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods, activeDays });
    } else {
      getTimetableSettings().then(callback).catch(err => onError ? onError(err) : console.error("Error re-fetching settings:", err));
    }
  }, (error) => { if (onError) onError(error); else console.error("Snapshot error on settings:", error); });
};

export const getFixedTimetable = async (): Promise<FixedTimeSlot[]> => {
  try {
    const snapshot = await getDocs(fixedTimetableCollectionRef);
    let slots = snapshot.docs.map(doc => ({ ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
    slots.sort((a, b) => AllDays.indexOf(a.day) - AllDays.indexOf(b.day) || a.period - b.period);
    return slots;
  } catch (error) {
    console.error("Error fetching fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore クエリに必要なインデックスがありません。");
    throw error;
  }
};

export const batchUpdateFixedTimetable = async (slots: FixedTimeSlot[], userId: string = 'system_batch_update_tt'): Promise<void> => {
  const batch = writeBatch(db);
  let changesMade = false;
  const existingSlotsMap: Map<string, FixedTimeSlot> = new Map((await getFixedTimetable()).map(slot => [slot.id, slot]));
  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  const afterStates: Array<{ id: string, subjectId: string | null }> = [];

  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) return;
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubjectId = slot.subjectId === undefined ? null : slot.subjectId;
    if (!existingSlot || (existingSlot.subjectId ?? null) !== newSubjectId) {
      batch.set(doc(fixedTimetableCollectionRef, slot.id), { ...slot, subjectId: newSubjectId });
      changesMade = true;
      beforeStates.push({ id: slot.id, subjectId: existingSlot?.subjectId ?? null });
      afterStates.push({ id: slot.id, subjectId: newSubjectId });
    }
  });

  if (!changesMade) return;
  try {
    await batch.commit();
    await logAction('batch_update_fixed_timetable', { before: beforeStates, after: afterStates, count: afterStates.length }, userId);
    await applyFixedTimetableForFuture(userId);
  } catch (error) {
    console.error("Error batch updating fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため固定時間割を一括更新できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("固定時間割データに無効な値が含まれていました。");
    throw error;
  }
};

export const resetFixedTimetable = async (userId: string = 'system_reset_tt'): Promise<void> => {
  const batch = writeBatch(db);
  let resetCount = 0;
  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  try {
    const snapshot = await getDocs(fixedTimetableCollectionRef);
    snapshot.forEach((docSnap) => {
      const slot = docSnap.data() as FixedTimeSlot;
      if ((slot.subjectId ?? null) !== null) {
        beforeStates.push({ id: docSnap.id, subjectId: slot.subjectId });
        batch.update(docSnap.ref, { subjectId: null });
        resetCount++;
      }
    });
    if (resetCount === 0) return;
    await batch.commit();
    await logAction('reset_fixed_timetable', { before: beforeStates, after: null, count: resetCount }, userId);
    await applyFixedTimetableForFuture(userId);
  } catch (error) {
    console.error("Error resetting fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため固定時間割を初期化できませんでした。");
    throw error;
  }
};

export const onFixedTimetableUpdate = (callback: (timetable: FixedTimeSlot[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  return onSnapshot(query(fixedTimetableCollectionRef), (snapshot) => {
    let timetable = snapshot.docs.map(doc => ({ ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
    timetable.sort((a, b) => AllDays.indexOf(a.day) - AllDays.indexOf(b.day) || a.period - b.period);
    callback(timetable);
  }, (error) => {
    console.error("Snapshot error on fixed timetable:", error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 固定時間割のリアルタイム更新に必要なインデックスがありません。"));
    else onError?.(error);
  });
};

export const getDailyAnnouncements = async (date: string): Promise<DailyAnnouncement[]> => {
  try {
    const q = query(dailyAnnouncementsCollectionRef, where('date', '==', date));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, subjectIdOverride: doc.data().subjectIdOverride === undefined ? null : doc.data().subjectIdOverride, updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyAnnouncement));
  } catch (error) {
    console.error(`Error fetching daily announcements for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error(`Firestore 連絡クエリ(日付: ${date})に必要なインデックス(date)がありません。`);
    throw error;
  }
};

export const upsertDailyAnnouncement = async (announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>, userId: string = 'system_upsert_announcement'): Promise<void> => {
  const { date, period } = announcementData;
  const docId = `${date}_${period}`;
  const docRef = doc(dailyAnnouncementsCollectionRef, docId);
  const text = announcementData.text ?? '';
  const subjectIdOverride = announcementData.subjectIdOverride === undefined ? null : announcementData.subjectIdOverride;
  let beforeState: DailyAnnouncement | null = null;

  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
      beforeState = { ...oldDataSnap.data(), id: oldDataSnap.id, updatedAt: (oldDataSnap.data().updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyAnnouncement;
      beforeState.subjectIdOverride = beforeState.subjectIdOverride === undefined ? null : beforeState.subjectIdOverride;
    }

    if (!text && subjectIdOverride === null) {
      if (beforeState) {
        await deleteDoc(docRef); // Delete if exists
        await logAction('delete_announcement', { before: prepareStateForLog(beforeState), after: null }, userId);
        await applyFixedTimetableForFuture(userId);
      }
      return;
    }

    const dataToSet: Omit<DailyAnnouncement, 'id'> = { date, period, subjectIdOverride, text, updatedAt: Timestamp.now() };
    const afterState = { ...dataToSet, id: docId, updatedAt: new Date() };
    const hasChanged = !beforeState || beforeState.text !== text || (beforeState.subjectIdOverride ?? null) !== (subjectIdOverride ?? null);

    if (hasChanged) {
      await setDoc(docRef, dataToSet);
      await logAction('upsert_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
      await applyFixedTimetableForFuture(userId);
    }
  } catch (error) {
    console.error("Error upserting daily announcement:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため連絡を保存できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("保存データに無効な値が含まれていました。");
    throw error;
  }
};

export const onDailyAnnouncementsUpdate = (date: string, callback: (announcements: DailyAnnouncement[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const q = query(dailyAnnouncementsCollectionRef, where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, subjectIdOverride: doc.data().subjectIdOverride === undefined ? null : doc.data().subjectIdOverride, updatedAt: (doc.data().updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyAnnouncement)));
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error(`Firestore 連絡のリアルタイム更新に必要なインデックス(date)がありません(日付:${date})。`));
    else onError?.(error);
  });
};

export const getDailyGeneralAnnouncement = async (date: string): Promise<DailyGeneralAnnouncement | null> => {
  const docRef = doc(generalAnnouncementsCollectionRef, date);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { id: docSnap.id, date: data.date, content: data.content ?? '', updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyGeneralAnnouncement;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching general announcement for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return null;
    throw error;
  }
};

export const upsertDailyGeneralAnnouncement = async (date: string, content: string, userId: string = 'system_upsert_general_annc'): Promise<void> => {
  const docRef = doc(generalAnnouncementsCollectionRef, date);
  const trimmedContent = content.trim();
  let beforeState: DailyGeneralAnnouncement | null = null;

  try {
    const oldSnap = await getDoc(docRef);
    if (oldSnap.exists()) beforeState = { id: date, ...oldSnap.data(), updatedAt: (oldSnap.data().updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyGeneralAnnouncement;

    if (!trimmedContent) {
      if (beforeState) {
        await deleteDoc(docRef);
        await logAction('delete_general_announcement', { before: prepareStateForLog(beforeState), after: null }, userId);
      }
      return;
    }
    const dataToSet: Omit<DailyGeneralAnnouncement, 'id'> = { date, content: trimmedContent, updatedAt: Timestamp.now() };
    const afterState = { id: date, ...dataToSet, updatedAt: new Date() };
    if (beforeState?.content !== trimmedContent) {
      await setDoc(docRef, dataToSet);
      await logAction('upsert_general_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
    }
  } catch (error) {
    console.error(`Error upserting general announcement for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのためお知らせを保存できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("保存データに無効な値が含まれていました。");
    throw error;
  }
};

export const onDailyGeneralAnnouncementUpdate = (date: string, callback: (announcement: DailyGeneralAnnouncement | null) => void, onError?: (error: Error) => void): Unsubscribe => {
  const docRef = doc(generalAnnouncementsCollectionRef, date);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      callback({ id: docSnap.id, date: data.date, content: data.content ?? '', updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date() } as DailyGeneralAnnouncement);
    } else {
      callback(null);
    }
  }, (error) => { if (onError) onError(error); else console.error(`Snapshot error on general announcement for ${date}:`, error); });
};

export const getSchoolEvents = async (): Promise<SchoolEvent[]> => {
  try {
    const q = query(eventsCollectionRef, orderBy('startDate'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent));
  } catch (error) {
    console.error("Error fetching school events:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません。");
    throw error;
  }
};

export const addSchoolEvent = async (eventData: Omit<SchoolEvent, 'id'>, userId: string = 'system_add_event'): Promise<string> => {
  const newDocRef = doc(eventsCollectionRef);
  const dataToSet = { title: eventData.title || '', startDate: eventData.startDate, endDate: eventData.endDate || eventData.startDate, description: eventData.description || '', createdAt: Timestamp.now() };
  try {
    await setDoc(newDocRef, dataToSet);
    const afterState = { id: newDocRef.id, ...dataToSet, createdAt: new Date() };
    await logAction('add_event', { before: null, after: prepareStateForLog(afterState) }, userId);
    return newDocRef.id;
  } catch (error) {
    console.error("Error adding school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を追加できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("行事データに無効な値が含まれていました。");
    throw error;
  }
};

export const updateSchoolEvent = async (eventData: SchoolEvent, userId: string = 'system_update_event'): Promise<void> => {
  if (!eventData.id) throw new Error("Event ID is required for updates.");
  const docRef = doc(eventsCollectionRef, eventData.id);
  const dataToUpdate = { title: eventData.title || '', startDate: eventData.startDate, endDate: eventData.endDate || eventData.startDate, description: eventData.description || '' };
  let beforeState: SchoolEvent | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) beforeState = { id: eventData.id, ...oldDataSnap.data() } as SchoolEvent;
    await setDoc(docRef, dataToUpdate, { merge: true });
    const afterSnap = await getDoc(docRef);
    const afterState = afterSnap.exists() ? { id: afterSnap.id, ...afterSnap.data() } as SchoolEvent : null;
    if (!beforeState || JSON.stringify(prepareStateForLog(beforeState)) !== JSON.stringify(prepareStateForLog(afterState))) {
      await logAction('update_event', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
    }
  } catch (error) {
    console.error("Error updating school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を更新できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("更新データに無効な値が含まれていました。");
    throw error;
  }
};

export const deleteSchoolEvent = async (eventId: string, userId: string = 'system_delete_event'): Promise<void> => {
  const docRef = doc(eventsCollectionRef, eventId);
  let beforeState: SchoolEvent | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
      beforeState = { id: eventId, ...oldDataSnap.data() } as SchoolEvent;
      await deleteDoc(docRef);
      await logAction('delete_event', { before: prepareStateForLog(beforeState), after: null }, userId);
    }
  } catch (error) {
    console.error("Error deleting school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を削除できませんでした。");
    throw error;
  }
};

export const onSchoolEventsUpdate = (callback: (events: SchoolEvent[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const q = query(eventsCollectionRef, orderBy('startDate'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent))),
    (error) => {
      console.error("Snapshot error on school events:", error);
      if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません (realtime)。"));
      else onError?.(error);
    });
};

export const applyFixedTimetableForFuture = async (userId: string = 'system_apply_future_tt'): Promise<void> => {
  let operationsCount = 0;
  let datesAffected: string[] = [];
  try {
    const settings = await getTimetableSettings();
    const fixedTimetable = await getFixedTimetable();
    if (!fixedTimetable || fixedTimetable.length === 0) return;
    const today = startOfDay(new Date());
    const batch = writeBatch(db);
    const dayMapping: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
    const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

    for (let i = 0; i < FUTURE_DAYS_TO_APPLY; i++) {
      const futureDate = addDays(today, i + 1);
      const dateStr = format(futureDate, 'yyyy-MM-dd');
      const dayOfWeekEnum = dayMapping[getDay(futureDate)];
      if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) continue;

      const existingAnnouncements = await getDailyAnnouncements(dateStr);
      const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
      let dateNeedsUpdate = false;
      const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

      for (const fixedSlot of fixedSlotsForDay) {
        if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) continue;
        const existingAnn = existingAnnouncementsMap.get(fixedSlot.period);
        const fixedSubjectIdOrNull = fixedSlot.subjectId ?? null;
        if (!existingAnn || (!existingAnn.text && (existingAnn.subjectIdOverride ?? null) === null)) {
          const docRef = doc(dailyAnnouncementsCollectionRef, `${dateStr}_${fixedSlot.period}`);
          const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = { date: dateStr, period: fixedSlot.period, subjectIdOverride: fixedSubjectIdOrNull, text: '', updatedAt: Timestamp.now() };
          if (!existingAnn) batch.set(docRef, newAnnouncementData);
          else if ((existingAnn.subjectIdOverride ?? null) !== fixedSubjectIdOrNull) batch.update(docRef, { subjectIdOverride: fixedSubjectIdOrNull, updatedAt: Timestamp.now() });
          else continue; // No change needed if empty announcement already matches fixed subject
          operationsCount++;
          dateNeedsUpdate = true;
        }
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction('apply_fixed_timetable_future', { meta: { operationsCount, daysAffected: datesAffected.length, daysApplied: FUTURE_DAYS_TO_APPLY } }, userId);
    }
  } catch (error) {
    console.error("Error applying fixed timetable to future dates:", error);
    await logAction('apply_fixed_timetable_future_error', { meta: { error: String(error) } }, userId);
    if ((error as FirestoreError).code === 'unavailable') console.warn("Client is offline. Cannot apply fixed timetable to future.");
    else if ((error as FirestoreError).code === 'failed-precondition') console.error("Firestore index required for applying fixed timetable to future.");
  }
};

export const resetFutureDailyAnnouncements = async (userId: string = 'system_reset_future_annc'): Promise<void> => {
  let operationsCount = 0;
  let datesAffected: string[] = [];
  const beforeStates: { [date: string]: (DailyAnnouncement | null)[] } = {};
  try {
    const settings = await getTimetableSettings();
    const fixedTimetable = await getFixedTimetable();
    const today = startOfDay(new Date());
    const batch = writeBatch(db);
    const dayMapping: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
    const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

    for (let i = 0; i < FUTURE_DAYS_TO_APPLY; i++) {
      const futureDate = addDays(today, i + 1);
      const dateStr = format(futureDate, 'yyyy-MM-dd');
      const dayOfWeekEnum = dayMapping[getDay(futureDate)];
      if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) continue;

      const existingAnnouncements = await getDailyAnnouncements(dateStr);
      const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
      let dateNeedsUpdate = false;
      beforeStates[dateStr] = [];
      const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

      for (let period = 1; period <= (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods); period++) {
        const docRef = doc(dailyAnnouncementsCollectionRef, `${dateStr}_${period}`);
        const fixedSlot = fixedSlotsForDay.find(fs => fs.period === period);
        beforeStates[dateStr].push(existingAnnouncementsMap.get(period) ? prepareStateForLog(existingAnnouncementsMap.get(period)) : null);
        const newAnnouncementData: Omit<DailyAnnouncement, 'id'> = { date: dateStr, period: period, subjectIdOverride: fixedSlot?.subjectId ?? null, text: '', updatedAt: Timestamp.now() };
        batch.set(docRef, newAnnouncementData);
        operationsCount++;
        dateNeedsUpdate = true;
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction('reset_future_daily_announcements', { meta: { operationsCount, daysAffected: datesAffected.length, daysApplied: FUTURE_DAYS_TO_APPLY } }, userId);
    }
  } catch (error) {
    console.error("Error resetting future daily announcements:", error);
    await logAction('reset_future_daily_announcements_error', { meta: { error: String(error) } }, userId);
    if ((error as FirestoreError).code === 'unavailable') console.warn("Client is offline. Cannot reset future daily announcements.");
    else if ((error as FirestoreError).code === 'failed-precondition') console.error("Firestore index required for resetting future daily announcements.");
  }
};

export const getLogs = async (limitCount: number = 100): Promise<any[]> => {
  const logsCollection = collection(db, 'classes', CURRENT_CLASS_ID, 'logs');
  try {
    const q = query(logsCollection, orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: (doc.data().timestamp as Timestamp)?.toDate() }));
  } catch (error) {
    console.error("Error fetching logs:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。");
    throw error;
  }
};

export const queryFnGetTimetableSettings = () => getTimetableSettings();
export const queryFnGetFixedTimetable = () => getFixedTimetable();
export const queryFnGetDailyAnnouncements = (date: string) => () => getDailyAnnouncements(date);
export const queryFnGetDailyGeneralAnnouncement = (date: string) => () => getDailyGeneralAnnouncement(date);
export const queryFnGetSchoolEvents = () => getSchoolEvents();
