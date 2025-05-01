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
  /** The text content of the announcement (free text) */
  text: string;
  /** Timestamp of the last update */
  updatedAt: Date;
}
