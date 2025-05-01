// src/lib/seedData.ts
import { addSubject } from '@/controllers/subjectController';
import { batchUpdateFixedTimetable, getFixedTimetable } from '@/controllers/timetableController';
import { Subject } from '@/models/subject';
import { FixedTimeSlot, DayOfWeek } from '@/models/timetable';

const seedSubjectsData: Omit<Subject, 'id'>[] = [
  { name: '電気回路', teacherName: '田中先生' }, // Placeholder teacher names
  { name: '実習A', teacherName: '佐藤先生' },
  { name: '体育', teacherName: '鈴木先生' },
  { name: '化学基礎', teacherName: '高橋先生' },
  { name: '公共', teacherName: '伊藤先生' },
  { name: '家庭基礎', teacherName: '渡辺先生' },
  { name: '数II', teacherName: '山本先生' },
  { name: 'ソフトウェア技術', teacherName: '中村先生' },
  { name: '英コミュII', teacherName: '小林先生' },
  { name: '現代の国語', teacherName: '加藤先生' },
  { name: '電子回路', teacherName: '吉田先生' },
  { name: '実習B', teacherName: '山田先生' },
  { name: '保健', teacherName: '佐々木先生' },
  { name: '化学基礎', teacherName: '高橋先生' }, // Already added, Firestore won't duplicate based on name
  { name: 'プログラミング技術', teacherName: '山口先生' },
  { name: 'HR', teacherName: '担任' },
];

export const seedSubjects = async (): Promise<Subject[]> => {
  console.log('Seeding subjects...');
  const addedSubjects: Subject[] = [];
  try {
    for (const subjectData of seedSubjectsData) {
      // Basic check to avoid adding exact duplicates (name & teacher) if run multiple times
      // A more robust check would query Firestore first.
      const existing = addedSubjects.find(s => s.name === subjectData.name && s.teacherName === subjectData.teacherName);
      if (!existing) {
          const subjectId = await addSubject(subjectData.name, subjectData.teacherName);
          addedSubjects.push({ id: subjectId, ...subjectData });
      }
    }
    console.log(`Seeded ${addedSubjects.length} subjects.`);
    return addedSubjects;
  } catch (error) {
    console.error('Error seeding subjects:', error);
    return []; // Return empty array on error
  }
};


export const seedFixedTimetable = async (subjects: Subject[]) => {
  console.log('Seeding fixed timetable...');

  // Create a map for easy subject lookup by name
  const subjectMap = new Map(subjects.map(s => [s.name, s.id]));

  const getSubjectId = (name: string): string | null => {
    return subjectMap.get(name) ?? null; // Return null if subject not found
  };

  const fixedTimetableData: Omit<FixedTimeSlot, 'id'>[] = [
    // Monday
    { day: DayOfWeek.MONDAY, period: 1, subjectId: getSubjectId('電気回路') },
    { day: DayOfWeek.MONDAY, period: 2, subjectId: getSubjectId('体育') },
    { day: DayOfWeek.MONDAY, period: 3, subjectId: getSubjectId('ソフトウェア技術') },
    { day: DayOfWeek.MONDAY, period: 4, subjectId: getSubjectId('現代の国語') },
    { day: DayOfWeek.MONDAY, period: 5, subjectId: getSubjectId('英コミュII') },
    { day: DayOfWeek.MONDAY, period: 6, subjectId: getSubjectId('電子回路') },
    { day: DayOfWeek.MONDAY, period: 7, subjectId: getSubjectId('プログラミング技術') },
    // Tuesday
    { day: DayOfWeek.TUESDAY, period: 1, subjectId: getSubjectId('実習A') },
    { day: DayOfWeek.TUESDAY, period: 2, subjectId: null }, // Empty slot
    { day: DayOfWeek.TUESDAY, period: 3, subjectId: null }, // Empty slot
    { day: DayOfWeek.TUESDAY, period: 4, subjectId: getSubjectId('数II') },
    { day: DayOfWeek.TUESDAY, period: 5, subjectId: getSubjectId('保健') },
    { day: DayOfWeek.TUESDAY, period: 6, subjectId: getSubjectId('化学基礎') },
    { day: DayOfWeek.TUESDAY, period: 7, subjectId: null }, // Empty slot
    // Wednesday
    { day: DayOfWeek.WEDNESDAY, period: 1, subjectId: getSubjectId('体育') },
    { day: DayOfWeek.WEDNESDAY, period: 2, subjectId: getSubjectId('家庭基礎') },
    { day: DayOfWeek.WEDNESDAY, period: 3, subjectId: getSubjectId('英コミュII') },
    { day: DayOfWeek.WEDNESDAY, period: 4, subjectId: getSubjectId('数II') },
    { day: DayOfWeek.WEDNESDAY, period: 5, subjectId: getSubjectId('現代の国語') },
    { day: DayOfWeek.WEDNESDAY, period: 6, subjectId: getSubjectId('プログラミング技術') },
    { day: DayOfWeek.WEDNESDAY, period: 7, subjectId: getSubjectId('電気回路') },
    // Thursday
    { day: DayOfWeek.THURSDAY, period: 1, subjectId: getSubjectId('化学基礎') },
    { day: DayOfWeek.THURSDAY, period: 2, subjectId: getSubjectId('家庭基礎') },
    { day: DayOfWeek.THURSDAY, period: 3, subjectId: getSubjectId('ソフトウェア技術') },
    { day: DayOfWeek.THURSDAY, period: 4, subjectId: getSubjectId('電子回路') },
    { day: DayOfWeek.THURSDAY, period: 5, subjectId: getSubjectId('公共') },
    { day: DayOfWeek.THURSDAY, period: 6, subjectId: getSubjectId('HR') },
    { day: DayOfWeek.THURSDAY, period: 7, subjectId: null }, // Empty slot
    // Friday
    { day: DayOfWeek.FRIDAY, period: 1, subjectId: getSubjectId('公共') },
    { day: DayOfWeek.FRIDAY, period: 2, subjectId: getSubjectId('数II') },
    { day: DayOfWeek.FRIDAY, period: 3, subjectId: getSubjectId('英コミュII') },
    { day: DayOfWeek.FRIDAY, period: 4, subjectId: getSubjectId('実習B') },
    { day: DayOfWeek.FRIDAY, period: 5, subjectId: null }, // Empty slot
    { day: DayOfWeek.FRIDAY, period: 6, subjectId: null }, // Empty slot
    { day: DayOfWeek.FRIDAY, period: 7, subjectId: null }, // Empty slot
  ];

  // Generate IDs for the slots
   const slotsWithIds: FixedTimeSlot[] = fixedTimetableData.map(slot => ({
       ...slot,
       id: `${slot.day}_${slot.period}`,
   }));


  try {
    // Fetch existing timetable to potentially avoid overwriting user changes if run multiple times
    // For a true seed, we might skip this and just overwrite.
    // const existingTimetable = await getFixedTimetable();
    // if (existingTimetable && existingTimetable.length > 0) {
    //   console.log("Fixed timetable already exists, skipping seed.");
    //   return;
    // }

    await batchUpdateFixedTimetable(slotsWithIds);
    console.log('Seeded fixed timetable data.');
  } catch (error) {
    console.error('Error seeding fixed timetable:', error);
  }
};

// Function to run all seed operations
export const runSeedData = async () => {
    console.log("Starting data seeding...");
    const subjects = await seedSubjects();
    if (subjects.length > 0) {
        await seedFixedTimetable(subjects);
    } else {
        console.warn("Subject seeding failed or returned no subjects, skipping fixed timetable seed.");
    }
    console.log("Data seeding finished.");
};

// Optional: Add a way to trigger this, e.g., a button in dev mode or a script
// Example: Check if running in development and if a flag is set
// if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SEED_DATA === 'true') {
//     console.log("Detected SEED_DATA flag, running seed function...");
//     runSeedData();
// }
