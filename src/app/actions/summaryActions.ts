'use server';

import { generateAndStoreAnnouncementSummary as generateSummaryInController } from '@/controllers/timetableController';
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
    // Optionally, re-throw a more client-friendly error or return a specific error indicator
    // For now, returning null and logging the error.
     if ((error as FirebaseError).code === 'unavailable') {
        throw new Error("オフラインのため要約を生成できませんでした。");
     }
    throw error; // Re-throw to be handled by client toast
  }
}
