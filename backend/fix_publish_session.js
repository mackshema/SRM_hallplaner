/**
 * DB-01 Fix: Publish the FINAL exam session so students can see seat assignments.
 * This ONLY sets isPublished=true on the FINAL session — no data is modified.
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function fixPublishSession() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('exam_hall_allotment');
    const sessions = db.collection('examsessions');

    // Step 1: Find all FINAL sessions (for diagnosis)
    const finalSessions = await sessions.find({ status: 'FINAL' }).toArray();
    console.log(`\n📋 Found ${finalSessions.length} FINAL session(s):`);
    finalSessions.forEach(s => {
      console.log(`  - ID: ${s._id}  |  examDate: ${s.examDate}  |  examSession: ${s.examSession}  |  isPublished: ${s.isPublished}`);
    });

    if (finalSessions.length === 0) {
      console.log('\n❌ No FINAL sessions found. Nothing to fix.');
      return;
    }

    // Step 2: Publish all unpublished FINAL sessions
    const unpublished = finalSessions.filter(s => !s.isPublished);
    console.log(`\n🔍 Unpublished FINAL sessions: ${unpublished.length}`);

    if (unpublished.length === 0) {
      console.log('✅ All FINAL sessions are already published. No fix needed.');
      return;
    }

    const result = await sessions.updateMany(
      { status: 'FINAL', isPublished: { $ne: true } },
      { $set: { isPublished: true } }
    );

    console.log(`\n✅ FIX APPLIED:`);
    console.log(`   Matched:  ${result.matchedCount}`);
    console.log(`   Modified: ${result.modifiedCount}`);

    // Step 3: Verify
    const verified = await sessions.find({ status: 'FINAL' }, { projection: { examDate: 1, examSession: 1, status: 1, isPublished: 1 } }).toArray();
    console.log('\n📋 Verification — FINAL sessions after fix:');
    verified.forEach(s => {
      const icon = s.isPublished ? '✅' : '❌';
      console.log(`  ${icon} ${s._id}  |  examDate: ${s.examDate}  |  examSession: ${s.examSession}  |  isPublished: ${s.isPublished}`);
    });

    // Step 4: Count seat assignments for confidence
    const seatAssignments = db.collection('seatassignments');
    const seatCount = await seatAssignments.countDocuments();
    console.log(`\n📦 Total SeatAssignments in DB: ${seatCount}`);
    console.log('\n🎉 Fix complete. Students should now be able to see their seat assignments on /student');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

fixPublishSession();
