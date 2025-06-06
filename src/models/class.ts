import type { Timestamp } from 'firebase/firestore';

export interface ClassInfo {
  id: string;
  name: string;
  code: string;
  createdAt: Timestamp;
}
