// src/lib/logUtils.ts
import { Timestamp } from 'firebase/firestore';

/**
 * Helper to prepare state for logging (converts timestamps to ISO strings)
 * Also ensures undefined values are replaced with null
 */
export const prepareStateForLog = (state: any): any => {
  if (state === undefined || state === null) return null;
  // Recursively process arrays
  if (Array.isArray(state)) {
    return state.map(item => prepareStateForLog(item));
  }
  // Recursively process objects
  if (typeof state === 'object' && state !== null && !(state instanceof Timestamp) && !(state instanceof Date)) {
    const newObj: Record<string, any> = {};
    for (const key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        newObj[key] = prepareStateForLog(state[key]);
      }
    }
    return newObj;
  }

  if (state instanceof Timestamp) return state.toDate().toISOString();
  if (state instanceof Date) return state.toISOString();
  // Ensure undefined is converted to null, as it was previously handled at the start.
  // This specific check for 'undefined' after other type checks might be redundant if the initial check covers it.
  // However, keeping it ensures that if 'undefined' somehow passes through, it's handled.
  if (state === undefined) return null;

  return state;
};
