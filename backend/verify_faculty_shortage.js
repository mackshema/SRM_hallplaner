import mongoose from 'mongoose';
import User from './src/models/User.js';
import Hall from './src/models/Hall.js';
import ExamSession from './src/models/ExamSession.js';
import SeatAssignment from './src/models/SeatAssignment.js';
import AnnaSeating from './src/models/AnnaSeating.js';
import AnnaExamData from './src/models/AnnaExamData.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017/exam_hall_allotment';
const API_URL = 'http://localhost:5000/api';

async function test() {
  let originalFaculty = [];
  let testHalls = [];
  let testStudents = [];
  let testExamSession = null;
  let testAnnaExamData = [];
  let createdFacultyIds = [];

  try {
    console.log("Connecting to Database...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected successfully!");

    console.log("1. Logging in as admin...");
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'SRM@Admin',
        password: 'Admin@12345678'
      })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    const token = loginData.token;
    console.log("Logged in successfully.");

    // Backup existing faculty and disable them to ensure tight control of faculty count
    originalFaculty = await User.find({ role: 'faculty' }).lean();
    console.log(`Backed up ${originalFaculty.length} existing faculty members.`);
    await User.updateMany({ role: 'faculty' }, { $set: { role: 'faculty-temp-disabled' } });
    console.log("Temporarily disabled existing faculty.");

    // Seed 1 active faculty
    const initialFaculty = new User({
      name: 'T. Testfaculty',
      username: 'fac_tester',
      role: 'faculty',
      department: 'CSE',
      password: 'password123',
      designation: 'Assistant Professor',
      facultyEmail: 'fac_tester@institution.edu',
      hodEmail: 'hod.cse@institution.edu'
    });
    await initialFaculty.save();
    createdFacultyIds.push(initialFaculty._id.toString());
    console.log("Seeded initial faculty: T. Testfaculty");

    // Seed test students
    const student1 = new User({
      name: 'Student One',
      username: '911123104001',
      role: 'student',
      password: 'password123',
      department: 'CSE',
      degree: 'Year 1',
      isSelected: true
    });
    const student2 = new User({
      name: 'Student Two',
      username: '911123104002',
      role: 'student',
      password: 'password123',
      department: 'CSE',
      degree: 'Year 1',
      isSelected: true
    });
    await student1.save();
    await student2.save();
    testStudents.push(student1, student2);
    console.log("Seeded 2 test students.");

    // Seed 2 test halls with facultyRequired = 2 each (Total 4 required)
    const hall1 = new Hall({
      name: 'TEST-LH-1',
      rows: 2,
      columns: 2,
      seatsPerBench: 2,
      facultyRequired: 2,
      isSelected: true
    });
    const hall2 = new Hall({
      name: 'TEST-LH-2',
      rows: 2,
      columns: 2,
      seatsPerBench: 2,
      facultyRequired: 2,
      isSelected: true
    });
    await hall1.save();
    await hall2.save();
    testHalls.push(hall1, hall2);
    console.log("Seeded 2 test halls (TEST-LH-1, TEST-LH-2) requiring 2 faculty each.");

    // ==========================================
    // ENGINE A: INTERNAL EXAM SHORTAGE TEST
    // ==========================================
    console.log("\n--- TESTING ENGINE A (INTERNAL EXAM) ---");

    // Create an Exam Session
    testExamSession = new ExamSession({
      examDate: '2026-07-20',
      examSession: 'FN',
      examTime: '09:30 AM',
      status: 'DRAFT',
      isPublished: false,
      activeHalls: [hall1._id, hall2._id],
      activeDepartments: ['CSE']
    });
    await testExamSession.save();
    console.log("Created DRAFT Exam Session for Engine A.");

    // Call generate-seating
    console.log("Generating seating for Engine A session...");
    const genARes = await fetch(`${API_URL}/seating/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        examSessionId: testExamSession._id,
        departments: []
      })
    });
    const genAData = await genARes.json();
    console.log("Engine A Seating Response:", JSON.stringify(genAData, null, 2));

    if (!genAData.success) {
      throw new Error(`Engine A seating generation failed: ${JSON.stringify(genAData)}`);
    }
    if (!genAData.allocationResult || genAData.allocationResult.shortage !== true) {
      throw new Error("Expected Engine A to return shortage: true");
    }
    console.log("✅ Engine A correctly reported faculty shortage!");

    // Simulate instant faculty creation
    console.log("Instantly creating 3 additional faculty members via API...");
    const newFacultyList = [
      { name: 'A. Newfac', username: 'fac_new_a', department: 'CSE' },
      { name: 'B. Newfac', username: 'fac_new_b', department: 'CSE' },
      { name: 'C. Newfac', username: 'fac_new_c', department: 'CSE' }
    ];

    for (const f of newFacultyList) {
      const createRes = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...f,
          role: 'faculty',
          password: 'password123',
          designation: 'Assistant Professor',
          facultyEmail: `${f.username}@institution.edu`,
          hodEmail: `hod.${f.department.toLowerCase()}@institution.edu`
        })
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(`Failed to create faculty: ${JSON.stringify(createData)}`);
      }
      createdFacultyIds.push(createData._id || createData.id);
      console.log(`Created faculty: ${createData.name} (${createData._id || createData.id})`);
    }

    // Re-run Engine A generation applying demand overrides
    console.log("Re-generating Engine A with demand overrides...");
    const genAOverRes = await fetch(`${API_URL}/seating/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        examSessionId: testExamSession._id,
        departments: [],
        demandFacultyIds: createdFacultyIds
      })
    });
    const genAOverData = await genAOverRes.json();
    console.log("Engine A Demand Response:", JSON.stringify(genAOverData, null, 2));

    if (!genAOverData.success) {
      throw new Error(`Engine A demand seating generation failed: ${JSON.stringify(genAOverData)}`);
    }
    if (genAOverData.allocationResult && genAOverData.allocationResult.shortage === true) {
      throw new Error("Expected Engine A shortage to be resolved after applying demand");
    }
    console.log("✅ Engine A shortage successfully resolved with demand overrides!");


    // ==========================================
    // ENGINE B: ANNA UNIVERSITY SHORTAGE TEST
    // ==========================================
    console.log("\n--- TESTING ENGINE B (ANNA UNIVERSITY EXAM) ---");

    // Seed subject mapping
    const subjectMap = new AnnaExamData({
      subjectCode: 'CS301',
      examDate: '2026-07-20',
      session: 'FN',
      department: 'CSE',
      year: 'Year 1'
    });
    await subjectMap.save();
    testAnnaExamData.push(subjectMap);
    console.log("Seeded Anna Exam subject mapping.");

    // First disable the 3 new faculty to simulate shortage again in Engine B
    const toDisable = createdFacultyIds.filter(id => id !== initialFaculty._id.toString());
    await User.updateMany({ _id: { $in: toDisable } }, { $set: { role: 'faculty-temp-disabled' } });
    console.log("Disabled new faculty members to simulate shortage in Engine B.");

    // Run Engine B seating generation
    console.log("Generating seating for Engine B...");
    const genBRes = await fetch(`${API_URL}/anna/generate-seating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        examDate: '2026-07-20',
        session: 'FN',
        maxPerHall: 25,
        seatsPerBench: 2
      })
    });
    const genBData = await genBRes.json();
    console.log("Engine B Seating Response:", JSON.stringify(genBData, null, 2));

    if (!genBData.success) {
      throw new Error(`Engine B seating generation failed: ${JSON.stringify(genBData)}`);
    }
    if (!genBData.allocationResult || genBData.allocationResult.shortage !== true) {
      throw new Error("Expected Engine B to report shortage: true");
    }
    console.log("✅ Engine B correctly reported faculty shortage!");

    // Re-enable faculty
    await User.updateMany({ _id: { $in: toDisable } }, { $set: { role: 'faculty' } });
    console.log("Re-enabled new faculty members.");

    // Re-run Engine B with demand overrides
    console.log("Re-generating Engine B with demand overrides...");
    const genBOverRes = await fetch(`${API_URL}/anna/generate-seating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        examDate: '2026-07-20',
        session: 'FN',
        maxPerHall: 25,
        seatsPerBench: 2,
        demandFacultyIds: createdFacultyIds
      })
    });
    const genBOverData = await genBOverRes.json();
    console.log("Engine B Demand Response:", JSON.stringify(genBOverData, null, 2));

    if (!genBOverData.success) {
      throw new Error(`Engine B demand seating generation failed: ${JSON.stringify(genBOverData)}`);
    }
    if (genBOverData.allocationResult && genBOverData.allocationResult.shortage === true) {
      throw new Error("Expected Engine B shortage to be resolved after applying demand");
    }
    console.log("✅ Engine B shortage successfully resolved with demand overrides!");

    console.log("\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉");

  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exitCode = 1;
  } finally {
    // Cleanup created test data
    console.log("\nCleaning up test documents...");
    if (testExamSession) {
      await ExamSession.deleteOne({ _id: testExamSession._id });
      await SeatAssignment.deleteMany({ examSessionId: testExamSession._id });
    }
    for (const id of createdFacultyIds) {
      await User.deleteOne({ _id: id });
    }
    for (const student of testStudents) {
      await User.deleteOne({ _id: student._id });
    }
    for (const hall of testHalls) {
      await Hall.deleteOne({ _id: hall._id });
    }
    for (const mapping of testAnnaExamData) {
      await AnnaExamData.deleteOne({ _id: mapping._id });
    }
    await AnnaSeating.deleteMany({ examDate: '2026-07-20', session: 'FN' });

    // Restore original faculty
    await User.updateMany({ role: 'faculty-temp-disabled' }, { $set: { role: 'faculty' } });
    console.log("Restored all original faculty members.");
    console.log("Cleanup finished.");

    await mongoose.disconnect();
  }
}

test();
