/**
 * DB-02 Step 1: Find students with missing department or degree.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function findMissingDept() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('exam_hall_allotment');
    const users = db.collection('users');

    const affected = await users.find(
      {
        role: 'student',
        $or: [
          { department: null },
          { department: '' },
          { department: { $exists: false } },
        ],
      },
      { projection: { name: 1, username: 1, department: 1, degree: 1, program: 1 } }
    ).toArray();

    console.log(`\n🔍 Students with missing department: ${affected.length}`);
    affected.forEach(s => {
      console.log(JSON.stringify({ _id: s._id, name: s.name, username: s.username, department: s.department, degree: s.degree, program: s.program }, null, 2));
    });

    // Also report total students for reference
    const total = await users.countDocuments({ role: 'student' });
    console.log(`\n📊 Total student accounts: ${total}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

findMissingDept();
