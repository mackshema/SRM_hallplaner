/**
 * End-to-end API test suite for Hall Harmony Planner.
 *
 *   cd backend && npm run test:api
 *
 * Starts the real server (src/server.js) on port 5099 against a THROWAWAY
 * database (default mongodb://127.0.0.1:27017/exam_hall_api_test), which is
 * dropped before and after the run. Your .env is not loaded: the server runs
 * from a temp directory with test-only credentials, and email is pointed at a
 * closed port so nothing is ever sent.
 *
 * Uses the Excel files in ../test-data (run scripts/generate_test_data.js first).
 * Each check carries a rule ID that matches docs/RULES_AND_FUNCTIONS.md.
 * Exit code is 1 if any check fails.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TD = path.resolve(__dirname, '../../test-data');
const MONGO = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/exam_hall_api_test';
const PORT = 5099;
const API = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { username: 'testadmin', password: 'Admin@123' };

if (/\/exam_hall_allotment(\?|$)/.test(MONGO)) {
  console.error('Refusing to run against the main exam_hall_allotment database.');
  process.exit(1);
}

// ---------------- tiny test framework ----------------
const results = [];
const check = (id, rule, pass, detail = '') => {
  results.push({ id, rule, pass: !!pass, detail: String(detail ?? '') });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${rule}${detail !== '' ? `  -> ${String(detail).slice(0, 160)}` : ''}`);
};
const section = (name) => console.log(`\n=== ${name} ===`);

// ---------------- helpers ----------------
const rows = (file) => {
  const wb = xlsx.readFile(path.join(TD, file));
  return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
};
const api = async (method, url, { token, body, file, raw } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (file) {
    payload = new FormData();
    payload.append('file', new Blob([fs.readFileSync(path.join(TD, file))]), path.basename(file));
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + url, { method, headers, body: payload });
  if (raw) return { status: res.status, type: res.headers.get('content-type') || '', size: (await res.arrayBuffer()).byteLength };
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const login = async (username, password) => (await api('POST', '/auth/login', { body: { username, password } })).data?.token;

/** Checks the department-adjacency rules on one internal session's seats. */
const internalSeatViolations = (assignments, hallsById) => {
  const v = { benchMate: 0, horizontal: 0, vertical: 0, outOfBounds: 0, dhSecondSeat: 0, duplicates: 0 };
  const seen = new Set();
  const grids = {};
  for (const a of assignments) {
    if (seen.has(a.studentRollNumber)) v.duplicates++;
    seen.add(a.studentRollNumber);
    if (a.isExtraBench) continue;
    const h = hallsById[a.hallId];
    if (!h) continue;
    if (a.row < 1 || a.row > h.rows || a.column < 1 || a.column > h.columns || a.benchPosition > h.seatsPerBench) v.outOfBounds++;
    if (h.name.toUpperCase().includes('DH') && a.benchPosition > 1) v.dhSecondSeat++;
    const g = (grids[a.hallId] ??= {});
    g[`${a.row}:${(a.column - 1) * h.seatsPerBench + a.benchPosition}`] = a;
  }
  for (const [hallId, g] of Object.entries(grids)) {
    const h = hallsById[hallId];
    for (const a of Object.values(g)) {
      const x = (a.column - 1) * h.seatsPerBench + a.benchPosition;
      const right = g[`${a.row}:${x + 1}`];
      const below = g[`${a.row + 1}:${x}`];
      if (right && right.departmentId === a.departmentId) {
        if (right.column === a.column) v.benchMate++; else v.horizontal++;
      }
      if (below && below.departmentId === a.departmentId) v.vertical++;
    }
  }
  return v;
};

/** Anna plans use up to 2 seats per bench, never more than the hall's own (see ANNA-SEAT rules). */
const annaSeatViolations = (plan, hallsById) => {
  const v = { sameDept: 0, sameSubject: 0, overHallMax: 0, dhSecondSeat: 0, duplicates: 0 };
  const seen = new Set();
  const byHall = {};
  for (const a of plan.assignments) {
    if (seen.has(a.rollNumber)) v.duplicates++;
    seen.add(a.rollNumber);
    (byHall[a.hallId] ??= []).push(a);
    const h = hallsById[a.hallId];
    if (h && h.name.toUpperCase().includes('DH') && a.benchPosition > 1) v.dhSecondSeat++;
  }
  for (const [hallId, list] of Object.entries(byHall)) {
    if (list.length > 25) v.overHallMax++;
    const spb = Math.min(2, hallsById[hallId]?.seatsPerBench || 2); // Anna uses up to 2 per bench
    const g = {};
    list.forEach((a) => { g[`${a.row}:${(a.column - 1) * spb + a.benchPosition}`] = a; });
    for (const a of list) {
      const x = (a.column - 1) * spb + a.benchPosition;
      for (const n of [g[`${a.row}:${x + 1}`], g[`${a.row + 1}:${x}`]]) {
        if (!n) continue;
        if (n.department === a.department) v.sameDept++;
        if (n.subjectCode === a.subjectCode) v.sameSubject++;
      }
    }
  }
  return v;
};

/** Faculty-allocation checks on a list of {hallId, facultyIds}. */
const facultyViolations = (facultyAssignments, hallsById, facultyById, hallsWithStudents) => {
  const v = { understaffed: 0, doubleBooked: 0, over2SameDept: 0 };
  const used = new Set();
  for (const fa of facultyAssignments) {
    const hId = String(fa.hallId);
    if (!hallsWithStudents.has(hId)) continue;
    const need = hallsById[hId]?.facultyRequired || 1;
    if (fa.facultyIds.length < need) v.understaffed++;
    const deptCount = {};
    for (const f of fa.facultyIds) {
      if (used.has(String(f))) v.doubleBooked++;
      used.add(String(f));
      const d = facultyById[String(f)]?.department;
      deptCount[d] = (deptCount[d] || 0) + 1;
    }
    if (Object.values(deptCount).some((n) => n > 2)) v.over2SameDept++;
  }
  return { v, used };
};

/** Largest number of duties any faculty has inside a 7-day window ([d-7, d]). */
const maxDutiesInAWeek = (dutyDatesByFaculty) => {
  let max = 0, who = '';
  for (const [f, dates] of Object.entries(dutyDatesByFaculty)) {
    for (const d of dates) {
      const end = new Date(d), start = new Date(d);
      start.setDate(start.getDate() - 7);
      const n = dates.filter((x) => new Date(x) >= start && new Date(x) <= end).length;
      if (n > max) { max = n; who = f; }
    }
  }
  return { max, who };
};

// ---------------- server lifecycle ----------------
const dropDb = async () => {
  const conn = await mongoose.createConnection(MONGO).asPromise();
  await conn.dropDatabase();
  await conn.close();
};

// Simulates a database created by an older version (see config/migrations.js)
const LEGACY_INDEX = 'subjectCode_1_department_1_examDate_1_session_1';
const withDb = async (fn) => {
  const conn = await mongoose.createConnection(MONGO).asPromise();
  try { return await fn(conn); } finally { await conn.close(); }
};
const seedLegacyIndex = () => withDb((c) => c.collection('internalexamdatas').createIndex(
  { subjectCode: 1, department: 1, examDate: 1, session: 1 }, { unique: true, name: LEGACY_INDEX }));
const hasLegacyIndex = () => withDb(async (c) => (await c.collection('internalexamdatas').indexes()).some((i) => i.name === LEGACY_INDEX && i.unique));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hall-harmony-api-test-'));
let server;
const startServer = async () => {
  server = spawn(process.execPath, [path.resolve(__dirname, '../src/server.js')], {
    cwd: tmp, // no .env here, and Anna auto-backups land in the temp dir
    env: {
      ...process.env,
      MONGO_URI: MONGO,
      PORT: String(PORT),
      JWT_SECRET: 'api-test-secret',
      NODE_ENV: 'test',
      SEED_ADMIN_USERNAME: ADMIN.username,
      SEED_ADMIN_PASSWORD: ADMIN.password,
      EMAIL_HOST: '127.0.0.1', EMAIL_PORT: '9', EMAIL_USER: '', EMAIL_PASS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok && log.includes('MongoDB Connected')) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start:\n${log}`);
};

// ================================================================
async function run() {
  // ---------------- AUTH ----------------
  section('Authentication & access control');
  let r = await api('POST', '/auth/seed');
  check('AUTH-01', 'Seed creates the first admin (non-production only)', r.status === 201, r.data?.message);
  r = await api('POST', '/auth/seed');
  check('AUTH-02', 'Seeding again is a no-op', r.status === 200, r.data?.message);
  const admin = await login(ADMIN.username.toUpperCase(), ADMIN.password);
  check('AUTH-03', 'Login is case-insensitive on username and returns a JWT', !!admin);
  r = await api('POST', '/auth/login', { body: { username: ADMIN.username, password: 'wrong' } });
  check('AUTH-04', 'Wrong password -> 401 with a generic message', r.status === 401, r.data?.message);
  r = await api('GET', '/halls');
  check('AUTH-05', 'Admin routes without a token -> 401', r.status === 401, r.data?.message);

  // ---------------- FACULTY ----------------
  section('Faculty accounts');
  const facultyRows = rows('03_Faculty.xlsx');
  let created = 0;
  for (const f of facultyRows) {
    r = await api('POST', '/users', { token: admin, body: { name: f.Name, username: f.Username, password: f.Password, role: 'faculty', department: f.Department, designation: f.Designation } });
    if (r.status === 201) created++;
  }
  check('FAC-01', `All ${facultyRows.length} valid faculty from 03_Faculty.xlsx are created`, created === facultyRows.length, `${created} created`);
  r = await api('POST', '/users', { token: admin, body: { name: 'Ramesh Kumar', username: 'facx01', password: 'x', role: 'faculty', department: 'CSE' } });
  check('FAC-02', 'Faculty name must be "<initial>. <name>"', r.status === 400, r.data?.message);
  r = await api('POST', '/users', { token: admin, body: { name: 'Z. Someone', username: 'fac001', password: 'x', role: 'faculty', department: 'CSE' } });
  check('FAC-03', 'Duplicate username (case-insensitive) is rejected', r.status === 400, r.data?.message);
  r = await api('POST', '/users', { token: admin, body: { name: facultyRows[1].Name, username: 'FACX09', password: 'x', role: 'faculty', department: 'CSE' } });
  check('FAC-04', 'Duplicate faculty name is rejected', r.status === 400, r.data?.message);
  r = await api('POST', '/users', { token: admin, body: { name: 'Z. Bad Designation', username: 'FACX02', password: 'x', role: 'faculty', department: 'CSE', designation: 'Lecturer' } });
  check('FAC-05', 'Designation outside the allowed list is rejected (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}: ${r.data?.message?.slice(0, 90)}`);
  const users = (await api('GET', '/users', { token: admin })).data;
  const faculty = users.filter((u) => u.role === 'faculty');
  const facultyById = Object.fromEntries(faculty.map((f) => [String(f._id), f]));
  check('FAC-06', 'Usernames of faculty created through the API are stored UPPERCASE', faculty.filter((f) => /^fac\d+$/i.test(f.username)).every((f) => f.username === f.username.toUpperCase()));
  const fac1 = faculty.find((f) => f.username === 'FAC002');
  const facToken = await login('fac002', 'faculty123');
  check('FAC-07', 'Faculty can log in', !!facToken);
  r = await api('GET', '/halls', { token: facToken });
  check('AUTH-06', 'Faculty token on an admin route -> 403', r.status === 403, r.data?.message);

  // ---------------- HALLS ----------------
  section('Halls');
  const hallRows = rows('01_Halls.xlsx').map((h) => ({ name: h.Name, rows: h.Rows, columns: h.Columns, seatsPerBench: h.SeatsPerBench, floor: h.Floor, facultyRequired: h.FacultyRequired }));
  r = await api('POST', '/halls/bulk-create', { token: admin, body: { halls: hallRows } });
  check('HALL-01', 'Bulk upload creates all 14 halls', r.data?.created === 14, `created ${r.data?.created}`);
  r = await api('POST', '/halls/bulk-create', { token: admin, body: { halls: hallRows.slice(0, 2) } });
  check('HALL-02', 'Hall names must be unique (bulk re-upload skipped)', r.data?.created === 0 && r.data?.errors?.length === 2, JSON.stringify(r.data?.errors?.[0]));
  r = await api('POST', '/halls/bulk-create', { token: admin, body: { halls: [{ name: 'Z001', rows: 4, columns: 4, seatsPerBench: 2 }] } });
  check('HALL-03', 'Bulk: name, rows, columns and floor are required', r.data?.created === 0, JSON.stringify(r.data?.errors?.[0]));
  r = await api('POST', '/halls', { token: admin, body: { name: 'DH9', rows: 4, columns: 4, seatsPerBench: 2, floor: 'Second Floor' } });
  check('HALL-04', 'Hall with "DH" in the name is forced to 1 seat per bench', r.status === 201 && r.data?.seatsPerBench === 1, `seatsPerBench ${r.data?.seatsPerBench}`);
  const dh9 = r.data;
  r = await api('PUT', `/halls/${dh9._id}`, { token: admin, body: { seatsPerBench: 3 } });
  check('HALL-05', 'Editing a DH hall keeps 1 seat per bench', r.data?.seatsPerBench === 1, `seatsPerBench ${r.data?.seatsPerBench}`);
  r = await api('POST', '/halls', { token: admin, body: { name: 'Z002', rows: 0, columns: 4, seatsPerBench: 2, floor: 'G' } });
  check('HALL-06', 'Rows / columns / seats per bench must be positive numbers', r.status === 400, r.data?.message);
  r = await api('POST', '/halls', { token: admin, body: { name: 'Z003', rows: '5', columns: 4, seatsPerBench: 2, floor: 'G' } });
  check('HALL-07', 'Numeric fields sent as text are rejected (single create)', r.status === 400, r.data?.message);
  r = await api('POST', '/halls', { token: admin, body: { name: 'A101', rows: 5, columns: 5, seatsPerBench: 2, floor: 'G' } });
  check('HALL-08', 'Single create rejects a duplicate hall name', r.status === 400, r.data?.message);
  await api('DELETE', `/halls/${dh9._id}`, { token: admin });
  const halls = (await api('GET', '/halls', { token: admin })).data;
  check('HALL-09', 'Delete hall removes it', !halls.some((h) => h.name === 'DH9'), `${halls.length} halls remain`);
  const hallsById = Object.fromEntries(halls.map((h) => [String(h._id), h]));

  // ---------------- STUDENTS ----------------
  section('Students');
  const studentRows = rows('02_Students.xlsx').map((s) => ({ name: s.Name, rollNumber: String(s['Roll Number']), email: '', password: 'student123', program: s.Program, degree: s.Year, department: s.Department }));
  r = await api('POST', '/student/bulk-create', { token: admin, body: { students: studentRows } });
  check('STU-01', `Bulk upload creates all ${studentRows.length} students`, r.data?.createdCount === studentRows.length, r.data?.message);
  r = await api('POST', '/student/bulk-create', { token: admin, body: { students: studentRows.slice(0, 3) } });
  check('STU-02', 'Existing roll numbers are skipped, not duplicated', r.data?.createdCount === 0 && r.data?.skippedCount === 3, r.data?.message);
  r = await api('POST', '/student/bulk-create', { token: admin, body: { students: [{ name: 'Lower Case', rollNumber: '  9127mba931 ', password: 'student123', program: 'MBA', degree: 'Year 1', department: 'MBA' }] } });
  const all = (await api('GET', '/student', { token: admin })).data;
  check('STU-03', 'Roll numbers are trimmed and stored UPPERCASE', all.some((s) => s.username === '9127MBA931'));
  check('STU-04', 'Student list never returns password hashes', all.every((s) => s.password === undefined));
  r = await api('POST', '/student/create-account', { token: admin, body: { name: 'No Password', rollNumber: 'X1' } });
  check('STU-05', 'Single create needs name, roll number and password', r.status === 400, r.data?.message);
  r = await api('POST', '/student/create-account', { token: admin, body: { name: 'Dup', rollNumber: studentRows[0].rollNumber.toLowerCase(), password: 'x', program: 'Engineering', degree: 'Year 1', department: 'CSE' } });
  check('STU-06', 'Single create rejects an existing roll number', r.status === 400, r.data?.message);
  const lower = all.find((s) => s.username === '9127MBA931');
  await api('DELETE', `/student/${lower._id}`, { token: admin });
  const roll0 = studentRows.find((s) => s.degree === 'Year 2' && s.department === 'CSE').rollNumber;
  const stuToken = await login(roll0, 'student123');
  check('STU-07', 'Students log in with roll number + default password student123', !!stuToken);
  r = await api('POST', '/student/change-password', { token: stuToken, body: { username: roll0, currentPassword: 'student123', newPassword: 'newpass1' } });
  check('STU-08', 'A logged-in student can change their own password', r.status === 200, `status ${r.status}: ${r.data?.message}`);
  const otherRoll = studentRows.find((s) => s.rollNumber !== roll0).rollNumber;
  r = await api('POST', '/student/change-password', { token: stuToken, body: { username: otherRoll, currentPassword: 'student123', newPassword: 'hacked1' } });
  check('STU-09', "A student cannot change another student's password", r.status === 403, `status ${r.status}: ${r.data?.message}`);
  r = await api('GET', `/student/${roll0}`);
  check('LOOK-01', 'Public lookup before anything is published -> 404', r.status === 404, r.data?.message);

  // ---------------- INTERNAL TIMETABLE ----------------
  section('Internal exams: timetable upload & automatic generation');
  r = await api('POST', '/internal-timetable/upload-timetable', { token: admin, body: { timetable: [{ subjectCode: 'X', examDate: '2026-10-05', session: 'Morning' }] } });
  check('TT-01', 'Session must be FN or AN - bad files are rejected before anything is deleted', r.status === 400, r.data?.error);
  r = await api('POST', '/internal-timetable/upload-timetable', { token: admin, file: '04_Internal_Timetable.xlsx' });
  check('TT-02', 'Timetable upload clears old plans and auto-generates every session', r.data?.success && r.data?.generation?.count === 10, r.data?.message);
  let sessions = (await api('GET', '/exam-sessions', { token: admin })).data;
  check('TT-03', 'FN sessions start 09:30 AM, AN sessions 01:30 PM (internal)', sessions.every((s) => s.examTime === (s.examSession === 'FN' ? '09:30 AM' : '01:30 PM')));
  let allSeated = true, ruleV = { benchMate: 0, horizontal: 0, vertical: 0, outOfBounds: 0, dhSecondSeat: 0, duplicates: 0 };
  let facV = { understaffed: 0, doubleBooked: 0, over2SameDept: 0 };
  const facBySession = {};
  for (const s of sessions) {
    const seats = (await api('GET', `/seating/all?examSessionId=${s._id}`, { token: admin })).data.assignments;
    const expected = s.examSession === 'FN' ? 280 : 160;
    if (seats.length !== expected) allSeated = false;
    const v = internalSeatViolations(seats, hallsById);
    for (const k in v) ruleV[k] += v[k];
    const withStudents = new Set(seats.map((a) => String(a.hallId)));
    const { v: fv, used } = facultyViolations(s.facultyAssignments, hallsById, facultyById, withStudents);
    for (const k in fv) facV[k] += fv[k];
    facBySession[`${s.examDate}_${s.examSession}`] = used;
  }
  check('TT-04', 'Every student with an exam in the session gets a seat (FN 280 / AN 160)', allSeated);
  check('SEAT-01', 'Bench-mates are from different departments', ruleV.benchMate === 0, `${ruleV.benchMate} violations`);
  check('SEAT-02', 'Side-by-side seats (across benches) are different departments', ruleV.horizontal === 0, `${ruleV.horizontal} violations`);
  check('SEAT-03', 'Front/back seats are different departments', ruleV.vertical === 0, `${ruleV.vertical} violations`);
  check('SEAT-04', 'Drawing halls (DH) use only seat 1 of each bench', ruleV.dhSecondSeat === 0, `${ruleV.dhSecondSeat} violations`);
  check('SEAT-05', 'Seats stay inside the hall grid; no student seated twice', ruleV.outOfBounds === 0 && ruleV.duplicates === 0, JSON.stringify(ruleV));
  check('FDUTY-01', 'Each hall with students gets its "Faculty Required" invigilators', facV.understaffed === 0, `${facV.understaffed} understaffed halls`);
  check('FDUTY-02', 'No invigilator is in two halls in the same session', facV.doubleBooked === 0, `${facV.doubleBooked}`);
  check('FDUTY-03', 'At most 2 invigilators from the same department per hall', facV.over2SameDept === 0, `${facV.over2SameDept}`);
  let overlap = 0;
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    const fn = facBySession[`${d}_FN`] || new Set();
    for (const f of facBySession[`${d}_AN`] || []) if (fn.has(f)) overlap++;
  }
  check('FDUTY-04', 'No invigilator gets both FN and AN on the same day (no continuous duty)', overlap === 0, `${overlap} faculty with FN+AN on the same day`);
  const internalDutyDates = {};
  for (const [key, ids] of Object.entries(facBySession)) for (const f of ids) (internalDutyDates[f] ??= []).push(key.split('_')[0]);
  const wk = maxDutiesInAWeek(internalDutyDates);
  check('FDUTY-05', 'At most 4 duties per invigilator in any 7 days', wk.max <= 4, `max ${wk.max} (${facultyById[wk.who]?.username || '-'})`);

  // manual mapping
  const mapRolls = rows('07_Manual_Map_Rolls.xlsx').map((x) => String(x['Roll Number']));
  r = await api('POST', '/internal-timetable/manual-map', { token: admin, body: { type: 'rollNumber', subjectCode: 'CS3399', examDate: '2026-10-12', session: 'FN', rollNumber: mapRolls.join(',') } });
  check('MAP-01', 'Manual map by roll numbers maps each known student', r.data?.mapped?.length === mapRolls.length, r.data?.message || `status ${r.status}: ${JSON.stringify(r.data).slice(0, 150)}`);
  r = await api('POST', '/internal-timetable/manual-map', { token: admin, body: { type: 'rollNumber', subjectCode: 'CS3399', examDate: '2026-10-12', session: 'FN', rollNumber: `${mapRolls[0]},999999999991` } });
  check('MAP-02', 'Unknown roll numbers are reported as a partial warning', !!r.data?.partialError, r.data?.partialError);
  r = await api('POST', '/internal-timetable/manual-map', { token: admin, body: { type: 'department', subjectCode: 'CS3399', examDate: '2026-10-12', session: 'FN', department: 'CSE' } });
  check('MAP-03', 'Department mapping needs both department and year', r.status === 400, r.data?.error);

  // ---------------- SESSION LIFECYCLE ----------------
  section('Session lifecycle: finalize, publish, lookup, absent, exports');
  sessions = (await api('GET', '/exam-sessions', { token: admin })).data;
  const fn5 = sessions.find((s) => s.examDate === '2026-10-05' && s.examSession === 'FN');
  r = await api('POST', '/exam-sessions', { token: admin, body: { examDate: '2026-10-05', examSession: 'FN', examTime: '09:30 AM' } });
  check('SES-01', 'Only one session per date + FN/AN', r.status === 400, r.data?.error);
  r = await api('GET', `/export/full-exam/${fn5._id}`, { token: admin });
  check('EXP-01', 'Export package needs a FINAL session', r.status === 400, r.data?.error);
  const fn5HallId = String((await api('GET', `/seating/all?examSessionId=${fn5._id}`, { token: admin })).data?.assignments?.[0]?.hallId);
  r = await api('GET', `/export/hall-layouts/${fn5._id}/${fn5HallId}`, { token: admin, raw: true });
  check('EXP-09', 'A single hall bench layout (Word) downloads, even before finalizing', r.status === 200 && /wordprocessingml/.test(r.type) && r.size > 1000, `${r.status} ${r.type} ${r.size} bytes`);
  r = await api('GET', `/export/hall-layouts/${fn5._id}`, { token: admin, raw: true });
  check('EXP-10', 'All hall bench layouts download together as a ZIP', r.status === 200 && /zip/.test(r.type) && r.size > 1000, `${r.status} ${r.type} ${r.size} bytes`);
  r = await api('GET', `/export/hall-layouts/${fn5._id}/${'0'.repeat(24)}`, { token: admin });
  check('EXP-11', 'A hall with no students in the session gives 404', r.status === 404, r.data?.error);
  r = await api('POST', '/seating/finalize', { token: admin, body: { examSessionId: fn5._id } });
  check('SES-02', 'Finalize marks the session FINAL', r.data?.status === 'FINAL');
  const duties = (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === '2026-10-05' && d.examSession === 'FN');
  const expectedDuties = fn5.facultyAssignments.reduce((n, fa) => n + fa.facultyIds.length, 0);
  check('SES-03', 'Finalize creates one duty record per assigned invigilator', duties.length === expectedDuties && duties.length > 0, `${duties.length}/${expectedDuties}`);
  r = await api('POST', '/seating/finalize', { token: admin, body: { examSessionId: fn5._id } });
  check('SES-04', 'Finalizing twice is rejected', r.status === 400, r.data?.error);
  r = await api('POST', '/seating/generate', { token: admin, body: { examSessionId: fn5._id } });
  check('SES-05', 'A FINAL session cannot be regenerated', r.status === 400, r.data?.message);
  r = await api('POST', '/seating/save', { token: admin, body: { examSessionId: fn5._id, hallId: halls[0]._id, assignments: [] } });
  check('SES-06', 'A FINAL session cannot be edited', r.status === 400, r.data?.error);
  r = await api('GET', `/export/full-exam/${fn5._id}`, { token: admin, raw: true });
  check('EXP-02', 'Full exam package (ZIP) downloads for a FINAL session', r.status === 200 && r.size > 1000, `${r.status} ${r.type} ${r.size} bytes`);
  r = await api('GET', `/export/full-exam/${fn5._id}`, { raw: true });
  check('EXP-03', 'Exports stay admin-only: a request with no token is refused', r.status === 401, `status ${r.status}`);
  const srcDir = path.resolve(__dirname, '../../src');
  const openers = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && /window\.open\([^)]*\/api\//.test(fs.readFileSync(p, 'utf8'))) openers.push(path.relative(srcDir, p));
  });
  walk(srcDir);
  check('EXP-07', 'Frontend never opens admin downloads with window.open (it cannot send the token)', openers.length === 0, openers.join(', ') || 'none');
  const cors = await fetch(`${API}/export/full-exam/${fn5._id}`, { headers: { Origin: 'http://localhost:8080', Authorization: `Bearer ${admin}` } });
  await cors.arrayBuffer();
  check('EXP-08', 'Server lets the browser read the download file name (Content-Disposition exposed)', /content-disposition/i.test(cors.headers.get('access-control-expose-headers') || ''), cors.headers.get('access-control-expose-headers'));
  const fnSeats = (await api('GET', `/seating/all?examSessionId=${fn5._id}`, { token: admin })).data.assignments;
  const mySeat = fnSeats[0];
  r = await api('GET', `/student/${mySeat.studentRollNumber.toLowerCase()}`);
  check('LOOK-02', 'Lookup hides FINAL-but-unpublished seats', r.status === 404, `status ${r.status}`);
  r = await api('PATCH', `/seating/mark-absent/${mySeat._id}`, { token: facToken, body: { isAbsent: true } });
  check('ABS-01', 'Absent marking only on published FINAL sessions', r.status === 400, r.data?.message);
  await api('PUT', `/exam-sessions/${fn5._id}`, { token: admin, body: { isPublished: true } });
  r = await api('GET', `/student/${mySeat.studentRollNumber.toLowerCase()}`);
  check('LOOK-03', 'After publishing, lookup (any case) shows hall, date and seat', r.status === 200 && r.data?.[0]?.hall, JSON.stringify(r.data?.[0])?.slice(0, 140));
  r = await api('PATCH', `/seating/mark-absent/${mySeat._id}`, { token: facToken, body: { isAbsent: true } });
  check('ABS-02', 'Faculty can mark a student absent on a published FINAL session', r.status === 200 && r.data?.isAbsent === true, r.data?.message);
  // A test-data faculty (password faculty123), not the built-in seed account
  const myDuty = duties.find((d) => /^FAC\d+$/.test(d.facultyId?.username || ''));
  r = await api('GET', `/seating/faculty/${myDuty.facultyId._id}`, { token: facToken });
  check('FDASH-01', 'Faculty dashboard lists the invigilator\'s duties', r.status === 200 && r.data.length >= 1, `${r.data?.length} duties`);

  // ---------------- DELEGATION ----------------
  section('Duty delegation');
  const requester = myDuty.facultyId;
  const fnUsed = facBySession['2026-10-05_FN'];
  const replacement = faculty.find((f) => !fnUsed.has(String(f._id)) && f.department === requester.department) || faculty.find((f) => !fnUsed.has(String(f._id)));
  const reqToken = await login(requester.username, 'faculty123');
  const repToken = await login(replacement.username, 'faculty123');
  r = await api('POST', '/delegation/request', { token: reqToken, body: { requestingFacultyId: requester._id, replacementFacultyId: replacement._id, examDate: '2026-10-05', examSession: 'FN', hallNumber: myDuty.hallId.name, reason: 'Test' } });
  const delegationCreateStatus = r.status;
  const reqs = (await api('GET', `/delegation/requests/${requester._id}`, { token: reqToken })).data;
  const dReq = reqs[0];
  check('DEL-01', 'Faculty can raise a delegation request (saved as Pending HOD Approval)', dReq?.status === 'Pending HOD Approval', `request saved: ${!!dReq}, HTTP ${delegationCreateStatus}`);
  check('DEL-02', 'Request creation succeeds even when the HOD email cannot be sent', delegationCreateStatus === 201, `HTTP ${delegationCreateStatus}`);
  // Email links carry a signed token scoped to one request + action (same secret as the test server)
  const link = (action) => `/delegation/${dReq._id}/${action}?t=${jwt.sign({ rid: String(dReq._id), action }, 'api-test-secret', { expiresIn: '7d' })}`;
  r = await api('GET', `/delegation/${dReq._id}/hod-approve`);
  check('DEL-07', 'Approve URL without a link token or login is refused', r.status === 401, `status ${r.status}`);
  r = await api('GET', link('hod-reject').replace('/hod-reject?', '/hod-approve?'));
  check('DEL-08', 'A link token only works for its own action (reject link cannot approve)', r.status === 401, `status ${r.status}`);
  r = await api('GET', link('hod-approve'));
  check('DEL-03', 'HOD approve link from the email works when clicked (no login token)', r.status === 200, `status ${r.status}`);
  const afterApprove = (await api('GET', `/delegation/requests/${requester._id}`, { token: reqToken })).data[0];
  check('DEL-04', 'HOD approval moves the request to Pending Faculty Response', afterApprove.status === 'Pending Faculty Response', afterApprove.status);
  r = await api('GET', link('hod-reject'));
  check('DEL-09', 'An approved request cannot be rejected afterwards (link reused)', r.status === 400, `status ${r.status}`);
  r = await api('GET', link('faculty-accept'));
  const movedDuty = (await api('GET', '/seating/duties/all', { token: admin })).data.find((d) => d._id === myDuty._id);
  check('DEL-05', 'When the replacement accepts, the duty moves to them', String(movedDuty?.facultyId?._id) === String(replacement._id), `${requester.username} -> ${movedDuty?.facultyId?.username}`);
  r = await api('GET', `/delegation/${dReq._id}/faculty-accept`, { token: repToken });
  check('DEL-06', 'An already-accepted request cannot be accepted again', r.status === 400, `status ${r.status}`);

  // ---------------- UNFINALIZE / MANUAL GENERATE ----------------
  section('Unfinalize & manual generation');
  r = await api('PUT', `/exam-sessions/${fn5._id}/unfinalize`, { token: admin });
  const leftDuties = (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === '2026-10-05' && d.examSession === 'FN');
  check('SES-07', 'Unfinalize returns to DRAFT, unpublishes and removes duties', r.data?.status === 'DRAFT' && r.data?.isPublished === false && leftDuties.length === 0, `duties left ${leftDuties.length}`);
  for (const f of faculty) await api('PUT', `/users/${f._id}`, { token: admin, body: { isSelectedForGeneration: true } });
  const an9 = sessions.find((s) => s.examDate === '2026-10-09' && s.examSession === 'AN');
  r = await api('POST', '/seating/generate', { token: admin, body: { examSessionId: an9._id, skipRollNumbers: ['NOPE123'] } });
  check('GEN-01', 'Manual generate rejects skip roll numbers that do not exist', r.status === 400, r.data?.message);
  r = await api('POST', '/seating/generate', { token: admin, body: { examSessionId: an9._id } });
  const manualSeats = (await api('GET', `/seating/all?examSessionId=${an9._id}`, { token: admin })).data.assignments;
  check('GEN-04', 'Manual "Generate" follows the timetable (only the 160 students with an exam in this session)', manualSeats.length === 160, `${manualSeats.length} seated, ${r.data?.unallocated?.length} unallocated`);
  const mv = internalSeatViolations(manualSeats, hallsById);
  check('GEN-03', 'Manual generate keeps all department adjacency rules', mv.benchMate + mv.horizontal + mv.vertical + mv.dhSecondSeat === 0, JSON.stringify(mv));
  // A hand-made session with no timetable rows seats every student (600 into 690 seats).
  // The adjacency rules can't use every seat, so some students can't be placed - they
  // must be reported as unallocated, never silently dropped.
  const handMade = (await api('POST', '/exam-sessions', { token: admin, body: { examDate: '2026-10-20', examSession: 'FN', examTime: '09:30 AM' } })).data;
  r = await api('POST', '/seating/generate', { token: admin, body: { examSessionId: handMade._id } });
  const handSeats = (await api('GET', `/seating/all?examSessionId=${handMade._id}`, { token: admin })).data.assignments;
  const handUnalloc = r.data?.unallocated?.length ?? 0;
  const studentTotal = all.length - 1; // one test student was deleted in STU checks
  check('GEN-02', 'Manual "Generate": every student is either seated or listed as unallocated (none silently dropped)', handSeats.length + handUnalloc === studentTotal, `${handSeats.length} seated + ${handUnalloc} unallocated of ${studentTotal}`);
  check('GEN-05', 'A session with no timetable rows still seats every selected student (manual sessions)', handSeats.length > 160, `${handSeats.length} seated`);
  const hv = internalSeatViolations(handSeats, hallsById);
  check('GEN-06', 'Adjacency rules hold even when halls are nearly full', hv.benchMate + hv.horizontal + hv.vertical + hv.dhSecondSeat + hv.duplicates === 0, JSON.stringify(hv));

  // ---------------- ANNA ----------------
  section('Anna University exams');
  r = await api('POST', '/anna/upload-students', { token: admin, file: '05_Anna_Students.xlsx' });
  check('ANNA-01', 'Arrear registrations upload (Roll Number, Subject Code, Department)', r.data?.count === 28, `count ${r.data?.count}`);
  r = await api('POST', '/anna/upload-timetable', { token: admin, file: '06_Anna_Timetable.xlsx' });
  check('ANNA-02', 'Timetable upload first asks for confirmation (shows what will be deleted)', r.data?.requiresConfirmation === true, r.data?.warning?.split('\n')[0]);
  // Finalize an internal session first: an Anna upload must not touch its duties
  const fn6 = sessions.find((s) => s.examDate === '2026-10-06' && s.examSession === 'FN');
  await api('POST', '/seating/finalize', { token: admin, body: { examSessionId: fn6._id } });
  const internalDutyCount = async () => (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === '2026-10-06' && d.examSession === 'FN').length;
  const fn6DutiesBefore = await internalDutyCount();
  r = await api('POST', '/anna/upload-timetable?confirmed=true', { token: admin, file: '06_Anna_Timetable.xlsx' });
  check('ANNA-03', 'Confirmed upload regenerates every Anna session', r.data?.generation?.count === 12, r.data?.message);
  const fn6DutiesAfter = await internalDutyCount();
  check('XMOD-01', "Uploading the Anna timetable keeps the internal planner's finalized duties", fn6DutiesBefore > 0 && fn6DutiesAfter === fn6DutiesBefore, `${fn6DutiesBefore} before, ${fn6DutiesAfter} after`);
  const plans = (await api('GET', '/anna/seating-plans', { token: admin })).data;
  const annaV = { sameDept: 0, sameSubject: 0, overHallMax: 0, dhSecondSeat: 0, duplicates: 0 };
  const annaFac = {};
  let annaFacV = { understaffed: 0, doubleBooked: 0, over2SameDept: 0 };
  for (const p of plans) {
    const v = annaSeatViolations(p, hallsById);
    for (const k in v) annaV[k] += v[k];
    const { v: fv, used } = facultyViolations(p.facultyAssignments, hallsById, facultyById, new Set(p.assignments.map((a) => String(a.hallId))));
    for (const k in fv) annaFacV[k] += fv[k];
    annaFac[`${p.examDate}_${p.session}`] = used;
  }
  check('ANNA-SEAT-01', 'No two neighbours (L/R/front/back) from the same department', annaV.sameDept === 0, `${annaV.sameDept} violations`);
  check('ANNA-SEAT-02', 'No two neighbours writing the same subject code', annaV.sameSubject === 0, `${annaV.sameSubject} violations`);
  check('ANNA-SEAT-03', 'At most 25 students per hall', annaV.overHallMax === 0, `${annaV.overHallMax} halls over`);
  check('ANNA-SEAT-04', 'Drawing halls (DH) use only seat 1 of each bench', annaV.dhSecondSeat === 0, `${annaV.dhSecondSeat} students on seat 2 of a DH bench`);
  check('ANNA-SEAT-05', 'No student seated twice in a session', annaV.duplicates === 0);
  check('ANNA-FAC-01', 'Every hall gets its required invigilators; none double-booked', annaFacV.understaffed === 0 && annaFacV.doubleBooked === 0, JSON.stringify(annaFacV));
  let annaOverlap = 0;
  for (const p of plans.filter((x) => x.session === 'AN')) {
    const fn = annaFac[`${p.examDate}_FN`] || new Set();
    for (const f of annaFac[`${p.examDate}_AN`]) if (fn.has(f)) annaOverlap++;
  }
  check('ANNA-FAC-02', 'No invigilator gets both FN and AN on the same day', annaOverlap === 0, `${annaOverlap} FN+AN same-day duties`);
  const annaDutyDates = {};
  for (const [key, ids] of Object.entries(annaFac)) for (const f of ids) (annaDutyDates[f] ??= []).push(key.split('_')[0]);
  const annaWk = maxDutiesInAWeek(annaDutyDates);
  check('ANNA-FAC-03', 'At most 4 duties per invigilator in any 7 days', annaWk.max <= 4, `max ${annaWk.max} (${facultyById[annaWk.who]?.username || '-'})`);
  const anPlan = plans.find((p) => p.examDate === '2026-11-18' && p.session === 'AN');
  r = await api('POST', '/anna/update-status', { token: admin, body: { examDate: anPlan.examDate, session: 'AN', status: 'FINAL', isPublished: true } });
  const annaDuties = (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === anPlan.examDate && d.examSession === 'AN');
  check('ANNA-04', 'Finalizing an Anna plan creates the invigilator duties', annaDuties.length > 0, `${annaDuties.length} duties`);
  r = await api('POST', '/anna/update-status', { token: admin, body: { examDate: anPlan.examDate, session: 'AN', status: 'FINAL' } });
  check('ANNA-05', 'Finalizing an already-final Anna plan does not fail', r.status === 200, `status ${r.status}: ${String(r.data?.error || '').slice(0, 80)}`);
  const annaDutyCount = async () => (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === anPlan.examDate && d.examSession === 'AN').length;
  await api('POST', '/anna/update-status', { token: admin, body: { examDate: anPlan.examDate, session: 'AN', status: 'DRAFT' } });
  const afterDraft = await annaDutyCount();
  await api('POST', '/anna/update-status', { token: admin, body: { examDate: anPlan.examDate, session: 'AN', status: 'FINAL', isPublished: true } });
  const afterRefinal = await annaDutyCount();
  check('ANNA-07', 'Back to DRAFT removes the duties; finalizing again recreates them once', afterDraft === 0 && afterRefinal === annaDuties.length, `${annaDuties.length} -> ${afterDraft} -> ${afterRefinal}`);
  const annaStudent = anPlan.assignments[0].rollNumber;
  r = await api('GET', `/student/${annaStudent}`);
  const annaResult = (r.data || []).find?.((x) => x.type === 'Anna University');
  check('LOOK-04', 'Published Anna seat appears in lookup with the AN start time (02:00 PM)', annaResult?.time === '02:00 PM', `time shown: ${annaResult?.time}`);
  r = await api('GET', `/anna/export-consolidated/${anPlan.examDate}/AN`, { token: admin, raw: true });
  check('EXP-04', 'Anna consolidated PDF downloads', r.status === 200 && r.type.includes('pdf'), `${r.status} ${r.size} bytes`);
  r = await api('GET', `/anna/export-layouts/${anPlan.examDate}/AN`, { token: admin, raw: true });
  check('EXP-05', 'Anna hall layouts (Word) download', r.status === 200 && r.type.includes('word'), `${r.status} ${r.size} bytes`);
  r = await api('GET', `/anna/export-package/${anPlan.examDate}/AN`, { token: admin, raw: true });
  check('EXP-06', 'Anna full package (ZIP) downloads', r.status === 200 && r.size > 1000, `${r.status} ${r.type} ${r.size} bytes`);
  r = await api('DELETE', `/anna/seating-plan/${anPlan._id}`, { token: admin });
  const annaDutiesAfter = (await api('GET', '/seating/duties/all', { token: admin })).data.filter((d) => d.examDate === anPlan.examDate && d.examSession === 'AN');
  check('ANNA-06', 'Deleting an Anna plan removes its duties', r.data?.success && annaDutiesAfter.length === 0);

  // ---------------- SETTINGS ----------------
  section('Settings');
  r = await api('GET', '/settings', { token: admin });
  check('SET-01', 'Settings have institution defaults', !!r.data?.institutionName, r.data?.institutionName);
  r = await api('PUT', '/settings', { token: admin, body: { examName: 'IAT - III' } });
  check('SET-02', 'Admin can update settings', r.data?.examName === 'IAT - III');
}

// ================================================================
let exitCode = 0;
try {
  await dropDb();
  await seedLegacyIndex();
  await startServer();
  section('Startup migration');
  let legacyGone = false; // the migration runs right after the "connected" log line
  for (let i = 0; i < 20 && !(legacyGone = !(await hasLegacyIndex())); i++) await new Promise((r) => setTimeout(r, 250));
  check('MIG-01', 'Startup drops the old unique index that blocked multi-student manual mapping', legacyGone);
  await run();
} catch (e) {
  console.error('\nTest run aborted:', e);
  exitCode = 1;
} finally {
  server?.kill();
  await dropDb().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (process.env.RESULTS_FILE) fs.writeFileSync(process.env.RESULTS_FILE, JSON.stringify(results, null, 2));
process.exit(failed.length || exitCode ? 1 : 0);
