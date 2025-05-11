/**
 * Represents a subject taught in the class.
 * Stored in Firestore under /classes/{classId}/subjects/{subjectId}
 */
export interface Subject {
  /** Unique identifier for the subject */
  id?: string;
  /** Name of the subject (e.g., "Mathematics", "English") */
  name: string;
  /** Name of the teacher responsible for the subject */
  teacherName: string | null;
}
