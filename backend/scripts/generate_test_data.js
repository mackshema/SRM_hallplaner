/**
 * Generates the Excel test dataset used to exercise every upload / generation
 * feature of Hall Harmony Planner.
 *
 *   cd backend && node scripts/generate_test_data.js
 *
 * Output goes to <repo>/test-data. The output is deterministic (seeded random),
 * so re-running produces identical files.
 *
 * IMPORTANT: seating generation links a student to an exam only when
 *   student.department === timetable.Department  AND  student.degree === timetable.Year
 * so every Department / Year string below is shared between the student and
 * timetable files on purpose. Keep them in sync if you edit this script.
 */
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../test-data');
const EDGE = path.join(OUT, 'edge-cases');
fs.mkdirSync(EDGE, { recursive: true });

// ---------- deterministic random ----------
let seed = 20261005;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- helpers ----------
const writeBook = (file, sheets) => {
  const wb = xlsx.utils.book_new();
  for (const [name, rows, opts] of sheets) {
    const ws = Array.isArray(rows[0])
      ? xlsx.utils.aoa_to_sheet(rows)
      : xlsx.utils.json_to_sheet(rows, opts);
    const header = Array.isArray(rows[0]) ? rows[0] : Object.keys(rows[0] || {});
    ws['!cols'] = header.map((h) => {
      const longest = Math.max(
        String(h ?? '').length,
        ...rows.slice(0, 200).map((r) => String((Array.isArray(r) ? r[header.indexOf(h)] : r[h]) ?? '').length)
      );
      return { wch: Math.min(Math.max(longest + 2, 8), 70) };
    });
    xlsx.utils.book_append_sheet(wb, ws, name);
  }
  xlsx.writeFile(wb, file, { cellDates: true });
  console.log('  wrote', path.relative(path.resolve(OUT, '..'), file));
};

// ---------- master data ----------
const FIRST = ['Aarav', 'Aditi', 'Akash', 'Anitha', 'Arjun', 'Bharath', 'Deepa', 'Dinesh', 'Divya', 'Gokul',
  'Harini', 'Hari', 'Janani', 'Karthik', 'Kavya', 'Lakshmi', 'Madhan', 'Meena', 'Mohan', 'Nandhini',
  'Naveen', 'Pooja', 'Pradeep', 'Priya', 'Rahul', 'Ramya', 'Sanjay', 'Saranya', 'Senthil', 'Shalini',
  'Siva', 'Sneha', 'Surya', 'Swathi', 'Tharun', 'Varun', 'Vignesh', 'Vishnu', 'Yamini', 'Yuvan'];
const INITIALS = ['A', 'B', 'C', 'G', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'V'];

// Anna University style: college(4) + batch(2) + dept code(3) + serial(3)
const COLLEGE = '9127';
const DEPTS = [
  { dept: 'CSE', code: '104', prefix: 'CS' },
  { dept: 'ECE', code: '106', prefix: 'EC' },
  { dept: 'EEE', code: '105', prefix: 'EE' },
  { dept: 'MECH', code: '114', prefix: 'ME' },
  { dept: 'CIVIL', code: '103', prefix: 'CE' },
  { dept: 'IT', code: '205', prefix: 'IT' },
  { dept: 'AIDS', code: '243', prefix: 'AD' },
];
// Academic year 2026-27 odd semester
const YEARS = [
  { year: 'Year 1', batch: '26', sem: 1 },
  { year: 'Year 2', batch: '25', sem: 3 },
  { year: 'Year 3', batch: '24', sem: 5 },
  { year: 'Year 4', batch: '23', sem: 7 },
];
const PER_CLASS = 20;

// ---------- 1. Students ----------
const students = [];
for (const y of YEARS) {
  for (const d of DEPTS) {
    for (let i = 1; i <= PER_CLASS; i++) {
      students.push({
        'Name': `${pick(FIRST)} ${pick(INITIALS)}`,
        'Roll Number': `${COLLEGE}${y.batch}${d.code}${String(i).padStart(3, '0')}`,
        'Email': '',
        'Program': 'Engineering',
        'Year': y.year,
        'Department': d.dept,
      });
    }
  }
}
// MBA (second program) - 2 years x 20
for (const [year, batch] of [['Year 1', '26'], ['Year 2', '25']]) {
  for (let i = 1; i <= PER_CLASS; i++) {
    students.push({
      'Name': `${pick(FIRST)} ${pick(INITIALS)}`,
      'Roll Number': `${COLLEGE}${batch}631${String(i).padStart(3, '0')}`,
      'Email': '',
      'Program': 'MBA',
      'Year': year,
      'Department': 'MBA',
    });
  }
}

// ---------- 2. Halls ----------
const halls = [];
const floors = ['Ground Floor', 'First Floor', 'Second Floor'];
floors.forEach((floor, f) => {
  for (let n = 1; n <= 4; n++) {
    halls.push({
      'Name': `${String.fromCharCode(65 + f)}${f + 1}0${n}`, // A101.., B201.., C301..
      'Rows': n === 4 ? 6 : 5,
      'Columns': 5,
      'SeatsPerBench': 2,
      'Floor': floor,
      'FacultyRequired': n === 4 ? 2 : 1,
    });
  }
});
halls.push({ 'Name': 'DH1', 'Rows': 6, 'Columns': 5, 'SeatsPerBench': 1, 'Floor': 'Ground Floor', 'FacultyRequired': 1 });
halls.push({ 'Name': 'DH2', 'Rows': 6, 'Columns': 5, 'SeatsPerBench': 1, 'Floor': 'First Floor', 'FacultyRequired': 1 });
const capacity = halls.reduce((s, h) => s + h.Rows * h.Columns * h.SeatsPerBench, 0);

// ---------- 3. Faculty ----------
const DESIGNATIONS = ['Assistant Professor', 'Assistant Professor', 'Associate Professor', 'Professor'];
const SURNAMES = ['Kumar', 'Raj', 'Devi', 'Selvan', 'Priya', 'Nathan'];
const faculty = [];
for (const d of [...DEPTS, { dept: 'MBA' }, { dept: 'S&H' }]) {
  for (let i = 0; i < 6; i++) {
    const idx = faculty.length;
    const isHod = i === 0;
    faculty.push({
      // Must be "<initial>. <name>" and unique (createUser rejects duplicates by name)
      'Name': `${INITIALS[idx % INITIALS.length]}. ${FIRST[idx % FIRST.length]} ${SURNAMES[Math.floor(idx / FIRST.length)]}`,
      'Username': `FAC${String(idx + 1).padStart(3, '0')}`,
      'Password': 'faculty123',
      'Department': d.dept,
      'Designation': isHod ? 'HOD' : pick(DESIGNATIONS),
      'Faculty Email': '',
      'HOD Email': '',
    });
  }
}

// ---------- 4. Internal (IAT) timetable ----------
// Year 2 + Year 4 write FN, Year 3 writes AN (IAT-II is "Except I Year").
const IAT_DATES = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
const subject = (d, y, i) => `${d.prefix}3${y.sem}5${i}`; // e.g. CS3551
const internalTT = [];
for (const y of YEARS.filter((y) => y.year !== 'Year 1')) {
  const session = y.year === 'Year 3' ? 'AN' : 'FN';
  IAT_DATES.forEach((date, i) => {
    for (const d of DEPTS) {
      internalTT.push({
        'Subject Code': subject(d, y, i + 1),
        'Subject Name': `${d.dept} Sem ${y.sem} Paper ${i + 1}`,
        'Date': date,
        'Session': session,
        'Department': d.dept,
        'Year': y.year,
      });
    }
  });
}
// MBA Year 2 on the AN sessions
IAT_DATES.forEach((date, i) => internalTT.push({
  'Subject Code': `BA43${i + 1}0`, 'Subject Name': `MBA Sem 3 Paper ${i + 1}`,
  'Date': date, 'Session': 'AN', 'Department': 'MBA', 'Year': 'Year 2',
}));

// ---------- 5. Anna University end-semester timetable ----------
const ANNA_DATES = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'];
const annaTT = [];
for (const y of YEARS) {
  const session = (y.year === 'Year 1' || y.year === 'Year 3') ? 'AN' : 'FN';
  ANNA_DATES.forEach((date, i) => {
    for (const d of DEPTS) {
      annaTT.push({
        'Subject Code': `${d.prefix}3${y.sem}0${i + 1}`, // e.g. CS3701
        'Subject Name': `${d.dept} Sem ${y.sem} Theory ${i + 1}`,
        'Date': date, 'Session': session, 'Department': d.dept, 'Year': y.year,
      });
    }
  });
}
ANNA_DATES.slice(0, 4).forEach((date, i) => {
  annaTT.push({ 'Subject Code': `BA41${i + 1}0`, 'Subject Name': `MBA Sem 1 Paper ${i + 1}`, 'Date': date, 'Session': 'AN', 'Department': 'MBA', 'Year': 'Year 1' });
  annaTT.push({ 'Subject Code': `BA43${i + 1}0`, 'Subject Name': `MBA Sem 3 Paper ${i + 1}`, 'Date': date, 'Session': 'FN', 'Department': 'MBA', 'Year': 'Year 2' });
});

// ---------- 6. Anna arrear registrations (per-student subject rows) ----------
// Year 4 students re-writing a Year 3 (Sem 5) paper. Year 3 sits AN, Year 4 sits FN,
// so an arrear never clashes with the student's own regular exam.
const annaStudents = [];
for (const d of DEPTS) {
  for (let i = 1; i <= 4; i++) {
    const roll = `${COLLEGE}23${d.code}${String(i * 3).padStart(3, '0')}`;
    const st = students.find((s) => s['Roll Number'] === roll);
    annaStudents.push({
      'Roll Number': roll,
      'Subject Code': `${d.prefix}350${(i % 6) + 1}`,
      'Department': d.dept,
      'Student Name': st.Name,
    });
  }
}

// ---------- 7. Manual mapping roll list ----------
const manualRolls = [['Roll Number'],
  ...students.filter((s) => s.Department === 'CSE' && s.Year === 'Year 2').slice(0, 5).map((s) => [s['Roll Number']])];

// ---------- 8. Test scenarios checklist ----------
const scenarios = [
  // [ID, Module, What to do, File, Expected result]
  ['T01', 'Login', 'Log in as admin with SEED_ADMIN credentials', '-', 'Admin dashboard opens'],
  ['T02', 'Login', 'Log in with a wrong password', '-', 'Error shown, no token stored'],
  ['T03', 'Halls', 'Halls > Upload Excel', '01_Halls.xlsx', `14 halls created (total capacity ${capacity} seats)`],
  ['T04', 'Halls', 'Upload the same file again', '01_Halls.xlsx', '0 created, 14 errors "Hall already exists"'],
  ['T05', 'Halls', 'Open DH1 / DH2', '-', 'Seats per bench = 1 (drawing hall)'],
  ['T06', 'Halls', 'Edit a hall rows/columns, then delete a hall', '-', 'Changes persist after refresh'],
  ['T07', 'Halls', 'Upload invalid halls', 'edge-cases/E05_Halls_Invalid.xlsx', 'Zero-size rows ignored, duplicates rejected, DH9 forced to 1 seat/bench, "Hall Number" header accepted'],
  ['T08', 'Students', 'Students > Global upload', '02_Students.xlsx', `${students.length} students created across Engineering (Year 1-4 x 7 depts) and MBA`],
  ['T09', 'Students', 'Upload the same file again', '02_Students.xlsx', `0 created, ${students.length} skipped "Roll number already exists"`],
  ['T10', 'Students', 'Upload duplicates file', 'edge-cases/E01_Students_Duplicates.xlsx', 'Existing rolls and in-file repeats skipped; 2 new students created'],
  ['T11', 'Students', 'Upload missing-fields file', 'edge-cases/E02_Students_Missing_Fields.xlsx', 'Rows with no name or roll number dropped; 2 rows created (the blank-department row falls back to General / Year 1)'],
  ['T12', 'Students', 'Upload alternate headers file', 'edge-cases/E03_Students_Alt_Headers.xlsx', 'lowercase / camelCase headers accepted; 3 students created'],
  ['T13', 'Students', 'Upload lowercase rolls', 'edge-cases/E04_Students_Lowercase_Rolls.xlsx', 'Roll numbers stored UPPERCASE and trimmed'],
  ['T14', 'Students', 'Log in as a student (roll no. / student123) and change password', '-', 'Student can see own seat; new password works'],
  ['T15', 'Faculty', 'Run: node scripts/seed_test_faculty.js', '03_Faculty.xlsx', `${faculty.length} faculty created (6 per dept incl. one HOD)`],
  ['T16', 'Faculty', 'Run seed script with invalid file', 'edge-cases/E11_Faculty_Invalid.xlsx', 'Name without initial rejected, duplicate rejected, bad designation rejected'],
  ['T17', 'Internal', 'Seating Plans > Upload Timetable', '04_Internal_Timetable.xlsx', '10 sessions auto-generated (5 days x FN/AN)'],
  ['T18', 'Internal', 'Check FN session of 2026-10-05', '-', '280 students (Year 2 + Year 4, 7 depts) seated; departments alternate on benches'],
  ['T19', 'Internal', 'Check AN session of 2026-10-05', '-', '160 students (Year 3 x 7 depts + MBA Year 2) seated'],
  ['T20', 'Internal', 'Check faculty duties', '-', 'Each hall has FacultyRequired invigilators, nobody twice in one session'],
  ['T21', 'Internal', 'Manual map CSE Year 2 rolls to a new subject', '07_Manual_Map_Rolls.xlsx', '5 students mapped'],
  ['T22', 'Internal', 'Manual map with unknown rolls', 'edge-cases/E12_Manual_Map_Unknown_Rolls.xlsx', 'Partial warning lists the 2 unknown roll numbers'],
  ['T23', 'Internal', 'Upload timetable with real Excel date cells', 'edge-cases/E06_Timetable_Excel_Dates.xlsx', 'Dates converted to YYYY-MM-DD'],
  ['T24', 'Internal', 'Upload timetable with bad rows', 'edge-cases/E07_Timetable_Bad_Rows.xlsx', 'Whole file rejected (400) with row errors for rows 2-5; existing plans untouched'],
  ['T25', 'Internal', 'Upload shared subject code file', 'edge-cases/E08_Timetable_Shared_Subject_Code.xlsx', 'MA3354 scheduled for both CSE and IT: 40 students seated'],
  ['T26', 'Internal', 'Upload header-only timetable', 'edge-cases/E09_Timetable_Empty.xlsx', '400 "Invalid timetable data provided"'],
  ['T27', 'Capacity', 'Upload E10 students then E10 timetable', 'edge-cases/E10_Capacity_*.xlsx', 'Warning: N student(s) could not be seated; seated + unseated = 780, nobody silently dropped'],
  ['T28', 'Anna Univ', 'Anna planner > Upload arrear students', '05_Anna_Students.xlsx', `${annaStudents.length} arrear registrations stored`],
  ['T29', 'Anna Univ', 'Anna planner > Upload timetable (confirm)', '06_Anna_Timetable.xlsx', '12 sessions generated (6 dates x FN/AN)'],
  ['T30', 'Anna Univ', 'Check arrear students', '-', 'Year 4 arrear students also seated in the Sem 5 AN session'],
  ['T31', 'Exports', 'Download seating / attendance / hall layout / consolidated package', '-', 'Word/PDF/ZIP files open and match on-screen plan'],
  ['T32', 'Sessions', 'Finalize, unfinalize and publish a session', '-', 'Status changes; students only see published seats'],
  ['T33', 'Faculty', 'Log in as FAC002, request delegation, approve as admin', '-', 'Duty moves to the replacement faculty'],
  ['T34', 'Faculty', 'Mark a student absent from faculty dashboard', '-', 'Absent flag saved and shown in exports'],
  ['T35', 'Lookup', 'Student Lookup page: search a roll number', '-', 'Shows hall, row, column for published sessions'],
  ['T36', 'Settings', 'Change institution name / logos / exam name', '-', 'Values appear on exported documents'],
];

// ---------- write main files ----------
console.log(`Generating test data in ${OUT}`);
writeBook(path.join(OUT, '01_Halls.xlsx'), [['Halls', halls]]);
writeBook(path.join(OUT, '02_Students.xlsx'), [['Students', students]]);
writeBook(path.join(OUT, '03_Faculty.xlsx'), [['Faculty', faculty]]);
writeBook(path.join(OUT, '04_Internal_Timetable.xlsx'), [['Timetable', internalTT]]);
writeBook(path.join(OUT, '05_Anna_Students.xlsx'), [['Anna Students', annaStudents]]);
writeBook(path.join(OUT, '06_Anna_Timetable.xlsx'), [['Anna Timetable', annaTT]]);
writeBook(path.join(OUT, '07_Manual_Map_Rolls.xlsx'), [['Rolls', manualRolls]]);

// ---------- edge cases ----------
const s0 = students[0];
writeBook(path.join(EDGE, 'E01_Students_Duplicates.xlsx'), [['Students', [
  s0, students[1],                                    // already exist -> skipped
  { ...s0, 'Name': 'Duplicate Of First' },            // same roll, different name -> skipped
  { 'Name': 'New Student One', 'Roll Number': '912725104901', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' },
  { 'Name': 'New Student One Again', 'Roll Number': '912725104901', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' }, // in-file repeat
  { 'Name': 'New Student Two', 'Roll Number': '912725104902', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' },
]]]);
writeBook(path.join(EDGE, 'E02_Students_Missing_Fields.xlsx'), [['Students', [
  { 'Name': '', 'Roll Number': '912725104911', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' },
  { 'Name': 'No Roll Number', 'Roll Number': '', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' },
  { 'Name': 'No Dept Given', 'Roll Number': '912725104912', 'Email': '', 'Program': '', 'Year': '', 'Department': '' },
  { 'Name': 'Valid Row', 'Roll Number': '912725104913', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CSE' },
]]]);
writeBook(path.join(EDGE, 'E03_Students_Alt_Headers.xlsx'), [['Students', [
  { 'name': 'Alt Header One', 'rollNumber': '912725106921', 'email': '', 'program': 'Engineering', 'degree': 'Year 2', 'department': 'ECE' },
  { 'name': 'Alt Header Two', 'rollNumber': '912725106922', 'email': '', 'program': 'Engineering', 'degree': 'Year 2', 'department': 'ECE' },
  { 'name': 'Alt Header Three', 'rollNumber': '912725106923', 'email': '', 'program': 'Engineering', 'degree': 'Year 2', 'department': 'ECE' },
]]]);
writeBook(path.join(EDGE, 'E04_Students_Lowercase_Rolls.xlsx'), [['Students', [
  { 'Name': 'Lower Case Roll', 'Roll Number': '  9127mba931 ', 'Email': '', 'Program': 'MBA', 'Year': 'Year 1', 'Department': 'MBA' },
  { 'Name': 'Mixed Case Roll', 'Roll Number': 'test-eee-932', 'Email': '', 'Program': 'Engineering', 'Year': 'Year 3', 'Department': 'EEE' },
]]]);
writeBook(path.join(EDGE, 'E05_Halls_Invalid.xlsx'), [['Halls', [
  { 'Name': 'A101', 'Rows': 5, 'Columns': 5, 'SeatsPerBench': 2, 'Floor': 'Ground Floor', 'FacultyRequired': 1 }, // duplicate
  { 'Name': 'Z001', 'Rows': 0, 'Columns': 5, 'SeatsPerBench': 2, 'Floor': 'Ground Floor', 'FacultyRequired': 1 }, // zero rows
  { 'Name': 'DH9', 'Rows': 4, 'Columns': 4, 'SeatsPerBench': 2, 'Floor': 'Second Floor', 'FacultyRequired': 1 },  // forced to 1
  { 'Name': 'Z002', 'Rows': 4, 'Columns': 4, 'SeatsPerBench': 2, 'Floor': '', 'FacultyRequired': '' },            // default floor / faculty
  { 'Name': '', 'Rows': 4, 'Columns': 4, 'SeatsPerBench': 2, 'Floor': 'Ground Floor', 'FacultyRequired': 1 },     // no name
]], ['Alt Headers', [
  { 'Hall Number': 'Z003', 'rows': 3, 'columns': 3, 'Seats Per Bench': 2, 'floor': 'Ground Floor', 'Faculty Required': 1 },
]]]);
// Note: the uploader only reads the FIRST sheet. Upload "Alt Headers" as a separate file if needed.
writeBook(path.join(EDGE, 'E05b_Halls_Alt_Headers.xlsx'), [['Halls', [
  { 'Hall Number': 'Z003', 'rows': 3, 'columns': 3, 'Seats Per Bench': 2, 'floor': 'Ground Floor', 'Faculty Required': 1 },
]]]);
{
  const aoa = [['Subject Code', 'Date', 'Session', 'Department', 'Year'],
    ['CS3351', new Date(Date.UTC(2026, 9, 12)), 'FN', 'CSE', 'Year 2'],
    ['EC3351', new Date(Date.UTC(2026, 9, 12)), 'FN', 'ECE', 'Year 2'],
    ['CS3551', new Date(Date.UTC(2026, 9, 13)), 'AN', 'CSE', 'Year 3']];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(aoa, { cellDates: false }); // stored as Excel serial numbers
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 8 }];
  for (const r of [2, 3, 4]) ws[`B${r}`].z = 'dd-mm-yyyy';
  xlsx.utils.book_append_sheet(wb, ws, 'Timetable');
  xlsx.writeFile(wb, path.join(EDGE, 'E06_Timetable_Excel_Dates.xlsx'));
  console.log('  wrote test-data/edge-cases/E06_Timetable_Excel_Dates.xlsx');
}
writeBook(path.join(EDGE, 'E07_Timetable_Bad_Rows.xlsx'), [['Timetable', [
  { 'Subject Code': 'CS3352', 'Date': '', 'Session': 'FN', 'Department': 'CSE', 'Year': 'Year 2' },        // no date
  { 'Subject Code': 'CS3353', 'Date': '2026-10-14', 'Session': '', 'Department': 'CSE', 'Year': 'Year 2' }, // no session
  { 'Subject Code': 'CS3354', 'Date': '2026-10-14', 'Session': 'Morning', 'Department': 'CSE', 'Year': 'Year 2' }, // invalid session
  { 'Subject Code': '', 'Date': '2026-10-14', 'Session': 'FN', 'Department': 'CSE', 'Year': 'Year 2' },     // no subject
  { 'Subject Code': 'CS3355', 'Date': '2026-10-15', 'Session': 'FN', 'Department': 'CSE', 'Year': 'Year 2' }, // valid
]]]);
writeBook(path.join(EDGE, 'E08_Timetable_Shared_Subject_Code.xlsx'), [['Timetable', [
  { 'Subject Code': 'MA3354', 'Date': '2026-10-16', 'Session': 'FN', 'Department': 'CSE', 'Year': 'Year 2' },
  { 'Subject Code': 'MA3354', 'Date': '2026-10-16', 'Session': 'FN', 'Department': 'IT', 'Year': 'Year 2' },
]]]);
writeBook(path.join(EDGE, 'E09_Timetable_Empty.xlsx'), [['Timetable', [['Subject Code', 'Date', 'Session', 'Department', 'Year']]]]);
{
  const overflow = [];
  for (let i = 1; i <= 500; i++) { // 500 + 280 regular FN students > 690 seats
    overflow.push({ 'Name': `Capacity Test ${i}`, 'Roll Number': `CAP${String(i).padStart(4, '0')}`, 'Email': '', 'Program': 'Engineering', 'Year': 'Year 2', 'Department': 'CAPTEST' });
  }
  writeBook(path.join(EDGE, 'E10_Capacity_Students.xlsx'), [['Students', overflow]]);
  writeBook(path.join(EDGE, 'E10_Capacity_Timetable.xlsx'), [['Timetable', [
    ...internalTT.filter((r) => r.Date === '2026-10-05'),
    { 'Subject Code': 'CAP101', 'Subject Name': 'Capacity Test Paper', 'Date': '2026-10-05', 'Session': 'FN', 'Department': 'CAPTEST', 'Year': 'Year 2' },
  ]]]);
}
writeBook(path.join(EDGE, 'E11_Faculty_Invalid.xlsx'), [['Faculty', [
  { 'Name': 'Ramesh Kumar', 'Username': 'FACX01', 'Password': 'faculty123', 'Department': 'CSE', 'Designation': 'Assistant Professor', 'Faculty Email': '', 'HOD Email': '' }, // no initial
  { ...faculty[0] },                                                                                                                                                         // duplicate
  { 'Name': 'Z. Invalid Designation', 'Username': 'FACX02', 'Password': 'faculty123', 'Department': 'CSE', 'Designation': 'Lecturer', 'Faculty Email': '', 'HOD Email': '' }, // bad enum
  { 'Name': 'Y. Valid Extra', 'Username': 'FACX03', 'Password': 'faculty123', 'Department': 'ECE', 'Designation': 'Professor', 'Faculty Email': '', 'HOD Email': '' },          // valid
]]]);
writeBook(path.join(EDGE, 'E12_Manual_Map_Unknown_Rolls.xlsx'), [['Rolls', [
  ['Roll Number'], [students[0]['Roll Number']], ['999999999991'], ['999999999992'],
]]]);

// ---------- master workbook (everything + README + checklist) ----------
const readme = [
  ['Hall Harmony Planner - Test Dataset'],
  [''],
  ['Generated by backend/scripts/generate_test_data.js (deterministic - re-run to rebuild).'],
  ['Each upload file in test-data/ holds its data on the FIRST sheet, row 1 = headers, which is what the app reads.'],
  ['This master workbook is for reference and tracking only - upload the individual numbered files.'],
  [''],
  ['Dataset summary'],
  ['Students', students.length, 'Engineering: 7 depts (CSE ECE EEE MECH CIVIL IT AIDS) x Year 1-4 x 20; MBA: Year 1-2 x 20'],
  ['Halls', halls.length, `Total capacity ${capacity} seats (12 classrooms x 2 per bench + DH1, DH2 at 1 per bench)`],
  ['Faculty', faculty.length, '6 per department (first one is HOD) incl. MBA and S&H. Password: faculty123'],
  ['Internal timetable rows', internalTT.length, 'IAT 05-09 Oct 2026. FN = Year 2 + Year 4, AN = Year 3 + MBA Year 2'],
  ['Anna timetable rows', annaTT.length, 'End sem 16-27 Nov 2026. FN = Year 2 + Year 4 + MBA Y2, AN = Year 1 + Year 3 + MBA Y1'],
  ['Anna arrear rows', annaStudents.length, 'Year 4 students re-writing a Sem 5 paper (AN), no clash with own FN exam'],
  [''],
  ['Upload order'],
  ['1', '01_Halls.xlsx', 'Admin > Halls > Upload Excel'],
  ['2', '02_Students.xlsx', 'Admin > Students > Global Upload (default password student123)'],
  ['3', '03_Faculty.xlsx', 'cd backend && node scripts/seed_test_faculty.js (no faculty Excel upload exists in the UI)'],
  ['4', '04_Internal_Timetable.xlsx', 'Admin > Seating Plans > Upload Timetable (clears existing internal plans!)'],
  ['5', '05_Anna_Students.xlsx', 'Admin > Anna University Planner > Upload Students'],
  ['6', '06_Anna_Timetable.xlsx', 'Admin > Anna University Planner > Upload Timetable (clears existing Anna plans!)'],
  [''],
  ['Rules the data relies on'],
  ['Student Department + Year must exactly equal the timetable Department + Year, otherwise the student is not seated.'],
  ['Email column is left blank on purpose: bulk upload sends a real email per student when EMAIL_USER is configured.'],
  ['Use a separate test database - timetable uploads delete existing seating plans and faculty duties.'],
];
const scenarioRows = [['ID', 'Module', 'Steps', 'File', 'Expected Result', 'Status (Pass/Fail)', 'Notes'],
  ...scenarios.map((s) => [...s, '', ''])];
writeBook(path.join(OUT, 'Test_Dataset_Master.xlsx'), [
  ['README', readme],
  ['Test Scenarios', scenarioRows],
  ['Students', students],
  ['Halls', halls],
  ['Faculty', faculty],
  ['Internal Timetable', internalTT],
  ['Anna Timetable', annaTT],
  ['Anna Students', annaStudents],
]);

console.log(`Done. ${students.length} students, ${halls.length} halls (${capacity} seats), ${faculty.length} faculty, ` +
  `${internalTT.length} internal + ${annaTT.length} Anna timetable rows, ${scenarios.length} test scenarios.`);
