/**
 * Represents a daily announcement for a specific time slot.
 * Stored in Firestore under /classes/{classId}/dailyAnnouncements/{date}/{period}
 */
export interface DailyAnnouncement {
  /** Unique identifier for the announcement (optional, could use date+period as key) */
  id?: string;
  /** The date of the announcement (e.g., "YYYY-MM-DD") */
  date: string;
  /** The period number this announcement applies to */
  period: number;
  /** The text content of the announcement */
  text: string;
  /** Timestamp of the last update */
  updatedAt: Date;
  /** Type of announcement (e.g., "持ち物", "テスト", "変更", "呼び出し", "その他") */
  type: AnnouncementType;
}

/**
 * Enum for different types of announcements.
 */
export enum AnnouncementType {
  BELONGINGS = "持ち物",
  TEST = "テスト",
  CHANGE = "変更",
  CALL = "呼び出し",
  EVENT = "行事", // Added for non-regular events
  OTHER = "その他",
}
