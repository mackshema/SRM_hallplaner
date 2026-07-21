/**
 * Cross-check: Which roll numbers have seats but no user account,
 * and which users have no seats?
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function crossCheck() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db('exam_hall_allotment');

    const seatCol = db.collection('seatassignments');
    const users = db.collection('users');

    // All unique roll numbers in seat assignments
    const allSeats = await seatCol.find({}).toArray();
    const rollsWithSeats = [...new Set(allSeats.map(s => s.studentRollNumber))].filter(Boolean).sort();

    // All student usernames (roll numbers)
    const studentUsers = await users.find({ role: 'student' }, { projection: { username: 1, name: 1 }}).toArray();
    const studentUsernames = studentUsers.map(u => u.username);

    console.log('=== CROSS-CHECK REPORT ===\n');
    console.log(`🪑 Total unique roll numbers IN seat assignments: ${rollsWithSeats.length}`);
    console.log(`👤 Total student USER accounts: ${studentUsers.length}\n`);

    // Rolls with seats but NO user account
    const rollsWithSeatsNoAccount = rollsWithSeats.filter(r => !studentUsernames.includes(r));
    console.log(`❌ Roll numbers WITH seats but NO user account: ${rollsWithSeatsNoAccount.length}`);
    rollsWithSeatsNoAccount.forEach(r => console.log(`   "${r}"`));

    // Rolls with user account but NO seats
    const usersNoSeats = studentUsernames.filter(r => !rollsWithSeats.includes(r));
    console.log(`\n⚠️  Student user accounts with NO seats: ${usersNoSeats.length}`);
    usersNoSeats.slice(0, 10).forEach(r => {
      const u = studentUsers.find(u => u.username === r);
      console.log(`   "${r}" (${u?.name})`);
    });

    // Rolls with BOTH seats AND user account
    const matched = rollsWithSeats.filter(r => studentUsernames.includes(r));
    console.log(`\n✅ Roll numbers with BOTH seats AND user account: ${matched.length}`);
    matched.forEach(r => console.log(`   "${r}"`));

    // Sessions summary
    const sessions = db.collection('examsessions');
    const finalPublished = await sessions.find({ status: 'FINAL', isPublished: true }).toArray();
    console.log(`\n📋 Published FINAL sessions: ${finalPublished.length}`);
    finalPublished.forEach(s => {
      const seatsForThis = allSeats.filter(seat => String(seat.examSessionId) === String(s._id));
      console.log(`   ${s.examDate} ${s.examSession} → ${seatsForThis.length} seats`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

crossCheck();
