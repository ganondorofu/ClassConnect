// src/services/aiSummarizationService.ts
import { db } from '@/config/firebase';
import {
  doc,
  getDoc,
  Timestamp,
  updateDoc,
  FirestoreError,
} from 'firebase/firestore';
import type { DailyGeneralAnnouncement } from '@/models/announcement';
import { logAction } from '@/services/logService';
import { summarizeAnnouncement } from '@/ai/flows/summarize-announcement-flow';

const CURRENT_CLASS_ID = 'defaultClass';
const generalAnnouncementsCollectionRef = collection(db, 'classes', CURRENT_CLASS_ID, 'generalAnnouncements');


export const generateAndStoreAnnouncementSummary = async (date: string, userId: string = 'system_ai_summary'): Promise<string | null> => {
  const announcementRef = doc(generalAnnouncementsCollectionRef, date);
  try {
    const announcementSnap = await getDoc(announcementRef);
    if (!announcementSnap.exists() || !announcementSnap.data()?.content) {
      if (announcementSnap.exists() && announcementSnap.data()?.aiSummary) {
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
