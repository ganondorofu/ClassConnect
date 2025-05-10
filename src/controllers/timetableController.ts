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
  addDoc, 
  updateDoc,
} from 'firebase/firestore';
import type {
  FixedTimeSlot,
  TimetableSettings,
  DayOfWeek,
  SchoolEvent,
} from '@/models/timetable';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import { DEFAULT_TIMETABLE_SETTINGS, ConfigurableWeekDays, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, AllDays, DisplayedWeekDaysOrder, dayCodeToDayOfWeekEnum } from '@/models/timetable'; // Combined imports
import { format, addDays, startOfDay, getDay, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { logAction } from '@/services/logService';
import { queryFnGetSubjects as getSubjectsFromSubjectController } from '@/controllers/subjectController';
import { summarizeAnnouncement } from '@/ai/flows/summarize-announcement-flow';


const CURRENT_CLASS_ID = 'defaultClass';
const FUTURE_DAYS_TO_APPLY = 60; // Approx 2 months

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
    if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
      try {
        return new Timestamp(value.seconds, value.nanoseconds).toDate().toISOString();
      } catch (e) {
        console.warn(`Could not convert object to ISOString, value: ${JSON.stringify(value)}`);
        return value; 
      }
    }
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
      return value;
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

  const newSettingsData: TimetableSettings = {
    numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
    activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
  };
  const docRef = doc(settingsCollectionRef, 'timetable');

  try {
    let fixedTimetableNeedsUpdate = false;
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      const currentSettingsInTx = settingsDoc.exists() ? (settingsDoc.data() as TimetableSettings) : DEFAULT_TIMETABLE_SETTINGS;
      const currentActiveDaysInTx = currentSettingsInTx.activeDays && Array.isArray(currentSettingsInTx.activeDays) && currentSettingsInTx.activeDays.length > 0 ? currentSettingsInTx.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettingsData.activeDays && Array.isArray(newSettingsData.activeDays) && newSettingsData.activeDays.length > 0 ? newSettingsData.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      transaction.set(docRef, newSettingsData);

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
          const snapshot = await getDocs(q); // Needs await
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      } else if (settingsUpdates.activeDays && JSON.stringify(newActiveDays.sort()) !== JSON.stringify(currentActiveDaysInTx.sort())) {
        fixedTimetableNeedsUpdate = true;
        const addedDays = newActiveDays.filter(d => !currentActiveDaysInTx.includes(d));
        const removedDays = currentActiveDaysInTx.filter(d => !newActiveDays.includes(d));
        const periodsToManage = newSettingsData.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
        for (const day of addedDays) for (let period = 1; period <= periodsToManage; period++) transaction.set(doc(fixedTimetableCollectionRef, `${day}_${period}`), { id: `${day}_${period}`, day, period, subjectId: null });
        if (removedDays.length > 0) {
          const q = query(fixedTimetableCollectionRef, where('day', 'in', removedDays));
          const snapshot = await getDocs(q); // Needs await
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      }
    });

    await logAction('update_settings', { before: prepareStateForLog(currentSettings), after: prepareStateForLog(newSettingsData) }, userId);
    if (fixedTimetableNeedsUpdate) await applyFixedTimetableForFuture(userId);
  } catch (error) {
    console.error("Error updating timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため設定を更新できませんでした。");
    throw error;
  }
};

export const onTimetableSettingsUpdate = (
  callback: (settings: TimetableSettings) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const docRef = doc(settingsCollectionRef, 'timetable');
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const activeDays =
          data.activeDays &&
          Array.isArray(data.activeDays) &&
          data.activeDays.length > 0
            ? data.activeDays
            : DEFAULT_TIMETABLE_SETTINGS.activeDays;
        callback({
          numberOfPeriods:
            data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays,
        });
      } else {
        callback(DEFAULT_TIMETABLE_SETTINGS);
      }
    },
    (error) => {
      if (onError) onError(error);
      else console.error('Snapshot error on settings:', error);
    }
  );
  return unsubscribe;
};

export const getFixedTimetable = async (): Promise<FixedTimeSlot[]> => {
  try {
    const snapshot = await getDocs(fixedTimetableCollectionRef);
    let slots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
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
  const existingSlotsData = await getFixedTimetable();
  const existingSlotsMap: Map<string, FixedTimeSlot> = new Map(existingSlotsData.map(slot => [slot.id, slot]))

  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  const afterStates: Array<{ id: string, subjectId: string | null }> = [];

  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) return;
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubjectId = slot.subjectId === undefined ? null : slot.subjectId;
    if (!existingSlot || (existingSlot.subjectId ?? null) !== newSubjectId) {
      batch.set(doc(fixedTimetableCollectionRef, slot.id), { ...slot, subjectId: newSubjectId, updatedAt: Timestamp.now() });
      changesMade = true;
      beforeStates.push({ id: slot.id, subjectId: existingSlot?.subjectId ?? null });
      afterStates.push({ id: slot.id, subjectId: newSubjectId });
    }
  });

  if (!changesMade) return;
  try {
    await batch.commit();
    await logAction('batch_update_fixed_timetable', { before: prepareStateForLog(beforeStates), after: prepareStateForLog(afterStates), count: afterStates.length }, userId);
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
        batch.update(docSnap.ref, { subjectId: null, updatedAt: Timestamp.now() });
        resetCount++;
      }
    });
    if (resetCount === 0) return;
    await batch.commit();
    await logAction('reset_fixed_timetable', { before: prepareStateForLog(beforeStates), after: null, count: resetCount }, userId);
    await applyFixedTimetableForFuture(userId);
  } catch (error) {
    console.error("Error resetting fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため固定時間割を初期化できませんでした。");
    throw error;
  }
};

export const onFixedTimetableUpdate = (callback: (timetable: FixedTimeSlot[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const unsubscribe = onSnapshot(query(fixedTimetableCollectionRef), (snapshot) => {
    let timetable = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
    timetable.sort((a, b) => AllDays.indexOf(a.day) - AllDays.indexOf(b.day) || a.period - b.period);
    callback(timetable);
  }, (error) => {
    console.error("Snapshot error on fixed timetable:", error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 固定時間割のリアルタイム更新に必要なインデックスがありません。"));
    else onError?.(error);
  });
  return unsubscribe;
};

export const getDailyAnnouncements = async (date: string): Promise<DailyAnnouncement[]> => {
  try {
    const q = query(dailyAnnouncementsCollectionRef, where('date', '==', date));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        subjectIdOverride: data.subjectIdOverride === undefined ? null : data.subjectIdOverride,
        showOnCalendar: data.showOnCalendar === undefined ? false : data.showOnCalendar,
        updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
        itemType: 'announcement',
      } as DailyAnnouncement;
    });
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
  const showOnCalendar = announcementData.showOnCalendar === undefined ? false : announcementData.showOnCalendar;
  let beforeState: DailyAnnouncement | null = null;

  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
      const oldData = oldDataSnap.data();
      beforeState = {
        id: oldDataSnap.id,
        ...oldData,
        subjectIdOverride: oldData.subjectIdOverride === undefined ? null : oldData.subjectIdOverride,
        showOnCalendar: oldData.showOnCalendar === undefined ? false : oldData.showOnCalendar,
        updatedAt: (oldData.updatedAt as Timestamp)?.toDate() ?? new Date(),
        itemType: 'announcement',
      } as DailyAnnouncement;
    }

    if (!text && subjectIdOverride === null && !showOnCalendar) {
      if (beforeState) {
        await deleteDoc(docRef);
        await logAction('delete_announcement', { before: prepareStateForLog(beforeState), after: null }, userId);
      }
      return;
    }

    const dataToSet: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = { date, period, subjectIdOverride, text, showOnCalendar, itemType: 'announcement' };
    const afterState: DailyAnnouncement = { ...dataToSet, id: docId, updatedAt: new Date() }; 

    const hasChanged = !beforeState ||
                       beforeState.text !== text ||
                       (beforeState.subjectIdOverride ?? null) !== (subjectIdOverride ?? null) ||
                       (beforeState.showOnCalendar ?? false) !== (showOnCalendar ?? false);

    if (hasChanged) {
      await setDoc(docRef, {...dataToSet, updatedAt: Timestamp.now()}); // Save with Firestore Timestamp
      await logAction('upsert_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
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
  const unsubscribe = onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            subjectIdOverride: data.subjectIdOverride === undefined ? null : data.subjectIdOverride,
            showOnCalendar: data.showOnCalendar === undefined ? false : data.showOnCalendar,
            updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
            itemType: 'announcement',
        } as DailyAnnouncement;
    }));
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error(`Firestore 連絡のリアルタイム更新に必要なインデックス(date)がありません(日付:${date})。`));
    else onError?.(error);
  });
  return unsubscribe;
};

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
        itemType: 'general',
        aiSummary: data.aiSummary ?? null,
        aiSummaryLastGeneratedAt: (data.aiSummaryLastGeneratedAt as Timestamp)?.toDate() ?? null,
      } as DailyGeneralAnnouncement;
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
    if (oldSnap.exists()) {
        beforeState = { 
            id: date, 
            ...oldSnap.data(), 
            updatedAt: (oldSnap.data().updatedAt as Timestamp)?.toDate() ?? new Date(), 
            itemType: 'general',
            aiSummary: oldSnap.data().aiSummary ?? null,
            aiSummaryLastGeneratedAt: (oldSnap.data().aiSummaryLastGeneratedAt as Timestamp)?.toDate() ?? null,
        } as DailyGeneralAnnouncement;
    }

    const dataToSet: Partial<DailyGeneralAnnouncement> = {
        date,
        content: trimmedContent,
        itemType: 'general',
        updatedAt: Timestamp.now()
    };
    
    let afterStateContent = { ...dataToSet, id: date, aiSummary: beforeState?.aiSummary, aiSummaryLastGeneratedAt: beforeState?.aiSummaryLastGeneratedAt };


    if (!trimmedContent) { // Content is being cleared
      if (beforeState) { // If it existed before
        dataToSet.aiSummary = null; 
        dataToSet.aiSummaryLastGeneratedAt = null;
        afterStateContent.aiSummary = null;
        afterStateContent.aiSummaryLastGeneratedAt = null;

        await setDoc(docRef, dataToSet, { merge: true }); // Still set content to null and update timestamp
        await logAction('delete_general_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterStateContent) }, userId);
      }
      return;
    }
    
    // If content changed, clear old summary, but keep it if admin is just editing and there's an existing summary.
    // This specific condition is to ensure if content changed, a new summary is needed.
    if (beforeState && beforeState.content !== trimmedContent) { 
        dataToSet.aiSummary = null;
        dataToSet.aiSummaryLastGeneratedAt = null;
        afterStateContent.aiSummary = null;
        afterStateContent.aiSummaryLastGeneratedAt = null;
    }
    
    if (!beforeState || beforeState.content !== trimmedContent || (beforeState.aiSummary && !dataToSet.aiSummary )) { // Log if content changed or summary was cleared
        await setDoc(docRef, dataToSet, { merge: true });
        await logAction('upsert_general_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterStateContent) }, userId);
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
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      callback({ 
        id: docSnap.id, 
        date: data.date, 
        content: data.content ?? '', 
        updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(), 
        itemType: 'general',
        aiSummary: data.aiSummary ?? null,
        aiSummaryLastGeneratedAt: (data.aiSummaryLastGeneratedAt as Timestamp)?.toDate() ?? null,
      } as DailyGeneralAnnouncement);
    } else {
      callback(null);
    }
  }, (error) => { if (onError) onError(error); else console.error(`Snapshot error on general announcement for ${date}:`, error); });
  return unsubscribe;
};

export const generateAndStoreAnnouncementSummary = async (date: string, userId: string = 'system_ai_summary'): Promise<string | null> => {
  const announcementRef = doc(generalAnnouncementsCollectionRef, date);
  try {
    const announcementSnap = await getDoc(announcementRef);
    if (!announcementSnap.exists() || !announcementSnap.data()?.content) {
      if (announcementSnap.exists() && announcementSnap.data()?.aiSummary) {
        // Content was removed, clear the summary too.
        await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
         await logAction('clear_ai_summary_no_content', { date }, userId);
      }
      console.log(`No content to summarize for announcement on ${date}.`);
      return null;
    }

    const announcementContent = announcementSnap.data()!.content;
    const summaryResult = await summarizeAnnouncement({ announcementText: announcementContent });

    if (summaryResult && summaryResult.summary) {
      await updateDoc(announcementRef, {
        aiSummary: summaryResult.summary,
        aiSummaryLastGeneratedAt: Timestamp.now(),
      });
      await logAction('generate_ai_summary', { date, summaryLength: summaryResult.summary.length }, userId);
      return summaryResult.summary;
    } else {
      await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
      await logAction('clear_ai_summary_empty_result', { date }, userId);
      throw new Error('AI summary generation returned no content.');
    }
  } catch (error) {
    console.error(`Error generating or storing AI summary for ${date}:`, error);
    try {
        const announcementSnap = await getDoc(announcementRef);
        if (announcementSnap.exists()) {
             // Ensure summary is cleared if generation failed
             await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
             await logAction('clear_ai_summary_on_error', { date, error: String(error) }, userId);
        }
    } catch (clearError) {
        console.error(`Failed to clear AI summary on error for ${date}:`, clearError);
    }
    throw error;
  }
};

export const deleteAiSummary = async (date: string, userId: string): Promise<void> => {
  const announcementRef = doc(generalAnnouncementsCollectionRef, date);
  try {
    const announcementSnap = await getDoc(announcementRef);
    if (!announcementSnap.exists() || !announcementSnap.data()?.aiSummary) {
      console.log(`No AI summary to delete for announcement on ${date}.`);
      return;
    }

    const oldSummary = announcementSnap.data()!.aiSummary;

    await updateDoc(announcementRef, {
      aiSummary: null,
      aiSummaryLastGeneratedAt: null,
    });

    await logAction('delete_ai_summary', {
      date,
      deletedSummaryPreview: oldSummary ? oldSummary.substring(0, 50) + '...' : 'N/A',
    }, userId);

  } catch (error) {
    console.error(`Error deleting AI summary for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのためAI要約を削除できませんでした。");
    }
    throw error;
  }
};


export const getSchoolEvents = async (): Promise<SchoolEvent[]> => {
  try {
    const q = query(eventsCollectionRef, orderBy('startDate'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            title: data.title,
            startDate: data.startDate,
            endDate: data.endDate,
            description: data.description,
            itemType: 'event', 
            createdAt: (data.createdAt as Timestamp)?.toDate(), 
            updatedAt: (data.updatedAt as Timestamp)?.toDate() 
        } as SchoolEvent;
    });
  } catch (error) {
    console.error("Error fetching school events:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません。");
    throw error;
  }
};

export const addSchoolEvent = async (eventData: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'> & { startDate: string; endDate?: string }, userId: string = 'system_add_event'): Promise<string> => {
  const dataToSet = {
    title: eventData.title || '',
    startDate: eventData.startDate, 
    endDate: eventData.endDate || eventData.startDate, 
    description: eventData.description || '',
    itemType: 'event' as const, 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now(),
  };
  try {
    const newDocRef = await addDoc(eventsCollectionRef, dataToSet);
    const afterState = { id: newDocRef.id, ...dataToSet, createdAt: dataToSet.createdAt.toDate(), updatedAt: dataToSet.updatedAt.toDate() }; 
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
  const dataToUpdate: Partial<SchoolEvent> = { 
    title: eventData.title || '', 
    startDate: eventData.startDate, 
    endDate: eventData.endDate || eventData.startDate, 
    description: eventData.description || '',
    itemType: 'event' as const, 
    updatedAt: Timestamp.now() 
  };

  let beforeState: SchoolEvent | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        const oldData = oldDataSnap.data();
        beforeState = { 
            id: eventData.id, 
            ...oldData,
            itemType: 'event' as const, 
            createdAt: (oldData.createdAt as Timestamp)?.toDate() ?? undefined, 
            updatedAt: (oldData.updatedAt as Timestamp)?.toDate() ?? undefined 
        } as SchoolEvent;
    }
    
    const cleanDataToUpdate = { ...dataToUpdate };
    delete (cleanDataToUpdate as any).id; 
    
    await setDoc(docRef, cleanDataToUpdate, { merge: true });
    
    const afterSnap = await getDoc(docRef);
    let afterState: SchoolEvent | null = null;
    if (afterSnap.exists()) {
        const newData = afterSnap.data();
        afterState = { 
            id: afterSnap.id, 
            ...newData, 
            itemType: 'event' as const,
            createdAt: (newData.createdAt as Timestamp)?.toDate() ?? undefined,
            updatedAt: (newData.updatedAt as Timestamp)?.toDate() ?? undefined
        } as SchoolEvent;
    }

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
      const oldData = oldDataSnap.data();
      beforeState = { 
          id: eventId, 
          ...oldData, 
          itemType: 'event' as const,
          createdAt: (oldData.createdAt as Timestamp)?.toDate() ?? undefined,
          updatedAt: (oldData.updatedAt as Timestamp)?.toDate() ?? undefined
      } as SchoolEvent;
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
  const unsubscribe = onSnapshot(q, (snapshot) => callback(snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return { 
      id: docSnap.id,
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
      description: data.description,
      itemType: 'event' as const, 
      createdAt:(data.createdAt as Timestamp)?.toDate(),
      updatedAt:(data.updatedAt as Timestamp)?.toDate()
    } as SchoolEvent;
  })),
    (error) => {
      console.error("Snapshot error on school events:", error);
      if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません (realtime)。"));
      else onError?.(error);
    });
    return unsubscribe;
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
      const futureDate = addDays(today, i); 
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
        
        if (!existingAnn || (!existingAnn.text && (existingAnn.subjectIdOverride ?? null) === null && !existingAnn.showOnCalendar)) {
          const docRef = doc(dailyAnnouncementsCollectionRef, `${dateStr}_${fixedSlot.period}`);
          const newAnnouncementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = { date: dateStr, period: fixedSlot.period, subjectIdOverride: fixedSubjectIdOrNull, text: '', showOnCalendar: false, itemType: 'announcement' };
          
          if (!existingAnn || (existingAnn.subjectIdOverride ?? null) !== fixedSubjectIdOrNull) {
            batch.set(docRef, {...newAnnouncementData, updatedAt: Timestamp.now()}); 
            operationsCount++;
            dateNeedsUpdate = true;
          }
        }
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction('apply_fixed_timetable_future', { meta: { operationsCount, daysAffected: datesAffected.length, daysAppliedRange: FUTURE_DAYS_TO_APPLY } }, userId);
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
      const futureDate = addDays(today, i); 
      const dateStr = format(futureDate, 'yyyy-MM-dd');
      const dayOfWeekEnum = dayMapping[getDay(futureDate)];
      if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) continue;

      const existingAnnouncements = await getDailyAnnouncements(dateStr);
      const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
      let dateNeedsUpdate = false;
      beforeStates[dateStr] = [];
      const fixedSlotsForDay = fixedTimetable.filter(fs => fs.day === dayOfWeekEnum);

      for (let period = 1; period <= (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods); period++) {
        const docRef = doc(dailyAnnouncementsCollectionRef, `${dateStr}_${period}`);
        const fixedSlot = fixedSlotsForDay.find(fs => fs.period === period);
        const existingAnnForLog = existingAnnouncementsMap.get(period);
        if (existingAnnForLog) beforeStates[dateStr].push(prepareStateForLog(existingAnnForLog)); else beforeStates[dateStr].push(null);
        
        const newAnnouncementData: Omit<DailyAnnouncement, 'id'|'updatedAt'> = { date: dateStr, period: period, subjectIdOverride: fixedSlot?.subjectId ?? null, text: '', showOnCalendar: false, itemType: 'announcement' };
        
        const existingDoc = existingAnnouncementsMap.get(period);
        if (existingDoc && 
            ( (existingDoc.text !== '') || 
              ((existingDoc.subjectIdOverride ?? null) !== (fixedSlot?.subjectId ?? null)) ||
              (existingDoc.showOnCalendar !== false)
            )
           ) {
            batch.set(docRef, {...newAnnouncementData, updatedAt: Timestamp.now()});
            operationsCount++;
            dateNeedsUpdate = true;
        } else if (!existingDoc && fixedSlot?.subjectId !== null) { 
             batch.set(docRef, {...newAnnouncementData, updatedAt: Timestamp.now()});
             operationsCount++;
             dateNeedsUpdate = true;
        }
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction('reset_future_daily_announcements', { meta: { operationsCount, daysAffected: datesAffected.length, daysAppliedRange: FUTURE_DAYS_TO_APPLY }, before: prepareStateForLog(beforeStates) }, userId);
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
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data(), timestamp: (docSnap.data().timestamp as Timestamp)?.toDate() }));
  } catch (error) {
    console.error("Error fetching logs:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。");
    throw error;
  }
};

type CalendarItemUnion = (SchoolEvent & { itemType: 'event' }) | (DailyAnnouncement & { itemType: 'announcement' });

export const getCalendarDisplayableItemsForMonth = async (year: number, month: number): Promise<CalendarItemUnion[]> => {
  const monthStartDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  const monthEndDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  const items: CalendarItemUnion[] = [];

  try {
    // Fetch School Events
    const eventsQuery = query(
      eventsCollectionRef,
      where('startDate', '<=', monthEndDate),
      orderBy('startDate')
    );
    const eventsSnapshot = await getDocs(eventsQuery);
    eventsSnapshot.forEach(docSnap => {
      const eventData = docSnap.data();
      const event: SchoolEvent = { 
        id: docSnap.id, 
        title: eventData.title,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        description: eventData.description,
        itemType: 'event', 
        createdAt: (eventData.createdAt as Timestamp)?.toDate(),
        updatedAt: (eventData.updatedAt as Timestamp)?.toDate(),
      };
      if ((event.endDate ?? event.startDate) >= monthStartDate) {
        items.push(event);
      }
    });

    // Fetch Daily Announcements marked for calendar
    const announcementsQuery = query(
      dailyAnnouncementsCollectionRef,
      where('date', '>=', monthStartDate),
      where('date', '<=', monthEndDate),
      where('showOnCalendar', '==', true),
      orderBy('date'),
      // orderBy('period') // Consider client-side sort for period if composite index becomes an issue
    );
    const announcementsSnapshot = await getDocs(announcementsQuery);
    announcementsSnapshot.forEach(docSnap => {
      const annData = docSnap.data();
      const announcementItem: DailyAnnouncement = {
        id: docSnap.id,
        date: annData.date,
        period: annData.period,
        subjectIdOverride: annData.subjectIdOverride ?? null,
        text: annData.text ?? '',
        showOnCalendar: annData.showOnCalendar ?? false, // Should be true due to query
        updatedAt: (annData.updatedAt as Timestamp)?.toDate() ?? new Date(),
        itemType: 'announcement',
      };
      items.push(announcementItem);
    });
    
    items.sort((a, b) => {
        const dateA = new Date(a.itemType === 'event' ? (a as SchoolEvent).startDate : (a as DailyAnnouncement).date);
        const dateB = new Date(b.itemType === 'event' ? (b as SchoolEvent).startDate : (b as DailyAnnouncement).date);
        
        const timeA = dateA.getTime();
        const timeB = dateB.getTime();

        if (timeA !== timeB) {
            return timeA - timeB;
        }
        // If on the same day, sort by period for announcements, events could be considered "all day" or come first
        if (a.itemType === 'announcement' && b.itemType === 'announcement') {
            return (a as DailyAnnouncement).period - (b as DailyAnnouncement).period;
        }
        if (a.itemType === 'event' && b.itemType === 'announcement') return -1; // Events first
        if (a.itemType === 'announcement' && b.itemType === 'event') return 1;  // Announcements after
        return 0;
    });
    return items;

  } catch (error) {
    console.error(`Error fetching calendar items for ${year}-${month}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') {
      console.error("Firestore query requires an index. Check Firebase console. Error:", (error as FirestoreError).message);
      throw new Error(`Firestore クエリに必要なインデックスがありません。Firebaseコンソールを確認してください。`);
    }
    throw error;
  }
};


export const queryFnGetTimetableSettings = () => getTimetableSettings();
export const queryFnGetFixedTimetable = () => getFixedTimetable();
export const queryFnGetDailyAnnouncements = (date: string) => () => getDailyAnnouncements(date);
export const queryFnGetDailyGeneralAnnouncement = (date: string) => () => getDailyGeneralAnnouncement(date);
export const queryFnGetSchoolEvents = () => getSchoolEvents();
export const queryFnGetCalendarDisplayableItemsForMonth = (year: number, month: number) => () => getCalendarDisplayableItemsForMonth(year, month);
export const queryFnGetSubjects = () => getSubjectsFromSubjectController();
