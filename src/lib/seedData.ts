// src/lib/seedData.ts
import { addSubject, getSubjects } from '@/controllers/subjectController'; // Import getSubjects
import { batchUpdateFixedTimetable } from '@/controllers/timetableController';
import { Subject } from '@/models/subject';
import { FixedTimeSlot, DayOfWeek } from '@/models/timetable';

// Updated teacher names based on the image
const seedSubjectsData: Omit<Subject, 'id'>[] = [
  { name: '電気回路', teacherName: '友田' },
  { name: '実習A', teacherName: '担当A' }, // Placeholder for 実習A as no teacher is listed
  { name: '体育', teacherName: '石/高/篠/瀬' },
  { name: '化学基礎', teacherName: '前田' },
  { name: '公共', teacherName: '黒崎' },
  { name: '家庭基礎', teacherName: '森部' },
  { name: '数II', teacherName: '小出' },
  { name: 'ソフトウェア技術', teacherName: '中村' }, // Assuming this is the same as プログラミング技術 or keeping placeholder
  { name: '英コミュII', teacherName: '奥/前/大' },
  { name: '現代の国語', teacherName: '新井' },
  { name: '電子回路', teacherName: '永田' },
  { name: '実習B', teacherName: '担当B' }, // Placeholder for 実習B
  { name: '保健', teacherName: '濵田' },
  // { name: '化学基礎', teacherName: '前田' }, // Already added
  { name: 'プログラミング技術', teacherName: '住原/友田' }, // Explicitly add this based on 7th period
  { name: 'HR', teacherName: '奥/小/服' },
  { name: '選択A', teacherName: '奥/前/大' }, // Add 選択A
];

export const seedSubjects = async (): Promise<Subject[]> => {
  console.log('Seeding subjects...');
  const addedSubjects: Subject[] = [];
  try {
    const existingSubjects = await getSubjects(); // Fetch existing subjects first
    const existingSubjectsMap = new Map(existingSubjects.map(s => `${s.name}-${s.teacherName}`));

    for (const subjectData of seedSubjectsData) {
      const mapKey = `${subjectData.name}-${subjectData.teacherName}`;
      if (!existingSubjectsMap.has(mapKey)) {
        try {
          const subjectId = await addSubject(subjectData.name, subjectData.teacherName);
          addedSubjects.push({ id: subjectId, ...subjectData });
          existingSubjectsMap.set(mapKey, { id: subjectId, ...subjectData }); // Add to map after successful add
        } catch (addError) {
            console.error(`Error adding subject '${subjectData.name}':`, addError);
        }
      }
    }
    // Combine newly added and already existing subjects for the return value
    const allSubjects = Array.from(existingSubjectsMap.values());
    console.log(`Finished seeding subjects. Total subjects (including existing): ${allSubjects.length}. Newly added: ${addedSubjects.length}`);
    return allSubjects;
  } catch (error) {
    console.error('Error seeding subjects:', error);
    return []; // Return empty array on error
  }
};


export const seedFixedTimetable = async (subjects: Subject[]) => {
  console.log('Seeding fixed timetable...');

  // Create a map for easy subject lookup by name AND teacher for more accuracy if needed
  // For simplicity, using just name here, assuming names are unique enough for this seed data
  const subjectMap = new Map(subjects.map(s => [s.name, s.id]));

  const getSubjectId = (name: string): string | null => {
    const id = subjectMap.get(name);
    if (!id) {
        console.warn(`Subject ID not found for seed name: ${name}. Setting to null.`);
    }
    return id ?? null; // Return null if subject not found
  };

  // Use the timetable structure from the image
  const fixedTimetableData: Omit<FixedTimeSlot, 'id'>[] = [
    // Monday
    { day: DayOfWeek.MONDAY, period: 1, subjectId: getSubjectId('電気回路') },
    { day: DayOfWeek.MONDAY, period: 2, subjectId: getSubjectId('体育') },
    { day: DayOfWeek.MONDAY, period: 3, subjectId: getSubjectId('選択A') }, // Corrected based on image
    { day: DayOfWeek.MONDAY, period: 4, subjectId: getSubjectId('現代の国語') },
    { day: DayOfWeek.MONDAY, period: 5, subjectId: getSubjectId('英コミュII') },
    { day: DayOfWeek.MONDAY, period: 6, subjectId: getSubjectId('電子回路') },
    { day: DayOfWeek.MONDAY, period: 7, subjectId: getSubjectId('プログラミング技術') },
    // Tuesday
    { day: DayOfWeek.TUESDAY, period: 1, subjectId: getSubjectId('実習A') },
    { day: DayOfWeek.TUESDAY, period: 2, subjectId: getSubjectId('実習A') }, // Corrected based on image
    { day: DayOfWeek.TUESDAY, period: 3, subjectId: getSubjectId('実習A') }, // Corrected based on image
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
    { day: DayOfWeek.WEDNESDAY, period: 6, subjectId: getSubjectId('プログラミング技術') }, // Corrected based on image
    { day: DayOfWeek.WEDNESDAY, period: 7, subjectId: getSubjectId('電気回路') }, // Corrected based on image
    // Thursday
    { day: DayOfWeek.THURSDAY, period: 1, subjectId: getSubjectId('化学基礎') },
    { day: DayOfWeek.THURSDAY, period: 2, subjectId: getSubjectId('家庭基礎') }, // Corrected based on image
    { day: DayOfWeek.THURSDAY, period: 3, subjectId: getSubjectId('選択A') }, // Corrected based on image
    { day: DayOfWeek.THURSDAY, period: 4, subjectId: getSubjectId('電子回路') },
    { day: DayOfWeek.THURSDAY, period: 5, subjectId: getSubjectId('公共') },
    { day: DayOfWeek.THURSDAY, period: 6, subjectId: getSubjectId('HR') },
    { day: DayOfWeek.THURSDAY, period: 7, subjectId: null }, // Empty slot
    // Friday
    { day: DayOfWeek.FRIDAY, period: 1, subjectId: getSubjectId('公共') },
    { day: DayOfWeek.FRIDAY, period: 2, subjectId: getSubjectId('数II') },
    { day: DayOfWeek.FRIDAY, period: 3, subjectId: getSubjectId('英コミュII') },
    { day: DayOfWeek.FRIDAY, period: 4, subjectId: getSubjectId('実習B') }, // Corrected based on image
    { day: DayOfWeek.FRIDAY, period: 5, subjectId: getSubjectId('実習B') }, // Corrected based on image
    { day: DayOfWeek.FRIDAY, period: 6, subjectId: getSubjectId('実習B') }, // Corrected based on image
    { day: DayOfWeek.FRIDAY, period: 7, subjectId: null }, // Empty slot
  ];

  // Generate IDs for the slots
   const slotsWithIds: FixedTimeSlot[] = fixedTimetableData.map(slot => ({
       ...slot,
       id: `${slot.day}_${slot.period}`,
   }));


  try {
    // Fetch existing timetable to avoid overwriting unnecessarily if run multiple times.
    // However, for a seed, we usually *want* to overwrite to ensure a consistent state.
    // Let's proceed with batchUpdate which handles applying to future.
    console.log("Updating fixed timetable with seed data...");
    await batchUpdateFixedTimetable(slotsWithIds);
    console.log('Seeded fixed timetable data based on image.');
  } catch (error) {
    console.error('Error seeding fixed timetable:', error);
  }
};

// Function to run all seed operations
export const runSeedData = async () => {
    console.log("Starting data seeding...");
    const subjects = await seedSubjects(); // Ensure subjects are created/fetched first
    if (subjects.length > 0) {
        await seedFixedTimetable(subjects);
    } else {
        console.warn("Subject seeding/fetching failed or returned no subjects, skipping fixed timetable seed.");
    }
    console.log("Data seeding finished.");
};

// Optional: Add a way to trigger this, e.g., a button in dev mode or a script
// Example: Check if running in development and if a flag is set
// if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SEED_DATA === 'true') {
//     console.log("Detected SEED_DATA flag, running seed function...");
//     runSeedData();
// }
