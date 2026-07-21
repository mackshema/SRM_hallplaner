/**
 * DB-02 Full Audit: Check all students for any missing required fields.
 * Also checks isSelected flag used by the seating engine.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';

async function fullAudit() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('exam_hall_allotment');
    const users = db.collection('users');

    // Fetch ALL students with all relevant fields
    const students = await users.find(
      { role: 'student' },
      { projection: { name: 1, username: 1, department: 1, degree: 1, program: 1, isSelected: 1 } }
    ).toArray();

    console.log(`\n📊 Total student accounts: ${students.length}`);
    console.log('\n=== FULL STUDENT AUDIT ===');

    const issues = [];
    students.forEach(s => {
      const flags = [];
      if (!s.department)   flags.push('❌ missing department');
      if (!s.degree)       flags.push('❌ missing degree');
      if (!s.program)      flags.push('❌ missing program');
      if (s.isSelected === false || s.isSelected === undefined) flags.push('⚠️  isSelected=false/undefined');

      const status = flags.length ? flags.join(', ') : '✅ OK';
      console.log(`  [${s.username}] ${s.name} | dept="${s.department}" | deg="${s.degree}" | prog="${s.program}" | isSelected=${s.isSelected} → ${status}`);

      if (flags.some(f => f.startsWith('❌'))) {
        issues.push({ username: s.username, name: s.name, department: s.department, degree: s.degree, program: s.program, flags });
      }
    });

    console.log(`\n📋 Students with missing required fields: ${issues.length}`);
    if (issues.length > 0) {
      issues.forEach(i => console.log(JSON.stringify(i, null, 2)));
    } else {
      console.log('   ✅ All students have department, degree, and program set.');
    }

    // isSelected audit
    const notSelected = students.filter(s => !s.isSelected);
    console.log(`\n⚠️  Students with isSelected != true: ${notSelected.length}`);
    notSelected.forEach(s => console.log(`   [${s.username}] ${s.name} isSelected=${s.isSelected}`));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

fullAudit();
