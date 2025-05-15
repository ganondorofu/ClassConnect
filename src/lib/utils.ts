import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { TimetableSettings } from '@/models/timetable'; // Added import
import type { DailyAnnouncement } from "@/models/announcement"; // Added import

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper function to compare TimetableSettings objects
export const areSettingsEqual = (s1: TimetableSettings | null, s2: TimetableSettings | null): boolean => {
  if (!s1 && !s2) return true;
  if (!s1 || !s2) return false;
  if (s1.numberOfPeriods !== s2.numberOfPeriods) return false;
  if (s1.activeDays.length !== s2.activeDays.length) return false;
  const sortedS1Days = [...s1.activeDays].sort();
  const sortedS2Days = [...s2.activeDays].sort();
  return sortedS1Days.every((day, index) => day === sortedS2Days[index]);
};

// Helper function to compare arrays of objects, ignoring specified keys like timestamps
export const areArraysOfObjectsEqual = <T extends Record<string, any>>(
  arr1: T[] | undefined,
  arr2: T[] | undefined,
  ignoreKeys: string[] = ['updatedAt', 'createdAt', 'aiSummaryLastGeneratedAt']
): boolean => {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;

  try {
    const normalize = (item: T) => {
      const newItem = { ...item };
      ignoreKeys.forEach(key => delete (newItem as any)[key]);
      // Specifically handle nested objects like DailyAnnouncement's subjectIdOverride
      if (newItem.subjectIdOverride === undefined) {
        newItem.subjectIdOverride = null;
      }
      if (newItem.showOnCalendar === undefined) {
        newItem.showOnCalendar = false;
      }
      if (newItem.isManuallyCleared === undefined) {
        newItem.isManuallyCleared = false;
      }
      if (newItem.text === undefined) {
        newItem.text = '';
      }
      return newItem;
    };

    // Create a consistent sorting key, e.g., 'id' or a combination of fields
    const getSortKey = (item: T) => {
      if (item.id) return item.id;
      if (item.date && item.period) return `${item.date}_${item.period}`; // For DailyAnnouncement
      if (item.day && item.period) return `${item.day}_${item.period}`; // For FixedTimeSlot
      return JSON.stringify(item); // Fallback, less reliable for complex objects
    };

    const sortedNormalizedArr1 = arr1.map(normalize).sort((a, b) => (getSortKey(a) ?? '').localeCompare(getSortKey(b) ?? ''));
    const sortedNormalizedArr2 = arr2.map(normalize).sort((a, b) => (getSortKey(a) ?? '').localeCompare(getSortKey(b) ?? ''));
    
    return JSON.stringify(sortedNormalizedArr1) === JSON.stringify(sortedNormalizedArr2);
  } catch (e) {
    console.error("Error stringifying arrays for comparison:", e, arr1, arr2);
    // Fallback to reference equality or simple length check if stringify fails
    return arr1 === arr2; 
  }
};

export const areDailyAnnouncementsMapEqual = (
  map1: Record<string, DailyAnnouncement[]>,
  map2: Record<string, DailyAnnouncement[]>,
  ignoreKeys: string[] = ['updatedAt', 'createdAt', 'aiSummaryLastGeneratedAt']
): boolean => {
  const keys1 = Object.keys(map1);
  const keys2 = Object.keys(map2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!map2.hasOwnProperty(key) || !areArraysOfObjectsEqual(map1[key], map2[key], ignoreKeys)) {
      return false;
    }
  }
  return true;
};
