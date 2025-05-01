/**
 * Represents a single subject slot in the fixed timetable.
 * Stored in Firestore under /classes/{classId}/fixedTimetable/{day}_{period}
 */
export interface FixedTimeSlot {
  /** Unique identifier (e.g., "Monday_1") */
  id: string;
  /** Day of the week (e.g., "Monday", "Tuesday") */
  day: DayOfWeek;
  /** Period number (1-based index) */
  period: number;
  /** ID of the subject assigned to this slot (references /subjects collection) */
  subjectId: string | null; // Use null if no subject is assigned
  /** Optional room number or location */
  room?: string;
}

/**
 * Represents the overall timetable settings for a class.
 * Stored in Firestore under /classes/{classId}/settings/timetable
 */
export interface TimetableSettings {
  /** The total number of periods per day */
  numberOfPeriods: number;
  /** The days of the week included in the timetable (usually Monday-Friday) */
  activeDays: DayOfWeek[];
}

/**
 * Represents non-regular events like school trips or festivals.
 * Stored in Firestore under /classes/{classId}/events/{eventId}
 */
export interface SchoolEvent {
  /** Unique identifier for the event */
  id?: string;
  /** Title or name of the event (e.g., "修学旅行", "体育祭") */
  title: string;
  /** Start date of the event (e.g., "YYYY-MM-DD") */
  startDate: string;
  /** End date of the event (optional, defaults to startDate if single day) */
  endDate?: string;
  /** Optional description or details */
  description?: string;
}


/**
 * Enum for days of the week.
 */
export enum DayOfWeek {
  MONDAY = "月",
  TUESDAY = "火",
  WEDNESDAY = "水",
  THURSDAY = "木",
  FRIDAY = "金",
  SATURDAY = "土",
  SUNDAY = "日",
}

// Helper array for iteration
export const WeekDays = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

export const AllDays = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
];

// Function to get Japanese day name
export function getDayOfWeekName(day: DayOfWeek): string {
    return day; // Already in Japanese
}

// Default settings
export const DEFAULT_TIMETABLE_SETTINGS: TimetableSettings = {
  numberOfPeriods: 7, // Changed default to 7 based on the image
  activeDays: WeekDays,
};
