'use server';

import { 
    generateAndStoreAnnouncementSummary as generateSummaryInController,
    deleteAiSummary as deleteSummaryInController 
} from '@/controllers/timetableController';
import type { FirebaseError } from 'firebase/app';

export async function requestSummaryGeneration(date: string, userId: string): Promise<string | null> {
  if (!date) {
    console.error("requestSummaryGeneration called with no date.");
    return null;
  }
  try {
    const summary = await generateSummaryInController(date, userId);
    return summary;
  } catch (error) {
    console.error(`Error requesting summary generation for date ${date}:`, error);
    if ((error as FirebaseError).code === 'unavailable') {
        throw new Error("オフラインのため要約を生成できませんでした。");
    }
    throw error; 
  }
}

export async function requestSummaryDeletion(date: string, userId: string): Promise<void> {
  if (!date) {
    console.error("requestSummaryDeletion called with no date.");
    // Optionally throw an error or return a specific failure indicator
    return;
  }
  try {
    await deleteSummaryInController(date, userId);
  } catch (error) {
    console.error(`Error requesting summary deletion for date ${date}:`, error);
    if ((error as FirebaseError).code === 'unavailable') {
       throw new Error("オフラインのため要約を削除できませんでした。");
    }
    throw error;
  }
}
