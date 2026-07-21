/**
 * DB-01 Deep Diagnostic: Check roll number format mismatches
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function deepDiagnose() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('exam_hall_allotment');

    // 1. Get all seat assignments with studentRollNumber
    const seatCol = db.collection('seatassignments');
    const allSeats = await seatCol.find({}).toArray();
    console.log(`📦 Total SeatAssignments: ${allSeats.length}`);
    
    // Check field names
    if (allSeats.length > 0) {
      console.log('\n🔑 Fields in first seat assignment:', Object.keys(allSeats[0]));
      
      // Get all unique roll number values
      const rollNums = [...new Set(allSeats.map(s => s.studentRollNumber))].filter(Boolean);
      console.log(`\n👥 Unique studentRollNumber values: ${rollNums.length}`);
      rollNums.slice(0, 10).forEach(r => console.log(`  "${r}"`));
    }

    // 2. Check the FINAL session seats specifically
    const finalSeats = allSeats.filter(s => s.examDate === '2026-05-09' && s.examSession === 'FN');
    console.log(`\n📅 Seats for 2026-05-09 FN: ${finalSeats.length}`);
    finalSeats.slice(0, 5).forEach(s => {
      console.log(`  Roll: "${s.studentRollNumber}" | Row: ${s.row} | Col: ${s.column}`);
    });

    // 3. Check the Users collection for students (for roll number format comparison)
    const users = db.collection('users');
    const studentUsers = await users.find({ role: 'student' }).limit(10).toArray();
    console.log(`\n👤 Student Users (sample ${studentUsers.length}):`);
    studentUsers.forEach(u => {
      console.log(`  username: "${u.username}" | name: "${u.name}"`);
    });

    // 4. Check ExamSession model fields
    const sessions = db.collection('examsessions');
    const finalSession = await sessions.findOne({ status: 'FINAL' });
    console.log('\n📋 FINAL ExamSession document:');
    console.log(JSON.stringify(finalSession, null, 2));

    // 5. Check if the populate works (examSessionId reference)
    // Check first seat's examSessionId vs actual FINAL session id
    if (finalSeats.length > 0) {
      const firstSeat = finalSeats[0];
      console.log(`\n🔗 First FINAL seat examSessionId: "${firstSeat.examSessionId}"`);
      console.log(`   FINAL session _id: "${finalSession._id}"`);
      console.log(`   Match: ${String(firstSeat.examSessionId) === String(finalSession._id)}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

deepDiagnose();
