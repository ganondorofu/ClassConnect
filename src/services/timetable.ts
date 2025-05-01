/**
 * Represents a time slot in the timetable.
 */
export interface TimeSlot {
  /**
   * The day of the week (e.g., Monday, Tuesday).
   */
  day: string;
  /**
   * The time period of the slot (e.g., 1st period, 2nd period).
   */
  period: number;
}

/**
 * Represents customized timetable information, including the number of periods.
 */
export interface TimeTable {
  /**
   * The number of periods in a day.
   */
  numberOfPeriods: number;
}

/**
 * Asynchronously retrieves timetable information
 *
 * @returns A promise that resolves to a TimeTable object
 */
export async function getTimeTable(): Promise<TimeTable> {
  // TODO: Implement this by calling an API.

  return {
    numberOfPeriods: 6,
  };
}

/**
 * Asynchronously update timetable information
 *
 * @param timeTable The timeTable object to be updated
 * @returns A promise that resolves to a TimeTable object
 */
export async function updateTimeTable(timeTable: TimeTable): Promise<TimeTable> {
  // TODO: Implement this by calling an API.

  return {
    numberOfPeriods: timeTable.numberOfPeriods,
  };
}
