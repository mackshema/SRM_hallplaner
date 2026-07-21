import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const API = 'http://localhost:5000';

async function time(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  const t1 = performance.now();
  const ms = Math.round(t1 - t0);
  console.log(`[${ms.toString().padStart(6)} ms] ${label}`);
  return { ms, result };
}

console.log('\n=== LIVE BASELINE TIMINGS — Antigrivity ===\n');

// 1. GET /api/halls
await time('GET /api/halls (all 14 halls)', async () => {
  const r = await fetch(`${API}/api/halls`);
  return r.json();
});

// 2. GET /api/users (all 40 users)
await time('GET /api/users (all 40 users incl passwords)', async () => {
  const r = await fetch(`${API}/api/users`);
  return r.json();
});

// 3. GET /api/exam-sessions
await time('GET /api/exam-sessions (6 sessions)', async () => {
  const r = await fetch(`${API}/api/exam-sessions`);
  return r.json();
});

// 4. GET /api/seating/all (38 seat assignments)
await time('GET /api/seating/all (38 seat records)', async () => {
  const r = await fetch(`${API}/api/seating/all`);
  return r.json();
});

// 5. GET /api/seating/duties/all
await time('GET /api/seating/duties/all (5 duties)', async () => {
  const r = await fetch(`${API}/api/seating/duties/all`);
  return r.json();
});

// 6. GET /api/anna/seating-plans
await time('GET /api/anna/seating-plans (5 plans, 35 assignments)', async () => {
  const r = await fetch(`${API}/api/anna/seating-plans`);
  return r.json();
});

// 7. GET /api/settings
await time('GET /api/settings (with base64 logos)', async () => {
  const r = await fetch(`${API}/api/settings`);
  const d = await r.json();
  const logoSize = ((d.leftLogo || '').length + (d.rightLogo || '').length);
  console.log(`           [logo payload: ${Math.round(logoSize / 1024)} KB]`);
  return d;
});

// 8. GET /api/halls/all-exam-dates
await time('GET /api/halls/all-exam-dates (combined 11 entries)', async () => {
  const r = await fetch(`${API}/api/halls/all-exam-dates`);
  return r.json();
});

// 9. POST /api/seating/generate — THE HEAVY ONE
// First get the DRAFT session id
const sessRes = await fetch(`${API}/api/exam-sessions`);
const sessions = await sessRes.json();
const draftSession = sessions.find(s => s.status === 'DRAFT');

if (draftSession) {
  await time(`POST /api/seating/generate (session: ${draftSession.examDate} ${draftSession.examSession})`, async () => {
    const r = await fetch(`${API}/api/seating/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examSessionId: draftSession._id })
    });
    return r.json();
  });
} else {
  console.log('[  SKIP  ] POST /api/seating/generate — no DRAFT session available');
}

// 10. GET /api/export/full-exam/:id — HEAVIEST export
const finalSession = sessions.find(s => s.status === 'FINAL');
if (finalSession) {
  await time(`GET /api/export/full-exam/:id (docx+pdf+zip for FINAL session)`, async () => {
    const r = await fetch(`${API}/api/export/full-exam/${finalSession._id}`);
    const buf = await r.arrayBuffer();
    console.log(`           [zip size: ${Math.round(buf.byteLength / 1024)} KB]`);
    return buf.byteLength;
  });
}

// 11. GET /api/student/:rollNumber
await time('GET /api/student/CSE001 (student lookup)', async () => {
  const r = await fetch(`${API}/api/student/CSE001`);
  return r.json();
});

// 12. Repeated login — brute force baseline
console.log('\n--- Login latency (5 attempts) ---');
for (let i = 0; i < 5; i++) {
  await time(`POST /api/auth/login (attempt ${i+1})`, async () => {
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SRM@Admin', password: 'Admin@12345678' })
    });
    return r.json();
  });
}

// 13. System info
console.log('\n--- Infrastructure probe ---');
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/exam_hall_allotment');
const db = mongoose.connection.db;
const serverStatus = await db.command({ serverStatus: 1 });
console.log(`MongoDB version    : ${serverStatus.version}`);
console.log(`Uptime             : ${Math.round(serverStatus.uptime / 60)} minutes`);
console.log(`Connections current: ${serverStatus.connections.current}`);
console.log(`Connections avail  : ${serverStatus.connections.available}`);
console.log(`Mem resident (MB)  : ${serverStatus.mem?.resident || 'N/A'}`);
console.log(`Mem virtual (MB)   : ${serverStatus.mem?.virtual || 'N/A'}`);
console.log(`Opcounters         : ${JSON.stringify(serverStatus.opcounters)}`);
const collStats = await db.command({ dbStats: 1 });
console.log(`DB dataSize (KB)   : ${Math.round(collStats.dataSize / 1024)}`);
console.log(`DB storageSize (KB): ${Math.round(collStats.storageSize / 1024)}`);
console.log(`DB indexSize (KB)  : ${Math.round(collStats.indexSize / 1024)}`);
console.log(`DB collections     : ${collStats.collections}`);
await mongoose.disconnect();

console.log('\n=== PROBE COMPLETE ===');
