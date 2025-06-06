export interface FeatureFlags {
  assignments: boolean;
  inquiries: boolean;
  aiSummary: boolean;
  timetable: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  assignments: true,
  inquiries: true,
  aiSummary: true,
  timetable: true,
};
