
import type { Timestamp } from 'firebase/firestore';

export const AssignmentDuePeriods = [
  "朝ST+1", "1限", "2限", "3限", "4限", "5限", "6限", "7限"
] as const;

export type AssignmentDuePeriod = typeof AssignmentDuePeriods[number];

export interface Assignment {
  id?: string;
  title: string;
  description: string;
  subjectId: string | null; // null for "Other" or general school tasks
  customSubjectName?: string | null; // Used if subjectId is null and it's a non-curriculum task
  dueDate: string; // YYYY-MM-DD format
  duePeriod?: AssignmentDuePeriod | null;
  submissionMethod?: string | null;
  targetAudience?: string | null;
  // isCompleted: boolean; // Removed
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  itemType: 'assignment'; // For differentiating in combined lists like calendar
}

export interface GetAssignmentsFilters {
  searchTerm?: string | null;
  subjectId?: string | null; // null for "Other" or general school tasks, undefined for all
  dueDateStart?: string | null;
  dueDateEnd?: string | null;
  duePeriod?: AssignmentDuePeriod | null;
  includePastDue?: boolean | null; // New filter, null or false means don't include past due
}

export interface GetAssignmentsSort {
  field: 'title' | 'subjectId' | 'dueDate' | 'createdAt';
  direction: 'asc' | 'desc';
}
