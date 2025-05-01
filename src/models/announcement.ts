
import type { Timestamp } from 'firebase/firestore';

/**
 * Represents a daily announcement or note for a specific time slot.
 * Stored in Firestore under /classes/{classId}/dailyAnnouncements/{date}_{period}
 */
export interface DailyAnnouncement {
  /** Unique identifier for the announcement (document ID is typically {date}_{period}) */
  id?: string;
  /** The date of the announcement (e.g., "YYYY-MM-DD") */
  date: string;
  /** The period number this announcement applies to */
  period: number;
  /** Optional override for the subject name for this specific slot/day. Null or empty string means no override. */
  subjectOverride?: string | null;
  /** The text content of the announcement (free text) */
  text: string;
  /** Timestamp of the last update */
  updatedAt: Date | Timestamp; // Allow both for easier handling before/after fetch
}

// Removed AnnouncementType enum and related logic
