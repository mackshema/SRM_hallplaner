import xlsx from 'xlsx';
import AnnaExamData from '../models/AnnaExamData.js';
import AnnaSeating from '../models/AnnaSeating.js';
import Hall from '../models/Hall.js';
import User from '../models/User.js';
import FacultyDuty from '../models/FacultyDuty.js';
import { deleteSessionDuties, compareSessions, previousSession, dutiesFromAssignments } from '../utils/facultyDuties.js';
import { timetableEntryFromRow, validateTimetable, timetableErrorResponse, applyTimetable, parseRawTimetableLines, escapeRegex } from '../utils/timetableImport.js';
import ReserveFaculty from '../models/ReserveFaculty.js';
import { allocateFaculty, vacancyMessage } from '../utils/facultyAllocation.js';
import { isLocked } from '../utils/planStatus.js';
import { totalDutyCounts, reservedFacultyIds } from '../services/facultyPickerService.js';
import { normalizePlan, deletePlanDuties } from '../services/planService.js';
import { autoPromoteDuePlans, onPlanChanged, afterPlansDeleted } from '../services/planLifecycle.js';

import { publishPlan, cancelSchedule, unpublishPlan, sendError } from '../services/publishService.js';
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

/**
 * @param extraDuties duties not yet saved as FacultyDuty (sessions generated
 *   earlier in the same run, or draft plans) - counted by every duty rule.
 */
const runFacultyAllocation = async (examDate, session, hallsWithStudents, demandFacultyIdsInput = [], extraDuties = []) => {
  const demandFacultyIds = (demandFacultyIdsInput || []).map(id => id.toString());

  // 1. Fetch all eligible faculty
  const allFaculty = await User.find({ role: "faculty" }).lean();

  // 2. Fetch recent duties for constraint checking (last 7 days)
  const sevenDaysAgo = getDateDaysAgo(examDate, 7);
  const savedDuties = await FacultyDuty.find({
    examDate: { $gte: sevenDaysAgo, $lte: examDate }
  }).select('facultyId examDate examSession').lean();
  const recentDuties = [
    ...savedDuties,
    ...extraDuties.filter(d => d.examDate >= sevenDaysAgo && d.examDate <= examDate),
  ];

  // Previous session = the latest Anna session (or duty) before this one.
  // Same-day FN for an AN session; otherwise the previous day's last session.
  const earlierPlans = await AnnaSeating.find({ examDate: { $lte: examDate } }).select('examDate session').lean();
  const prevSlot = previousSession(examDate, session, [...earlierPlans, ...recentDuties]);

  // Build lookup Set for previous session duties
  const prevSessionKey = prevSlot ? `${prevSlot.examDate}_${prevSlot.examSession}` : null;
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

  // Hard constraint: reserves of this slot can't also invigilate (and vice versa)
  const reservedSet = await reservedFacultyIds(examDate, session);

  // Hard rules for this session. The department limit is a per-run quota
  // applied by allocateFaculty (replaces the fixed "max 2 per hall").
  const isFacultyAvailable = (faculty) => {
    const fId = faculty._id.toString();
    const isDemand = demandFacultyIds.includes(fId);

    // Same Session Duplicate / Reserve (HARD CONSTRAINT)
    if (sameSessionFacultySet.has(fId) || reservedSet.has(fId)) return false;

    // No Continuous Participation (Unless Demand)
    if (prevSessionFacultySet.has(fId) && !isDemand) return false;

    // Weekly Limit: Max 4 duties (Unless Demand)
    if (!isDemand && (weeklyDutyCount[fId] || 0) >= 4) return false;

    return true;
  };

  const hallDocs = await Hall.find({ _id: { $in: hallsWithStudents } }).lean();
  const hallById = new Map(hallDocs.map(h => [h._id.toString(), h]));
  const hallsToStaff = hallsWithStudents
    .map(id => hallById.get(id.toString()))
    .filter(Boolean)
    .map(h => ({ hallId: h._id, hallName: h.name, required: h.facultyRequired || 1 }));

  const allocation = allocateFaculty({
    halls: hallsToStaff,
    faculty: allFaculty,
    isEligible: isFacultyAvailable,
    dutyCounts: await totalDutyCounts(),
    demandIds: demandFacultyIds,
  });

  const allocationWarnings = allocation.vacancies.map(v => `Hall ${v.hallName}: Could not find enough faculty (Need ${v.required}, got ${v.assigned})`);
  const shortage = allocation.vacancies.length > 0;

  // Suggest all faculty who are free in this session (ignoring soft limits like continuous/weekly caps)
  let facultySuggestions = [];
  if (shortage) {
    const assignedIds = new Set(allocation.facultyAssignments.flatMap(a => a.facultyIds));
    facultySuggestions = allFaculty
      .filter(f => !assignedIds.has(f._id.toString())) // Not already assigned in this generation run
      .filter(f => !sameSessionFacultySet.has(f._id.toString()) && !reservedSet.has(f._id.toString())) // No duplicate duty in this same session
      .map(f => ({ id: f._id, name: f.name, department: f.department }));
  }

  return {
    facultyAssignments: allocation.facultyAssignments,
    shortage,
    allocationWarnings,
    facultySuggestions,
    vacancies: allocation.vacancies,
    departmentQuota: allocation.quota
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
      // Find if we already have a timetable date for this subject code,
      // preferring the student's own department when the code is shared
      const codeFilter = { $regex: new RegExp(`^${escapeRegex(d.subjectCode)}$`, 'i') };
      const existingTimetable =
        await AnnaExamData.findOne({ subjectCode: codeFilter, department: d.department, examDate: { $ne: "" } }) ||
        await AnnaExamData.findOne({ subjectCode: codeFilter, examDate: { $ne: "" } });
      
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

    // Very basic heuristic for OCR: "CS101 2024-05-15 FN ComputerScience"
    const updates = parseRawTimetableLines(textData);

    // NEW: Clear existing dates before applying new timetable
    await AnnaExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    const matchedSubjects = await applyTimetable(AnnaExamData, updates);
    // NEW: Clear old plans as requested by user
    const oldPlans = await AnnaSeating.find({}, 'examDate session examScheduleId').lean();
    await deleteSessionDuties(oldPlans.map(p => ({ examDate: p.examDate, examSession: p.session })));
    await AnnaSeating.deleteMany({});
    await afterPlansDeleted('anna', oldPlans);

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
    let entries;
    if (!req.file) {
      if (!req.body.timetable) {
         return res.status(400).json({ error: 'No file or manual timetable provided' });
      }
      entries = req.body.timetable;
    } else {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      entries = data.map(timetableEntryFromRow);
    }

    // Validate before the confirmation gate so a bad file is rejected without
    // the admin ever being asked to confirm a deletion.
    const { updates, errors } = validateTimetable(entries, req.file ? 2 : 1);
    if (errors.length > 0) {
      return res.status(400).json(timetableErrorResponse(errors));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Invalid timetable data provided' });
    }

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

    // NEW: Clear existing dates before applying new timetable
    await AnnaExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    // Subject codes are matched case-insensitively for Anna data
    const matchedCount = await applyTimetable(AnnaExamData, updates, { caseInsensitive: true });

    // NEW: Clear old plans as requested by user
    const oldPlans = await AnnaSeating.find({}, 'examDate session examScheduleId').lean();
    await deleteSessionDuties(oldPlans.map(p => ({ examDate: p.examDate, examSession: p.session })));
    await AnnaSeating.deleteMany({});
    await afterPlansDeleted('anna', oldPlans);

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
    const { examDate, session, maxPerHall = 25, seatsPerBench: maxSpb = 2 } = req.body;

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

    // Delete existing plan mapping for this date/session to overwrite (drafts only)
    const replaced = await AnnaSeating.find({ examDate, session }, 'examDate session status examScheduleId').lean();
    if (replaced.some(p => isLocked(p.status))) {
      return res.status(400).json({ error: "This plan is finalized. Unlock it before regenerating." });
    }
    await AnnaSeating.deleteMany({ examDate, session });
    await afterPlansDeleted('anna', replaced);

    for (const hall of orderedHalls) {
      if (studentQueue.length === 0) break;

      const assignmentInHall = [];
      let capacityUsed = 0;

      // Never exceed the hall's own bench size (drawing halls have 1 seat per bench)
      const spb = Math.min(maxSpb, hall.seatsPerBench || maxSpb);
      const hallMax = Math.min(
        maxPerHall,
        hall.rows * hall.columns * spb
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
    // Other draft plans' invigilators count towards the duty rules too
    const draftPlans = await AnnaSeating.find({ status: { $nin: ['FINAL', 'SCHEDULED', 'PUBLISHED'] } }).select('examDate session facultyAssignments').lean();
    const draftDuties = draftPlans.flatMap(p => dutiesFromAssignments(p.examDate, p.session, p.facultyAssignments));
    const facultyAllocationResult = await runFacultyAllocation(examDate, session, hallsWithStudents, demandFacultyIds, draftDuties);

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
        suggestions: facultyAllocationResult.facultySuggestions,
        vacancies: facultyAllocationResult.vacancies,
        vacancyMessage: vacancyMessage(facultyAllocationResult.vacancies),
        departmentQuota: facultyAllocationResult.departmentQuota
      },
      planVacancies: facultyAllocationResult.vacancies.length
        ? [{ planType: 'anna', planId: newSeating._id, examDate, session, vacancies: facultyAllocationResult.vacancies }]
        : []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getAllSeatingPlans = async (req, res) => {
  try {
    // Read-time check: SCHEDULED plans whose publish time passed become PUBLISHED
    await autoPromoteDuePlans();
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
    await autoPromoteDuePlans();
    const plan = await AnnaSeating.findOne({ examDate, session });
    res.json(plan || { assignments: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/** Creates the FacultyDuty rows of a plan that is being finalized. */
const createPlanDuties = async (plan) => {
  const faMap = new Map(
    (plan.facultyAssignments || []).map(fa => [fa.hallId.toString(), fa.facultyIds])
  );
  const hallIds = [...new Set(plan.assignments.map(a => a.hallId.toString()))];
  for (const hId of hallIds) {
    for (const fId of faMap.get(hId) || []) {
      // Upsert: one duty per faculty per slot (unique index), safe on repeat
      await FacultyDuty.updateOne(
        { facultyId: fId, examDate: plan.examDate, examSession: plan.session },
        { $set: { hallId: hId, examTime: resolveExamTime(plan.session, null) } },
        { upsert: true }
      );
      await User.findByIdAndUpdate(fId, { lastDutyDate: new Date() });
    }
  }
};

/**
 * Status changes for an Anna plan (DRAFT -> FINAL -> SCHEDULED -> PUBLISHED).
 * Body: { examDate, session, status?, isPublished?, publish_at?, startTime?, endTime?, absentee_window_minutes? }
 *
 *  - publish_at present (and status not FINAL/DRAFT): publish now / schedule (publishService)
 *  - status DRAFT: unlock; the plan's duties are removed
 *  - status FINAL from DRAFT: finalize; duties are created once
 *  - status FINAL from SCHEDULED/PUBLISHED: cancel schedule / unpublish (duties kept)
 *  - status FINAL + isPublished true: legacy "publish" flag, still honoured
 */
export const updateStatus = async (req, res) => {
  try {
    const { examDate, session, status, isPublished, publish_at } = req.body;
    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }

    const current = await AnnaSeating.findOne({ examDate, session });
    if (!current) return res.status(404).json({ error: "Seating plan not found" });
    const planId = current._id;
    const from = current.status || "DRAFT";

    // Publish / schedule through the shared publish rules
    if (publish_at !== undefined && status !== "FINAL" && status !== "DRAFT") {
      return res.json(await publishPlan("anna", planId, req.body));
    }

    if (status === "DRAFT") {
      if (isLocked(from)) await deletePlanDuties(normalizePlan("anna", current));
      const plan = await AnnaSeating.findByIdAndUpdate(planId,
        { $set: { status: "DRAFT", isPublished: false, publish_at: null } }, { new: true });
      await onPlanChanged("anna", planId, { reason: "plan unlocked for editing" });
      return res.json(plan);
    }

    if (status === "FINAL") {
      if (from === "SCHEDULED") return res.json(await cancelSchedule("anna", planId));
      if (from === "PUBLISHED") return res.json(await unpublishPlan("anna", planId));

      const update = { status: "FINAL" };
      if (isPublished !== undefined) update.isPublished = isPublished;
      if (from !== "FINAL") update.finalizedAt = new Date();
      const plan = await AnnaSeating.findByIdAndUpdate(planId, { $set: update }, { new: true });
      // Becoming FINAL: create the duties (only on the transition)
      if (from !== "FINAL") await createPlanDuties(plan);
      await onPlanChanged("anna", planId, { reason: from !== "FINAL" ? "plan finalized" : "plan updated" });
      return res.json(plan);
    }

    // Visibility flag only
    if (isPublished !== undefined) {
      const plan = await AnnaSeating.findByIdAndUpdate(planId, { $set: { isPublished } }, { new: true });
      await onPlanChanged("anna", planId, { reason: "plan updated" });
      return res.json(plan);
    }

    return res.status(400).json({ error: "Nothing to update." });
  } catch (err) {
    sendError(res, err, "Failed to update plan status");
  }
};


export const deleteSeatingPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await AnnaSeating.findById(id);
    if (!existing) return res.status(404).json({ error: "Plan not found" });

    // Also remove this plan's faculty duties and reserves (not the Internal plan's in the same slot)
    const plan = normalizePlan("anna", existing);
    await deletePlanDuties(plan);
    await ReserveFaculty.deleteMany({ $or: [{ planId: id }, { planId: null, examType: "Anna", examDate: plan.examDate, examSession: plan.session }] });
    await AnnaSeating.findByIdAndDelete(id);
    await onPlanChanged("anna", id, { reason: "plan deleted", previousScheduleId: plan.examScheduleId });

    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (err) {
    console.error("Error deleting plan:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Internal helper to run the full generation logic for Anna University Exams.
 */
async function runAnnaGeneration(maxPerHall = 25, maxSpb = 2, demandFacultyIds = []) {
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
  // Chronological order, so each session's duty rules can see the sessions before it
  uniqueSessions.sort(compareSessions);

  const allStudents = await User.find({ role: 'student' }).lean();
  if(allStudents.length === 0) return { count: 0, message: "No students exist" };

  const halls = await Hall.find({ isSelected: true }).lean();
  if (halls.length === 0) return { count: 0, message: "No halls selected" };

  let generatedCount = 0;
  let skippedCount = 0;
  let globalAllocationWarnings = [];
  let hasShortage = false;
  const allAssignedFacultyIds = new Set();
  // Duties handed out in this run (and in existing draft plans). They aren't
  // saved as FacultyDuty until finalize, but the duty rules must still count them.
  const runDuties = [];
  const planVacancies = []; // halls left without enough invigilators, per plan

  for (const { examDate, session } of uniqueSessions) {
     const existing = await AnnaSeating.findOne({ examDate, session });
     if (existing) {
        if (!isLocked(existing.status)) {
          runDuties.push(...dutiesFromAssignments(examDate, session, existing.facultyAssignments));
        }
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
       // Never exceed the hall's own bench size (drawing halls have 1 seat per bench)
       const spb = Math.min(maxSpb, hall.seatsPerBench || maxSpb);
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

     if (studentQueue.length > 0) {
       hasShortage = true;
       globalAllocationWarnings.push(`${examDate} ${session}: ${studentQueue.length} student(s) could not be seated - not enough seats that satisfy the seating rules (add halls or mix more departments)`);
     }

     const hallsWithStudentsInSession = [...new Set(allAssignments.map(a => a.hallId.toString()))];
     const facultyAllocationResult = await runFacultyAllocation(examDate, session, hallsWithStudentsInSession, demandFacultyIds, runDuties);

     const newSeating = new AnnaSeating({
       examDate, session,
       assignments: allAssignments,
       facultyAssignments: facultyAllocationResult.facultyAssignments
     });
     await newSeating.save();
     runDuties.push(...dutiesFromAssignments(examDate, session, facultyAllocationResult.facultyAssignments));
     generatedCount++;
     if (facultyAllocationResult.vacancies.length) {
       planVacancies.push({ planType: 'anna', planId: newSeating._id, examDate, session, vacancies: facultyAllocationResult.vacancies });
     }

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
    facultySuggestions,
    planVacancies,
    vacancyMessage: vacancyMessage(planVacancies.flatMap(p => p.vacancies))
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
