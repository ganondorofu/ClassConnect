
import type { Timestamp } from 'firebase/firestore';

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
  /** ID of the subject assigned to this slot (references /subjects collection). `null` means "None/Empty", `undefined` means "Unset". */
  subjectId: string | null | undefined;
  /** Optional room number or location */
  room?: string;
  /** Timestamp of the last update for this specific fixed slot */
  updatedAt?: Timestamp | Date;
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
  /** Timestamp of when the event was created */
  createdAt?: Timestamp | Date;
  /** Timestamp of the last update to the event */
  updatedAt?: Timestamp | Date;
  /** Property to help differentiate in combined lists */
  itemType: 'event'; 
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

// Helper array for default active configuration
export const ConfigurableWeekDays = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

// Order for display purposes (Monday to Sunday)
export const DisplayedWeekDaysOrder = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];


// All possible days, used for mapping getDay() which is 0 for Sunday
export const AllDays = [
    DayOfWeek.SUNDAY, // Index 0
    DayOfWeek.MONDAY, // Index 1
    DayOfWeek.TUESDAY, // Index 2
    DayOfWeek.WEDNESDAY, // Index 3
    DayOfWeek.THURSDAY, // Index 4
    DayOfWeek.FRIDAY, // Index 5
    DayOfWeek.SATURDAY, // Index 6
];

// Function to get Japanese day name
export function getDayOfWeekName(day: DayOfWeek): string {
    return day; // Already in Japanese
}

// Default settings
export const DEFAULT_TIMETABLE_SETTINGS: TimetableSettings = {
  numberOfPeriods: 7,
  activeDays: [...ConfigurableWeekDays, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY], 
};

// Helper to map date-fns getDay() (0=Sun, 1=Mon, ...) to DayOfWeek enum string
export const dayCodeToDayOfWeekEnum = (dayCode: number): DayOfWeek => {
    const mapping: Record<number, DayOfWeek> = {
        0: DayOfWeek.SUNDAY,
        1: DayOfWeek.MONDAY,
        2: DayOfWeek.TUESDAY,
        3: DayOfWeek.WEDNESDAY,
        4: DayOfWeek.THURSDAY,
        5: DayOfWeek.FRIDAY,
        6: DayOfWeek.SATURDAY,
    };
    return mapping[dayCode];
};
