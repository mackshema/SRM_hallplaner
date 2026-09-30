/**
 * Creates faculty accounts from an Excel sheet through the real API
 * (POST /api/users), so the same validation as the Faculty page is applied.
 *
 *   cd backend && node scripts/seed_test_faculty.js [file.xlsx]
 *
 * Defaults to ../test-data/03_Faculty.xlsx. The backend must be running.
 * Logs in with SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD from backend/.env
 * (override with ADMIN_USER / ADMIN_PASS). API_URL defaults to http://localhost:5000.
 */
import 'dotenv/config';
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.resolve(__dirname, '../../test-data/03_Faculty.xlsx');
const API = process.env.API_URL || 'http://localhost:5000';
const username = process.env.ADMIN_USER || process.env.SEED_ADMIN_USERNAME;
const password = process.env.ADMIN_PASS || process.env.SEED_ADMIN_PASSWORD;

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (!loginRes.ok) {
  console.error(`Admin login failed (${loginRes.status}). Is the backend running at ${API} and are the admin credentials correct?`);
  process.exit(1);
}
const { token } = await loginRes.json();

const wb = xlsx.readFile(file);
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
console.log(`Creating ${rows.length} faculty from ${path.basename(file)}`);

let created = 0;
for (const row of rows) {
  const res = await fetch(`${API}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: row['Name'],
      username: String(row['Username'] ?? ''),
      password: String(row['Password'] ?? 'faculty123'),
      role: 'faculty',
      department: row['Department'],
      designation: row['Designation'] || '',
      facultyEmail: row['Faculty Email'] || undefined,
      hodEmail: row['HOD Email'] || undefined,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    created++;
    console.log(`  OK    ${row['Username']}  ${row['Name']}`);
  } else {
    console.log(`  FAIL  ${row['Username']}  ${row['Name']}  -> ${res.status} ${body.message || ''}`);
  }
}
console.log(`Done: ${created} created, ${rows.length - created} rejected.`);
