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
  /** Optional override for the subject ID for this specific slot/day. Null means no override. References /subjects collection. */
  subjectIdOverride?: string | null;
  /** The text content of the announcement (free text) */
  text: string;
  /** Timestamp of the last update */
  updatedAt: Date | Timestamp; // Allow both for easier handling before/after fetch
  /** Whether to show this announcement on the main calendar page */
  showOnCalendar?: boolean;
}

/**
 * Represents a general announcement for the entire day.
 * Stored in Firestore under /classes/{classId}/generalAnnouncements/{date}
 */
export interface DailyGeneralAnnouncement {
    /** Document ID, typically the date YYYY-MM-DD */
    id?: string;
    /** The date the announcement applies to (YYYY-MM-DD) */
    date: string;
    /** The content of the announcement in Markdown format */
    content: string;
    /** Timestamp of the last update */
    updatedAt: Date | Timestamp;
}
