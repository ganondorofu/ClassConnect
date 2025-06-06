import { db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FeatureFlags } from '@/models/features';
import { DEFAULT_FEATURE_FLAGS } from '@/models/features';
import { getCurrentClassId } from '@/lib/classUtils';

const getFeaturesDocRef = (classId: string) =>
  doc(db, 'classes', classId, 'settings', 'features');

export const getFeatures = async (classId: string = getCurrentClassId()): Promise<FeatureFlags> => {
  const docRef = getFeaturesDocRef(classId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data() as FeatureFlags;
  }
  await setDoc(docRef, DEFAULT_FEATURE_FLAGS);
  return DEFAULT_FEATURE_FLAGS;
};

export const updateFeatures = async (
  updates: Partial<FeatureFlags>,
  userId: string,
  classId: string = getCurrentClassId(),
): Promise<void> => {
  const docRef = getFeaturesDocRef(classId);
  await setDoc(docRef, updates, { merge: true });
};

export const queryFnGetFeatures = () => getFeatures();
