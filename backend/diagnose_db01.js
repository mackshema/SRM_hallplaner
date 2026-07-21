/**
 * DB-01 Diagnostic: Investigate why students get "No assignment found"
 * even though the FINAL session is published.
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function diagnose() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('exam_hall_allotment');

    // 1. All exam sessions
    const sessions = db.collection('examsessions');
    const allSessions = await sessions.find({}).toArray();
    console.log(`📋 ALL ExamSessions (${allSessions.length} total):`);
    allSessions.forEach(s => {
      console.log(`  ID: ${s._id} | status: ${s.status} | isPublished: ${s.isPublished} | examDate: ${s.examDate} | examSession: ${s.examSession}`);
    });

    // 2. Seat assignments
    const seatCol = db.collection('seatassignments');
    const seatCount = await seatCol.countDocuments();
    console.log(`\n📦 SeatAssignment count: ${seatCount}`);

    // Sample a few seat assignments to check their structure
    const sampleSeats = await seatCol.find({}).limit(5).toArray();
    console.log('\n🪑 Sample SeatAssignments:');
    sampleSeats.forEach(s => {
      console.log(JSON.stringify(s, null, 2));
    });

    // 3. Get distinct roll numbers in seat assignments
    const rollNos = await seatCol.distinct('rollNumber');
    console.log(`\n👥 Unique roll numbers with seats: ${rollNos.length}`);
    console.log('First 5:', rollNos.slice(0, 5));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

diagnose();
