// src/lib/seedData.ts
import { addSubject, getSubjects } from '@/controllers/subjectController'; // Import getSubjects
import { batchUpdateFixedTimetable, resetFixedTimetable } from '@/controllers/timetableController'; // Added resetFixedTimetable for potential full reset
import type { Subject } from '@/models/subject'; // Correct import for Subject type
import { FixedTimeSlot, DayOfWeek } from '@/models/timetable';

// Updated teacher names and subjects based on the image
const seedSubjectsData: Omit<Subject, 'id'>[] = [
  { name: '電気回路', teacherName: '友田' },
  { name: '実習A', teacherName: '担A' }, // Changed teacher name to match image
  { name: '体育', teacherName: '石/高/篠/瀬' },
  { name: '化学基礎', teacherName: '前田' },
  { name: '公共', teacherName: '黒崎' },
  { name: '家庭基礎', teacherName: '森部' },
  { name: '数II', teacherName: '小出' },
  // Note: "ソフトウェア技術" is not explicitly in the image, using "プロ技"
  { name: '英コミュII', teacherName: '奥/前/大' },
  { name: '現代の国語', teacherName: '新井' },
  { name: '電子回路', teacherName: '永田' },
  { name: '実習B', teacherName: '担B' }, // Changed teacher name to match image
  { name: '保健', teacherName: '濱田' },
  { name: 'プロ技', teacherName: '住原/友田' }, // Changed name to "プロ技" to match image
  { name: 'HR', teacherName: '担' }, // Changed teacher name to match image
  { name: '選択A', teacherName: '奥/前/大' },
  // Add any other subjects if missed, ensuring names/teachers match image
];

export const seedSubjects = async (): Promise<Subject[]> => {
  console.log('Seeding subjects...');
  const addedSubjects: Subject[] = [];
  try {
    const existingSubjects = await getSubjects(); // Fetch existing subjects first
    // Correctly create the map with [key, value] pairs
    const existingSubjectsMap = new Map(existingSubjects.map(s => [`${s.name}-${s.teacherName}`, s]));

    for (const subjectData of seedSubjectsData) {
      const mapKey = `${subjectData.name}-${subjectData.teacherName}`;
      if (!existingSubjectsMap.has(mapKey)) {
        try {
          const subjectId = await addSubject(subjectData.name, subjectData.teacherName);
          const newSubject = { id: subjectId, ...subjectData };
          addedSubjects.push(newSubject);
          existingSubjectsMap.set(mapKey, newSubject); // Add to map after successful add
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

  // Create a map for easy subject lookup by name AND teacher
  const subjectMap = new Map(subjects.map(s => [`${s.name}-${s.teacherName}`, s.id]));

  const getSubjectId = (name: string, teacher: string): string | null => {
    const key = `${name}-${teacher}`;
    const id = subjectMap.get(key);
    if (!id) {
        // Try finding by name only as a fallback
        const fallbackSubject = subjects.find(s => s.name === name);
        if(fallbackSubject?.id) {
            console.warn(`Subject ID not found for seed: ${key}. Using fallback ID for name: ${name}`);
            return fallbackSubject.id;
        }
        console.warn(`Subject ID not found for seed: ${key}. Setting to null.`);
        return null;
    }
    return id;
  };

  // Use the timetable structure directly from the image
  const fixedTimetableData: Omit<FixedTimeSlot, 'id'>[] = [
    // Monday
    { day: DayOfWeek.MONDAY, period: 1, subjectId: getSubjectId('電気回路', '友田') },
    { day: DayOfWeek.MONDAY, period: 2, subjectId: getSubjectId('体育', '石/高/篠/瀬') },
    { day: DayOfWeek.MONDAY, period: 3, subjectId: getSubjectId('選択A', '奥/前/大') },
    { day: DayOfWeek.MONDAY, period: 4, subjectId: getSubjectId('現代の国語', '新井') },
    { day: DayOfWeek.MONDAY, period: 5, subjectId: getSubjectId('英コミュII', '奥/前/大') },
    { day: DayOfWeek.MONDAY, period: 6, subjectId: getSubjectId('電子回路', '永田') },
    { day: DayOfWeek.MONDAY, period: 7, subjectId: getSubjectId('プロ技', '住原/友田') }, // Use プロ技
    // Tuesday
    { day: DayOfWeek.TUESDAY, period: 1, subjectId: getSubjectId('実習A', '担A') }, // Use 担A
    { day: DayOfWeek.TUESDAY, period: 2, subjectId: getSubjectId('実習A', '担A') }, // Use 担A
    { day: DayOfWeek.TUESDAY, period: 3, subjectId: getSubjectId('実習A', '担A') }, // Use 担A
    { day: DayOfWeek.TUESDAY, period: 4, subjectId: getSubjectId('数II', '小出') },
    { day: DayOfWeek.TUESDAY, period: 5, subjectId: getSubjectId('保健', '濱田') },
    { day: DayOfWeek.TUESDAY, period: 6, subjectId: getSubjectId('化学基礎', '前田') },
    { day: DayOfWeek.TUESDAY, period: 7, subjectId: null }, // Empty slot
    // Wednesday
    { day: DayOfWeek.WEDNESDAY, period: 1, subjectId: getSubjectId('体育', '石/高/篠/瀬') },
    { day: DayOfWeek.WEDNESDAY, period: 2, subjectId: getSubjectId('家庭基礎', '森部') },
    { day: DayOfWeek.WEDNESDAY, period: 3, subjectId: getSubjectId('英コミュII', '奥/前/大') },
    { day: DayOfWeek.WEDNESDAY, period: 4, subjectId: getSubjectId('数II', '小出') },
    { day: DayOfWeek.WEDNESDAY, period: 5, subjectId: getSubjectId('現代の国語', '新井') },
    { day: DayOfWeek.WEDNESDAY, period: 6, subjectId: getSubjectId('プロ技', '住原/友田') }, // Use プロ技
    { day: DayOfWeek.WEDNESDAY, period: 7, subjectId: getSubjectId('電気回路', '友田') },
    // Thursday
    { day: DayOfWeek.THURSDAY, period: 1, subjectId: getSubjectId('化学基礎', '前田') },
    { day: DayOfWeek.THURSDAY, period: 2, subjectId: getSubjectId('家庭基礎', '森部') },
    { day: DayOfWeek.THURSDAY, period: 3, subjectId: getSubjectId('選択A', '奥/前/大') },
    { day: DayOfWeek.THURSDAY, period: 4, subjectId: getSubjectId('電子回路', '永田') },
    { day: DayOfWeek.THURSDAY, period: 5, subjectId: getSubjectId('公共', '黒崎') },
    { day: DayOfWeek.THURSDAY, period: 6, subjectId: getSubjectId('HR', '担') }, // Use 担
    { day: DayOfWeek.THURSDAY, period: 7, subjectId: null }, // Empty slot
    // Friday
    { day: DayOfWeek.FRIDAY, period: 1, subjectId: getSubjectId('公共', '黒崎') },
    { day: DayOfWeek.FRIDAY, period: 2, subjectId: getSubjectId('数II', '小出') },
    { day: DayOfWeek.FRIDAY, period: 3, subjectId: getSubjectId('英コミュII', '奥/前/大') },
    { day: DayOfWeek.FRIDAY, period: 4, subjectId: getSubjectId('実習B', '担B') }, // Use 担B
    { day: DayOfWeek.FRIDAY, period: 5, subjectId: getSubjectId('実習B', '担B') }, // Use 担B
    { day: DayOfWeek.FRIDAY, period: 6, subjectId: getSubjectId('実習B', '担B') }, // Use 担B
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
    console.log("Updating fixed timetable with seed data based on the image...");
    await batchUpdateFixedTimetable(slotsWithIds);
    console.log('Seeded fixed timetable data based on image.');
  } catch (error) {
    console.error('Error seeding fixed timetable:', error);
  }
};

// Function to run all seed operations
export const runSeedData = async () => {
    console.log("Starting data seeding...");
    // Optionally reset timetable first to ensure clean state
    // try {
    //     console.log("Resetting timetable before seeding...");
    //     await resetFixedTimetable();
    // } catch (resetError) {
    //     console.error("Error resetting timetable before seeding:", resetError);
    //     // Decide if you want to continue seeding even if reset fails
    // }

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
