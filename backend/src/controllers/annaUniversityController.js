import xlsx from 'xlsx';
import AnnaExamData from '../models/AnnaExamData.js';
import AnnaSeating from '../models/AnnaSeating.js';
import Hall from '../models/Hall.js';
import User from '../models/User.js';
import FacultyDuty from '../models/FacultyDuty.js';
import { exec } from 'child_process';
import path from 'path';
import { mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'fs';

const autoBackup = () => new Promise(resolve => {
  const dir = path.join(process.cwd(), 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `auto-${ts}`);
  exec(`mongodump --db exam_hall_allotment --out "${dest}"`, err => {
    if (err) console.warn('[BACKUP] Failed (non-blocking):', err.message);
    else console.log('[BACKUP] Created:', dest);
    // Keep only last 5 auto-backups
    try {
      const backups = readdirSync(dir)
        .filter(f => f.startsWith('auto-'))
        .map(f => ({ name: f, time: statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      backups.slice(5).forEach(b => rmSync(path.join(dir, b.name), { recursive: true }));
    } catch(e) {}
    resolve();
  });
});

// AL-02: Resolves exam time from session type.
// If an explicit time string is provided (e.g. from timetable upload), use it.
// Otherwise fall back to standard SRMMCET slot times.
const resolveExamTime = (session, providedTime) => {
  if (providedTime && providedTime.trim() !== '') {
    return providedTime.trim();
  }
  return session === 'FN' ? '09:30 AM' : '02:00 PM';
};

const getDateDaysAgo = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

const runFacultyAllocation = async (examDate, session, hallsWithStudents, demandFacultyIdsInput = []) => {
  const demandFacultyIds = (demandFacultyIdsInput || []).map(id => id.toString());

  // 1. Fetch all eligible faculty
  const allFaculty = await User.find({ role: "faculty" }).lean();

  // 2. Fetch recent duties for constraint checking (last 7 days)
  const sevenDaysAgo = getDateDaysAgo(examDate, 7);
  const recentDuties = await FacultyDuty.find({
    examDate: { $gte: sevenDaysAgo, $lte: examDate }
  }).select('facultyId examDate examSession').lean();

  // Determine previous session
  let previousSession = null;
  if (session === "AN") {
    previousSession = { examDate, session: "FN" };
  } else {
    // Find the closest previous date in AnnaSeating
    const prevSeatingDoc = await AnnaSeating.findOne({ examDate: { $lt: examDate } }).sort({ examDate: -1, session: -1 });
    if (prevSeatingDoc) {
      previousSession = { examDate: prevSeatingDoc.examDate, session: prevSeatingDoc.session };
    }
  }

  // Build lookup Set for previous session duties
  const prevSessionKey = previousSession ? `${previousSession.examDate}_${previousSession.session}` : null;
  const prevSessionFacultySet = new Set(
    prevSessionKey
      ? recentDuties
          .filter(d => `${d.examDate}_${d.examSession}` === prevSessionKey)
          .map(d => d.facultyId.toString())
      : []
  );

  // Hard Constraint lookup: Same Session Duplicate
  const sameSessionKey = `${examDate}_${session}`;
  const sameSessionFacultySet = new Set(
    recentDuties
      .filter(d => `${d.examDate}_${d.examSession}` === sameSessionKey)
      .map(d => d.facultyId.toString())
  );

  // Count duties per faculty in last 7 days for Weekly Limit
  const weeklyDutyCount = {};
  recentDuties.forEach(d => {
    const id = d.facultyId.toString();
    weeklyDutyCount[id] = (weeklyDutyCount[id] || 0) + 1;
  });

  // Helper to check constraints
  const isFacultyAvailable = (faculty, hall, currentAssignments) => {
    const fId = faculty._id.toString();
    const isDemand = demandFacultyIds.includes(fId);

    // 1. Already assigned to this hall (in current batch)
    if (currentAssignments.includes(fId)) return false;

    // 2. Department Cap: Max 2 from same dept per hall
    const sameDeptCount = currentAssignments.filter(id => {
      const f = allFaculty.find(fac => fac._id.toString() === id);
      return f && f.department === faculty.department;
    }).length;
    if (sameDeptCount >= 2 && !isDemand) return false;

    // 3. Same Session Duplicate (HARD CONSTRAINT)
    if (sameSessionFacultySet.has(fId)) return false;

    // 4. No Continuous Participation (Unless Demand)
    if (prevSessionFacultySet.has(fId) && !isDemand) return false;

    // 5. Weekly Limit: Max 4 duties (Unless Demand)
    if (!isDemand) {
      const count = weeklyDutyCount[fId] || 0;
      if (count >= 4) return false;
    }

    return true;
  };

  // Shuffle faculty for randomization
  let shuffledFaculty = [...allFaculty];
  for (let i = shuffledFaculty.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledFaculty[i], shuffledFaculty[j]] = [shuffledFaculty[j], shuffledFaculty[i]];
  }

  const facultyAssignments = [];
  const globalAssignedIds = new Set();
  const allocationWarnings = [];
  let shortage = false;

  for (const hallId of hallsWithStudents) {
    const hall = await Hall.findById(hallId).lean();
    if (!hall) continue;

    const required = hall.facultyRequired || 1;
    const hallAssignedIds = [];

    for (let i = 0; i < required; i++) {
      let selected = null;
      for (const faculty of shuffledFaculty) {
        const fId = faculty._id.toString();
        if (globalAssignedIds.has(fId)) continue;

        if (isFacultyAvailable(faculty, hall, hallAssignedIds)) {
          selected = faculty;
          break;
        }
      }

      if (selected) {
        const fId = selected._id.toString();
        hallAssignedIds.push(fId);
        globalAssignedIds.add(fId);
      } else {
        shortage = true;
        allocationWarnings.push(`Hall ${hall.name}: Could not find enough faculty (Need ${required}, got ${hallAssignedIds.length})`);
      }
    }

    facultyAssignments.push({
      hallId: hall._id,
      facultyIds: hallAssignedIds
    });
  }

  // Suggest all faculty who are free in this session (ignoring soft limits like continuous/weekly caps)
  let facultySuggestions = [];
  if (shortage) {
    facultySuggestions = allFaculty
      .filter(f => !globalAssignedIds.has(f._id.toString())) // Not already assigned in this generation run
      .filter(f => !sameSessionFacultySet.has(f._id.toString())) // No duplicate duty in this same session
      .map(f => ({ id: f._id, name: f.name, department: f.department }));
  }

  return {
    facultyAssignments,
    shortage,
    allocationWarnings,
    facultySuggestions
  };
};

export const getExamData = async (req, res) => {
  try {
    const data = await AnnaExamData.find({});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      // Manual input handling
      if (req.body.students) {
        const result = await AnnaExamData.insertMany(req.body.students);
        return res.json({ success: true, inserted: result.length });
      }
      return res.status(400).json({ error: 'No file or manual array provided' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // expected columns: Roll Number, Subject Code, Department
    const formattedData = data.map(row => {
      // Trying to be robust with column names
      const roll = row['Roll Number'] || row['Roll No'] || row['rollNumber'] || row['roll_no'];
      const sub = row['Subject Code'] || row['subjectCode'] || row['subject_code'];
      const dept = row['Department'] || row['department'];
      const name = row['Student Name'] || row['studentName'] || '';

      if (!roll || !sub || !dept) return null;

      return {
        rollNumber: String(roll).trim(),
        subjectCode: String(sub).trim(),
        department: String(dept).trim(),
        studentName: String(name).trim()
      };
    }).filter(Boolean);

    if (formattedData.length === 0) {
      return res.status(400).json({ error: 'Invalid file format or missing required columns (Roll Number, Subject Code, Department)' });
    }

    // Upsert or insert many
    for (const d of formattedData) {
      // Find if we already have a timetable date for this subject code
      const existingTimetable = await AnnaExamData.findOne({ 
        subjectCode: { $regex: new RegExp(`^${d.subjectCode}$`, 'i') }, 
        examDate: { $ne: "" } 
      });
      
      if (existingTimetable) {
        d.examDate = existingTimetable.examDate;
        d.session = existingTimetable.session;
      }

      await AnnaExamData.findOneAndUpdate(
        { rollNumber: d.rollNumber, subjectCode: d.subjectCode },
        d,
        { upsert: true }
      );
    }

    res.json({ success: true, count: formattedData.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const uploadTimetableRaw = async (req, res) => {
  try {
    const { textData } = req.body;
    if (!textData) return res.status(400).json({ error: "Missing text data" });

    // Very basic heuristic for OCR: Look for lines with alphanumeric subject codes
    const lines = textData.split('\n');
    let matchedSubjects = 0;

    // NEW: Clear existing dates before applying new timetable
    await AnnaExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    for (const line of lines) {
      const parts = line.split(/\s+/).filter(Boolean);
      // We assume an OCR line might look like: "CS101 2024-05-15 FN ComputerScience"
      if (parts.length >= 3) {
        let subjectCode = parts[0];
        let examDate = parts[1];
        let session = parts[2];
        let department = parts.slice(3).join(' ') || "Unknown"; // optional department

        // Only save if session is exactly FN or AN
        if (session === "FN" || session === "AN" || session.includes("FN") || session.includes("AN")) {
           session = session.includes("FN") ? "FN" : "AN";
           await AnnaExamData.updateMany(
             { subjectCode },
             { $set: { examDate, session, department } },
             { upsert: true } // Need to create so we know which department has which subject code!
           );
           matchedSubjects++;
        }
      }
    }
    // NEW: Clear old plans as requested by user
    await AnnaSeating.deleteMany({});
    await FacultyDuty.deleteMany({});

    // Automatically trigger fresh generation
    const generationResult = await runAnnaGeneration();

    res.json({ 
      success: true, 
      updatedSubjects: matchedSubjects,
      generation: generationResult,
      message: `Anna University timetable updated. Old plans cleared. ${generationResult.count} sessions generated automatically.` 
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

export const uploadTimetable = async (req, res) => {
  try {
    // SAFETY GATE — prevent accidental data destruction
    if (req.query.confirmed !== 'true') {
      const annaCount = await AnnaSeating.countDocuments();
      const dutyCount = await FacultyDuty.countDocuments();
      return res.status(200).json({
        requiresConfirmation: true,
        warning: [
          'Uploading a new timetable will permanently delete:',
          `  • ${annaCount} Anna seating plan(s)`,
          `  • ${dutyCount} faculty duty record(s)`,
          'This action cannot be undone.',
          'Pass ?confirmed=true to proceed.'
        ].join('\n'),
        annaPlansCount: annaCount,
        facultyDutiesCount: dutyCount
      });
    }

    // Run auto-backup before destructive operations
    await autoBackup();

    let updates = [];
    if (!req.file) {
      if (!req.body.timetable) {
         return res.status(400).json({ error: 'No file or manual timetable provided' });
      }
      updates = req.body.timetable;
    } else {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      updates = data.map(row => {
        const sub = row['Subject Code'] || row['subjectCode'];
        let dat = row['Date'] || row['date'] || row['examDate'];
        const ses = row['Session'] || row['session'];
        const dept = row['Department'] || row['department'];
        const year = row['Year'] || row['year'] || row['Degree'] || row['degree'];
        
        if (!sub || !dat || !ses) return null;

        // Excel parses dates as serial numbers (e.g., 46152 for May 10, 2026)
        if (typeof dat === 'number') {
            const parsedDate = new Date(Math.round((dat - 25569) * 86400 * 1000));
            dat = parsedDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
        }
        return {
          subjectCode: String(sub).trim(),
          examDate: String(dat).trim(),
          session: String(ses).trim(),
          department: dept ? String(dept).trim() : null,
          year: year ? String(year).trim() : ""
        };
      }).filter(Boolean);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Invalid timetable data provided' });
    }

    // NEW: Clear existing dates before applying new timetable
    await AnnaExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    // Update ExamData with these dates (upsert so we store the active map for the session)
    // Update ExamData with these dates
    let matchedCount = 0;
    for (const u of updates) {
      // Use case-insensitive regex for subject code matching
      const result = await AnnaExamData.updateMany(
        { subjectCode: { $regex: new RegExp(`^${u.subjectCode}$`, 'i') } },
        { $set: { examDate: u.examDate, session: u.session, department: u.department || "Unknown", year: u.year || "" } }
      );
      
      // If NO existing student records were found, we still need to create the generic mapping entry
      // This ensures the row shows up in the "Timetable Feed" table in the UI
      if (result.matchedCount === 0) {
        await AnnaExamData.updateOne(
          { subjectCode: u.subjectCode, rollNumber: { $exists: false } },
          { $set: { examDate: u.examDate, session: u.session, department: u.department || "Unknown", year: u.year || "" } },
          { upsert: true }
        );
      }
      matchedCount++;
    }

    // NEW: Clear old plans as requested by user
    await AnnaSeating.deleteMany({});
    await FacultyDuty.deleteMany({});

    // Automatically trigger fresh generation
    const generationResult = await runAnnaGeneration();

    res.json({ 
      success: true, 
      updatedSubjects: matchedCount,
      generation: generationResult,
      message: `Anna University timetable updated. Old plans cleared. ${generationResult.count} sessions generated automatically.` 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const manualMapSubject = async (req, res) => {
  try {
    const { subjectCode, examDate, session, type, program, year, department, rollNumber } = req.body;
    
    if (!subjectCode || !examDate || !session || !type) {
      return res.status(400).json({ error: "Missing required fields for manual mapping." });
    }

    if (type === 'department') {
      if (!department || !year) return res.status(400).json({ error: "Department and Year are required." });
      
      await AnnaExamData.updateOne(
        { subjectCode, department, year, examDate, session },
        { $set: { subjectCode, department, year, examDate, session, rollNumber: "" } },
        { upsert: true }
      );
      return res.json({ success: true, message: `Mapped ${subjectCode} for generic department ${department} (${year}).` });
      
    } else if (type === 'rollNumber') {
      if (!rollNumber) return res.status(400).json({ error: "Roll Number is required." });
      
      const rollNumbersArray = typeof rollNumber === 'string' 
          ? rollNumber.split(',').map(r => r.trim()).filter(Boolean)
          : Array.isArray(rollNumber) ? rollNumber : [rollNumber];
          
      if (rollNumbersArray.length === 0) return res.status(400).json({ error: "No valid roll numbers provided." });

      const missingRolls = [];
      const successfulMappings = [];
      
      for (const r of rollNumbersArray) {
        const student = await User.findOne({ username: r, role: 'student' });
        if (!student) {
          missingRolls.push(r);
          continue;
        }
        
        await AnnaExamData.updateOne(
          { subjectCode, rollNumber: r, examDate, session },
          { $set: { subjectCode, rollNumber: r, examDate, session, department: student.department || "Unknown", year: student.degree || "", studentName: student.name } },
          { upsert: true }
        );
        successfulMappings.push({ rollNumber: r, name: student.name, year: student.degree, department: student.department });
      }
      
      if (missingRolls.length > 0) {
         if (successfulMappings.length === 0) {
             return res.status(404).json({ error: `The following roll numbers are not in the database: ${missingRolls.join(', ')}` });
         } else {
             return res.status(200).json({ 
                 success: true,
                 partialError: `Successfully mapped ${successfulMappings.length} students. WARNING: The following roll numbers are not in database: ${missingRolls.join(', ')}`,
                 mapped: successfulMappings
             });
         }
      }
      
      return res.json({ success: true, message: `Mapped ${subjectCode} for ${successfulMappings.length} student(s).`, mapped: successfulMappings });
    } else {
      return res.status(400).json({ error: "Invalid mapping type." });
    }
  } catch (err) {
    console.error("Error in manual map:", err);
    res.status(500).json({ error: err.message });
  }
};

export const generateAnnaSeating = async (req, res) => {
  try {
    const { examDate, session, maxPerHall = 25, seatsPerBench: spb = 2 } = req.body;

    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }

    // Find out which Subject Codes are scheduled for this Date and Session
    const scheduledSubjects = await AnnaExamData.find({ examDate, session }).lean();
    if (scheduledSubjects.length === 0) {
      return res.status(400).json({ error: "No timetable mappings found for this Date and Session." });
    }

    // Attempt to match global students to these subjects based on Department mapping in Timetable.
    const allStudents = await User.find({ role: 'student' }).lean();
    if(allStudents.length === 0) {
      return res.status(400).json({ error: "No students exist in the main database." });
    }

    const students = [];
    for (const user of allStudents) {
      // Check if student has explicit rollNumber mapping for this date/session
      let mappedSubject = scheduledSubjects.find(sub => sub.rollNumber === user.username);
      
      // Otherwise, check if their department and year has a global subject arranged
      if (!mappedSubject) {
        mappedSubject = scheduledSubjects.find(sub => 
            sub.department === user.department && 
            sub.year === user.degree &&
            !sub.rollNumber // ensure it's a generic map
        );
      }
      
      if (mappedSubject) {
        students.push({
          rollNumber: user.username,
          studentName: user.name,
          department: user.department,
          subjectCode: mappedSubject.subjectCode
        });
      }
    }

    if (students.length === 0) {
      return res.status(400).json({ error: "No students in the database matched the Departments scheduled for this exam." });
    }

    // Sort students basically by Subject Code and Department to group effectively, then strictly by Roll Number
    students.sort((a, b) => {
      if (a.subjectCode < b.subjectCode) return -1;
      if (a.subjectCode > b.subjectCode) return 1;
      
      const numA = parseInt(a.rollNumber.replace(/\D/g, ''));
      const numB = parseInt(b.rollNumber.replace(/\D/g, ''));
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
      
      return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
    });

    // Get Active Halls (currently selected)
    const halls = await Hall.find({ isSelected: true }).lean();
    if (halls.length === 0) {
      return res.status(400).json({ error: "No halls selected for generation" });
    }

    // Randomize Hall Filling Order
    const startIndex = Math.floor(Math.random() * halls.length);
    const orderedHalls = [
      ...halls.slice(startIndex),
      ...halls.slice(0, startIndex),
    ];

    const allAssignments = [];
    let studentQueue = [...students];
    const seatWarnings = []; // AL-03: silent warning collector

    // Delete existing plan mapping for this date/session to overwrite
    await AnnaSeating.deleteMany({ examDate, session });

    for (const hall of orderedHalls) {
      if (studentQueue.length === 0) break;

      const assignmentInHall = [];
      let capacityUsed = 0;
      
      const hallMax = Math.min(
        maxPerHall,
        hall.rows * hall.columns * (req.body.seatsPerBench || spb)
      );

      // We maintain a 2D grid to check adjacencies.
      // Y = row (0 to rows-1)
      // X = col * seatsPerBench + benchPos (0 to cols*seatsPerBench-1)
      const grid = Array(hall.rows).fill(null).map(() => 
        Array(hall.columns * spb).fill(null)
      );

      // Attempt to place students (Vertical)
      /**
       * TRAVERSAL ORDER: Column-first (deliberate design decision)
       *
       * Anna University seating fills each column completely
       * before moving to the next column. This ensures:
       *  - Students with the same subject code are spread
       *    across rows of the same column (easier invigilation)
       *  - Column-wise visual checking during the exam
       *
       * Layout result example (3 cols, 4 rows):
       *   Col 1 full → Col 2 full → Col 3 full
       *   [A][B][C]   (not row-by-row)
       *   [A][B][C]
       *   [A][B][ ]   (last col may be partially filled)
       *
       * DO NOT change to row-first without updating
       * the seating chart PDF layout template accordingly.
       *
       * If row-first is ever needed, set:
       *   TRAVERSAL_MODE = 'ROW_FIRST'
       * and restructure the loops below.
       */
      const TRAVERSAL_MODE = 'COLUMN_FIRST'; // intentional — see comment above // eslint-disable-line no-unused-vars
      for (let c = 0; c < hall.columns; c++) {
        for (let p = 0; p < spb; p++) {
          
          for (let r = 0; r < hall.rows; r++) {
            if (capacityUsed >= hallMax) break;

            const gridX = c * spb + p;
            const gridY = r;

            // Find a valid student
            let placed = false;
            for (let q = 0; q < studentQueue.length; q++) {
              const candidate = studentQueue[q];
              const candDept = candidate.department;
              const candSubj = candidate.subjectCode;

              /**
               * Anna University adjacency rules (stricter than Engine A):
               * Rule 1: Adjacent seats (L/R/U/D) cannot share same DEPARTMENT
               * Rule 2: Adjacent seats (L/R/U/D) cannot share same SUBJECT CODE
               *
               * Engine A only checks DEPARTMENT (not subject code).
               * Engine B checks BOTH — because Anna exams have students
               * from the same dept sitting DIFFERENT subjects, so
               * subject-level separation is needed to prevent copying.
               */
              // Check Adjacency
              const checkAdjacency = () => {
                const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Left, Right, Up, Down
                for (const [dy, dx] of dirs) {
                  const ny = gridY + dy;
                  const nx = gridX + dx;
                  if (ny >= 0 && ny < hall.rows && nx >= 0 && nx < hall.columns * spb) {
                    const neighbor = grid[ny][nx];
                    if (neighbor) {
                       // Rule: no same department, or same exam sit together
                       if (neighbor.department === candDept) return true;
                       if (neighbor.subjectCode === candSubj) return true;
                    }
                  }
                }
                return false;
              };

              if (!checkAdjacency()) {
                // Place this student
                grid[gridY][gridX] = candidate;
                studentQueue.splice(q, 1);
                
                assignmentInHall.push({
                  hallId: hall._id,
                  hallName: hall.name,
                  row: r + 1,
                  column: c + 1,
                  benchPosition: p + 1,
                  rollNumber: candidate.rollNumber,
                  subjectCode: candidate.subjectCode,
                  department: candidate.department
                });
                
                capacityUsed++;
                placed = true;
                break;
              }
            }
            if (!placed && studentQueue.length > 0) {
              console.log("Could not satisfy constraint for seat", r, c, p);
              // AL-03: record the deadlocked seat
              seatWarnings.push({
                type: 'SEAT_EMPTY',
                hall: hall.name,
                row: r + 1,
                col: c + 1,
                benchPos: p + 1,
                message: `Seat [${r+1},${c+1},pos${p+1}] in ${hall.name} could not be filled — constraint deadlock`
              });
            }
          }
        }
      }

      if (assignmentInHall.length > 0) {
        allAssignments.push(...assignmentInHall);
      }
    }

    if (studentQueue.length > 0) {
      return res.status(400).json({ 
        error: `Unable to satisfy seating constraints or insufficient hall capacity. ${studentQueue.length} students left unassigned.` 
      });
    }

    // Allocate faculty
    const hallsWithStudents = [...new Set(allAssignments.map(a => a.hallId.toString()))];
    const demandFacultyIds = req.body.demandFacultyIds || [];
    const facultyAllocationResult = await runFacultyAllocation(examDate, session, hallsWithStudents, demandFacultyIds);

    // Save Seating
    const newSeating = new AnnaSeating({
      examDate,
      session,
      assignments: allAssignments,
      facultyAssignments: facultyAllocationResult.facultyAssignments
    });
    
    try {
      await newSeating.save();
    } catch(err) {
      if (err.code === 11000) {
        return res.status(400).json({
          message: `A seating plan for ${examDate} ${session} already exists. Delete it first before regenerating.`
        });
      }
      throw err;
    }

    res.json({
      success: true,
      count: allAssignments.length,
      warnings: seatWarnings,           // AL-03: seat deadlock warnings
      warningCount: seatWarnings.length, // AL-03: convenience count
      allocationResult: {
        shortage: facultyAllocationResult.shortage,
        warnings: facultyAllocationResult.allocationWarnings,
        suggestions: facultyAllocationResult.facultySuggestions
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getAllSeatingPlans = async (req, res) => {
  try {
    const plans = await AnnaSeating.find({}).sort({ examDate: 1, session: 1 });
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getSeatingPlan = async (req, res) => {
  try {
    const { examDate, session } = req.query;
    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }
    const plan = await AnnaSeating.findOne({ examDate, session });
    res.json(plan || { assignments: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { examDate, session, status, isPublished } = req.body;
    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }
    const updatePayload = {};
    if (status !== undefined) updatePayload.status = status;
    if (isPublished !== undefined) updatePayload.isPublished = isPublished;
    
    const plan = await AnnaSeating.findOneAndUpdate(
      { examDate, session },
      { $set: updatePayload },
      { new: true }
    );
    
    // If finalizing, create FacultyDuties for dashboard
    if (status === "FINAL" && plan) {
       const newDuties = [];
       const faMap = new Map(
         (plan.facultyAssignments || []).map(fa => [fa.hallId.toString(), fa.facultyIds])
       );

       const hallIds = [...new Set(plan.assignments.map(a => a.hallId.toString()))];
       for (const hId of hallIds) {
         const assignedFaculty = faMap.get(hId) || [];
         if (assignedFaculty.length > 0) {
           for (const fId of assignedFaculty) {
             newDuties.push({
               facultyId: fId,
               hallId: hId,
               examDate,
               examSession: session,
               examTime: resolveExamTime(session, null) // AL-02: session-aware time
             });

             await User.findByIdAndUpdate(fId, {
               lastDutyDate: new Date(),
             });
           }
         }
       }
       if (newDuties.length > 0) {
         await FacultyDuty.insertMany(newDuties);
       }
    }

    if (!plan) return res.status(404).json({ error: "Seating plan not found" });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const deleteSeatingPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await AnnaSeating.findByIdAndDelete(id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Also remove associated faculty duties if they were finalized
    await FacultyDuty.deleteMany({ examDate: plan.examDate, examSession: plan.session });

    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (err) {
    console.error("Error deleting plan:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Internal helper to run the full generation logic for Anna University Exams.
 */
async function runAnnaGeneration(maxPerHall = 25, spb = 2, demandFacultyIds = []) {
  const scheduledSubjects = await AnnaExamData.find({ 
    examDate: { $exists: true, $ne: "" }, 
    session: { $exists: true, $ne: "" } 
  }).lean();
  
  if (scheduledSubjects.length === 0) return { count: 0, message: "No mappings found" };

  const uniqueSessions = [];
  scheduledSubjects.forEach(s => {
     if (!uniqueSessions.find(u => u.examDate === s.examDate && u.session === s.session)) {
          uniqueSessions.push({ examDate: s.examDate, session: s.session });
     }
  });

  const allStudents = await User.find({ role: 'student' }).lean();
  if(allStudents.length === 0) return { count: 0, message: "No students exist" };

  const halls = await Hall.find({ isSelected: true }).lean();
  if (halls.length === 0) return { count: 0, message: "No halls selected" };

  let generatedCount = 0;
  let skippedCount = 0;
  let globalAllocationWarnings = [];
  let hasShortage = false;
  const allAssignedFacultyIds = new Set();

  for (const { examDate, session } of uniqueSessions) {
     const existing = await AnnaSeating.findOne({ examDate, session });
     if (existing) {
        skippedCount++;
        continue; 
     }

     const activeSubjects = scheduledSubjects.filter(sub => sub.examDate === examDate && sub.session === session);
     
     const students = [];
     for (const user of allStudents) {
       let mappedSubject = activeSubjects.find(sub => sub.rollNumber === user.username);
       if (!mappedSubject) {
         mappedSubject = activeSubjects.find(sub => 
             sub.department === user.department && 
             sub.year === user.degree &&
             !sub.rollNumber 
         );
       }
       if (mappedSubject) {
         students.push({
           rollNumber: user.username,
           studentName: user.name,
           department: user.department,
           subjectCode: mappedSubject.subjectCode
         });
       }
     }

     if (students.length === 0) continue; 

     students.sort((a, b) => {
       if (a.subjectCode < b.subjectCode) return -1;
       if (a.subjectCode > b.subjectCode) return 1;
       const numA = parseInt(a.rollNumber.replace(/\D/g, ''));
       const numB = parseInt(b.rollNumber.replace(/\D/g, ''));
       if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
       return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
     });

     const allAssignments = [];
     let studentQueue = [...students];
     const sessionSeatWarnings = []; // AL-03
     const startIndex = Math.floor(Math.random() * halls.length);
     const orderedHalls = [...halls.slice(startIndex), ...halls.slice(0, startIndex)];

     for (const hall of orderedHalls) {
       if (studentQueue.length === 0) break;
       const assignmentInHall = [];
       let capacityUsed = 0;
       const hallMax = Math.min(maxPerHall, hall.rows * hall.columns * spb);
       const grid = Array(hall.rows).fill(null).map(() => Array(hall.columns * spb).fill(null));

        /**
         * TRAVERSAL ORDER: Column-first.
         * TRAVERSAL_MODE = 'COLUMN_FIRST' — intentional.
         */
        for (let c = 0; c < hall.columns; c++) {
         for (let p = 0; p < spb; p++) {
           for (let r = 0; r < hall.rows; r++) {
             if (capacityUsed >= hallMax) break;
             const gridX = c * spb + p;
             const gridY = r;

             let placed = false;
             for (let q = 0; q < studentQueue.length; q++) {
               const candidate = studentQueue[q];
               const candDept = candidate.department;
               const candSubj = candidate.subjectCode;

               const checkAdjacency = () => {
                 const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; 
                 for (const [dy, dx] of dirs) {
                   const ny = gridY + dy;
                   const nx = gridX + dx;
                   if (ny >= 0 && ny < hall.rows && nx >= 0 && nx < hall.columns * spb) {
                     const neighbor = grid[ny][nx];
                     if (neighbor) {
                        if (neighbor.department === candDept) return true;
                        if (neighbor.subjectCode === candSubj) return true;
                     }
                   }
                 }
                 return false;
               };

               if (!checkAdjacency()) {
                 grid[gridY][gridX] = candidate;
                 studentQueue.splice(q, 1);
                 assignmentInHall.push({
                   hallId: hall._id, hallName: hall.name,
                   row: r + 1, column: c + 1, benchPosition: p + 1,
                   rollNumber: candidate.rollNumber, subjectCode: candidate.subjectCode,
                   department: candidate.department
                 });
                 capacityUsed++;
                 placed = true;
                 break;
               }
             }
             // AL-03: track deadlocked seats in batch auto-generation
             if (!placed && studentQueue.length > 0) {
               sessionSeatWarnings.push({
                 type: 'SEAT_EMPTY',
                 hall: hall.name,
                 row: r + 1, col: c + 1, benchPos: p + 1,
                 message: `Seat [${r+1},${c+1},pos${p+1}] in ${hall.name} could not be filled — constraint deadlock`
               });
             }
           }
         }
       }
       if (assignmentInHall.length > 0) allAssignments.push(...assignmentInHall);
     }

     const hallsWithStudentsInSession = [...new Set(allAssignments.map(a => a.hallId.toString()))];
     const facultyAllocationResult = await runFacultyAllocation(examDate, session, hallsWithStudentsInSession, demandFacultyIds);

     const newSeating = new AnnaSeating({
       examDate, session,
       assignments: allAssignments,
       facultyAssignments: facultyAllocationResult.facultyAssignments
     });
     await newSeating.save();
     generatedCount++;

     if (facultyAllocationResult.shortage) {
       hasShortage = true;
       globalAllocationWarnings.push(...facultyAllocationResult.allocationWarnings);
     }
     facultyAllocationResult.facultyAssignments.forEach(fa => {
       fa.facultyIds.forEach(id => allAssignedFacultyIds.add(id.toString()));
     });
  }

  let facultySuggestions = [];
  if (hasShortage) {
    const allFacultyInDb = await User.find({ role: 'faculty' }).lean();
    facultySuggestions = allFacultyInDb
      .filter(f => !allAssignedFacultyIds.has(f._id.toString()))
      .map(f => ({ id: f._id, name: f.name, department: f.department }));
  }

  return { 
    count: generatedCount, 
    skipped: skippedCount,
    shortage: hasShortage,
    allocationWarnings: globalAllocationWarnings,
    facultySuggestions
  };
}

export const generateAllAnnaSeating = async (req, res) => {
  try {
    const { maxPerHall = 25, seatsPerBench = 2, demandFacultyIds = [] } = req.body;
    const result = await runAnnaGeneration(maxPerHall, seatsPerBench, demandFacultyIds);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
