import xlsx from 'xlsx';
import InternalExamData from '../models/InternalExamData.js';
import SeatAssignment from '../models/SeatAssignment.js';
import ExamSession from '../models/ExamSession.js';
import Hall from '../models/Hall.js';
import User from '../models/User.js';
import FacultyDuty from '../models/FacultyDuty.js';
import { deleteSessionDuties, compareSessions, previousSession, dutiesFromAssignments } from '../utils/facultyDuties.js';
import { timetableEntryFromRow, validateTimetable, timetableErrorResponse, applyTimetable, parseRawTimetableLines } from '../utils/timetableImport.js';
import { isLocked } from '../utils/planStatus.js';
import { afterPlansDeleted } from '../services/planLifecycle.js';
import { allocateFaculty, vacancyMessage } from '../utils/facultyAllocation.js';
import { totalDutyCounts, reservedFacultyIds } from '../services/facultyPickerService.js';

export const getExamData = async (req, res) => {
  try {
    const data = await InternalExamData.find({});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadTimetableRaw = async (req, res) => {
  try {
    const { textData } = req.body;
    if (!textData) return res.status(400).json({ error: "Missing text data" });

    const updates = parseRawTimetableLines(textData);

    // NEW: Clear existing dates before applying new timetable
    await InternalExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    const matchedSubjects = await applyTimetable(InternalExamData, updates);
    // NEW: Clear old plans as requested by user
    const oldSessions = await ExamSession.find({}, 'examDate examSession examScheduleId').lean();
    await deleteSessionDuties(oldSessions);
    await ExamSession.deleteMany({});
    await afterPlansDeleted('internal', oldSessions);
    await SeatAssignment.deleteMany({});
    await Hall.updateMany({}, { $set: { facultyAssigned: [] } });

    // Automatically trigger fresh generation
    const generationResult = await runInternalGeneration();

    res.json({ 
      success: true, 
      updatedSubjects: matchedSubjects,
      generation: generationResult,
      message: `Internal timetable updated. Old plans cleared. ${generationResult.count} sessions generated automatically.` 
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

export const uploadTimetable = async (req, res) => {
  try {
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
      updates = data.map(timetableEntryFromRow);
    }

    // Validate everything before touching the database
    const { updates: validUpdates, errors } = validateTimetable(updates, req.file ? 2 : 1);
    if (errors.length > 0) {
      return res.status(400).json(timetableErrorResponse(errors));
    }
    if (validUpdates.length === 0) {
      return res.status(400).json({ error: 'Invalid timetable data provided' });
    }

    // NEW: Clear existing dates before applying new timetable to ensure old plan is truly removed
    await InternalExamData.updateMany({}, { $set: { examDate: "", session: "" } });

    const matchedCount = await applyTimetable(InternalExamData, validUpdates);

    // NEW: Clear old plans as requested by user
    const oldSessions = await ExamSession.find({}, 'examDate examSession examScheduleId').lean();
    await deleteSessionDuties(oldSessions);
    await ExamSession.deleteMany({});
    await afterPlansDeleted('internal', oldSessions);
    await SeatAssignment.deleteMany({});
    await Hall.updateMany({}, { $set: { facultyAssigned: [] } });

    // Automatically trigger fresh generation
    const generationResult = await runInternalGeneration();

    res.json({ 
      success: true, 
      updatedSubjects: matchedCount,
      generation: generationResult,
      message: `Timetable updated. Old plans cleared. ${generationResult.count} sessions generated automatically.` 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const manualMapSubject = async (req, res) => {
  try {
    const { subjectCode, examDate, session, type, year, department, rollNumber } = req.body;
    
    if (!subjectCode || !examDate || !session || !type) {
      return res.status(400).json({ error: "Missing required fields for manual mapping." });
    }

    if (type === 'department') {
      if (!department || !year) return res.status(400).json({ error: "Department and Year are required." });
      
      await InternalExamData.updateOne(
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
        
        await InternalExamData.updateOne(
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

/**
 * Internal helper to run the full generation logic for Internal Exams.
 */
async function runInternalGeneration(demandFacultyIdsInput = []) {
  const demandFacultyIds = (demandFacultyIdsInput || []).map(id => id.toString());

  const scheduledSubjects = await InternalExamData.find({ 
    examDate: { $ne: "" }, 
    session: { $ne: "" } 
  }).lean();
  if (scheduledSubjects.length === 0) return { count: 0, message: "No valid mappings found in timetable" };

  const uniqueSessions = [];
  scheduledSubjects.forEach(s => {
     if (!uniqueSessions.find(u => u.examDate === s.examDate && u.session === s.session)) {
          uniqueSessions.push({ examDate: s.examDate, session: s.session });
     }
  });
  // Chronological order, so each session's duty rules can see the sessions before it
  uniqueSessions.sort(compareSessions);

  const allStudents = await User.find({ role: 'student' }).lean();
  const halls = await Hall.find({ isSelected: true });
  if (halls.length === 0) return { count: 0, message: "No halls selected" };

  let generatedCount = 0;
  let skippedCount = 0;
  let globalAllocationWarnings = [];
  const allAssignedFacultyIds = new Set();
  // Duties handed out in this run (and in existing draft sessions). They aren't
  // saved as FacultyDuty until finalize, but the duty rules must still count them.
  const runDuties = [];
  const planVacancies = []; // halls left without enough invigilators, per plan
  const baseDutyCounts = await totalDutyCounts();

  for (const { examDate, session } of uniqueSessions) {
     let examSessionDoc = await ExamSession.findOne({ examDate, examSession: session });
     if (examSessionDoc) {
        if (!isLocked(examSessionDoc.status)) {
          runDuties.push(...dutiesFromAssignments(examDate, session, examSessionDoc.facultyAssignments));
        }
        skippedCount++;
        continue;
     }

     examSessionDoc = new ExamSession({
       examDate,
       examSession: session,
       examTime: session === "FN" ? "09:30 AM" : "01:30 PM",
       status: "DRAFT"
     });
     await examSessionDoc.save();

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
           department: user.department || "Unknown",
           subjectCode: mappedSubject.subjectCode
         });
       }
     }

     if (students.length === 0) {
        await ExamSession.findByIdAndDelete(examSessionDoc._id);
        continue; 
     }

     const deptQueues = {};
     students.forEach(s => {
       if (!deptQueues[s.department]) deptQueues[s.department] = [];
       deptQueues[s.department].push(s.rollNumber);
     });

     const deptIds = Object.keys(deptQueues);
     for (const k of deptIds) {
          deptQueues[k].sort((a,b) => {
              const numA = parseInt(a.replace(/\D/g, ''));
              const numB = parseInt(b.replace(/\D/g, ''));
              if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
              return a.localeCompare(b, undefined, { numeric: true });
          });
     }

     const shuffledDeptIds = [...deptIds];
     for (let i = shuffledDeptIds.length - 1; i > 0; i--) {
       const j = Math.floor(Math.random() * (i + 1));
       [shuffledDeptIds[i], shuffledDeptIds[j]] = [shuffledDeptIds[j], shuffledDeptIds[i]];
     }

     const startIndex = Math.floor(Math.random() * halls.length);
     const orderedHalls = [...halls.slice(startIndex), ...halls.slice(0, startIndex)];

     const assignments = [];
     let deptPtr = 0;

     const getNextActiveDepts = (n) => {
       const active = [];
       let checked = 0;
       while (active.length < n && checked < shuffledDeptIds.length) {
         const dId = shuffledDeptIds[(deptPtr + checked) % shuffledDeptIds.length];
         if (deptQueues[dId] && deptQueues[dId].length > 0) {
           if (!active.includes(dId)) {
             active.push(dId);
           }
         }
         checked++;
       }
       return active;
     };

     for (const hall of orderedHalls) {
       const extraSeats = (hall.extraBenches && hall.extraBenches.length) ? hall.extraBenches.length * hall.seatsPerBench : 0;
       const hallCapacity = (hall.rows * hall.columns * hall.seatsPerBench) + extraSeats;

       const desiredDeptCount = 3;
       let activeDepts = getNextActiveDepts(desiredDeptCount);
       if (activeDepts.length === 0) break;
       deptPtr = (deptPtr + 1) % shuffledDeptIds.length;

       const hallBatch = new Map();
       activeDepts.forEach((d) => hallBatch.set(d, []));
       let seatsFilled = 0;
       const targetPerDept = Math.floor(hallCapacity / activeDepts.length);

       activeDepts.forEach((dId) => {
         const queue = deptQueues[dId];
         const takeCount = Math.min(targetPerDept, queue.length);
         for (let k = 0; k < takeCount; k++) {
           hallBatch.get(dId).push(queue.shift());
           seatsFilled++;
         }
       });

       let safetyCheck = 0;
       while (seatsFilled < hallCapacity && safetyCheck < hallCapacity * 2) {
         safetyCheck++;
         let candidates = activeDepts.filter((d) => deptQueues[d].length > 0);
         if (candidates.length === 0) {
           candidates = shuffledDeptIds.filter((d) => deptQueues[d].length > 0);
           if (candidates.length === 0) break;
           candidates.forEach((c) => {
             if (!hallBatch.has(c)) hallBatch.set(c, []);
           });
         }
         const dId = candidates[seatsFilled % candidates.length];
         hallBatch.get(dId).push(deptQueues[dId].shift());
         seatsFilled++;
       }

       const batchDeptIds = Array.from(hallBatch.keys()).filter(d => hallBatch.get(d).length > 0);
       const singleDept = batchDeptIds.length === 1;
       const grid = Array(hall.rows + 1).fill(null).map(() => Array(hall.columns * hall.seatsPerBench + 1).fill(null));

       const tryPlace = (dId, gridX, gridY, seat, benchPos1Dept) => {
         if (seat > 1 && benchPos1Dept === dId) return false;
         if (gridX > 1 && grid[gridY][gridX - 1] === dId) return false;
         if (gridY > 1 && grid[gridY - 1][gridX] === dId) return false;
         return true;
       };

       const getStudentFromDept = (dId) => {
         const bQueue = hallBatch.get(dId);
         if (bQueue && bQueue.length > 0) return bQueue.shift();
         if (deptQueues[dId] && deptQueues[dId].length > 0) return deptQueues[dId].shift();
         return null;
       };

       for (let row = 1; row <= hall.rows; row++) {
         for (let col = 1; col <= hall.columns; col++) {
           let benchPos1Dept = null;
           for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
             const gridX = (col - 1) * hall.seatsPerBench + seat;
             const gridY = row;
             if (singleDept && seat > 1) {
               grid[gridY][gridX] = '__EMPTY__';
               continue;
             }
             let placed = false;
             const globalExtras = shuffledDeptIds.filter(d => !batchDeptIds.includes(d) && deptQueues[d].length > 0);
             const candidateDepts = [...batchDeptIds, ...globalExtras];
             for (let i = 0; i < candidateDepts.length; i++) {
               const dId = candidateDepts[i];
               if (!tryPlace(dId, gridX, gridY, seat, benchPos1Dept)) continue;
               const roll = getStudentFromDept(dId);
               if (roll === null) continue;
               if (!hallBatch.has(dId)) hallBatch.set(dId, []);
               grid[gridY][gridX] = dId;
               if (seat === 1) benchPos1Dept = dId;
               assignments.push({
                 hallId: hall._id,
                 row, column: col, benchPosition: seat,
                 studentRollNumber: roll, departmentId: dId,
                 examDate, examSession: session, examTime: examSessionDoc.examTime,
                 examSessionId: examSessionDoc._id,
               });
               placed = true; break;
             }
             if (!placed) grid[gridY][gridX] = '__EMPTY__';
           }
         }
       }

       if (hall.extraBenches && hall.extraBenches.length > 0) {
         for (const bench of hall.extraBenches) {
           let extraBenchPos1Dept = null;
           for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
             if (singleDept && seat > 1) continue;
             let placed = false;
             const globalExtras = shuffledDeptIds.filter(d => !batchDeptIds.includes(d) && deptQueues[d].length > 0);
             const candidateDepts = [...batchDeptIds, ...globalExtras];
             for (let i = 0; i < candidateDepts.length; i++) {
               const dId = candidateDepts[i];
               if (seat > 1 && extraBenchPos1Dept === dId) continue;
               const roll = getStudentFromDept(dId);
               if (roll === null) continue;
               if (!hallBatch.has(dId)) hallBatch.set(dId, []);
               if (seat === 1) extraBenchPos1Dept = dId;
               assignments.push({
                 hallId: hall._id, row: bench.row, column: bench.column, benchPosition: seat,
                 studentRollNumber: roll, departmentId: dId,
                 examDate, examSession: session, examTime: examSessionDoc.examTime,
                 examSessionId: examSessionDoc._id, isExtraBench: true,
               });
               placed = true; break;
             }
           }
         }
       }

       // Students pulled into this hall's batch but left unplaced (adjacency rules
       // left seats empty) go back to the front of their queue for the next hall.
       for (const [dId, leftover] of hallBatch) {
         if (leftover.length > 0) deptQueues[dId].unshift(...leftover);
       }
     }

     const unseated = Object.values(deptQueues).reduce((n, q) => n + q.length, 0);
     if (unseated > 0) {
       globalAllocationWarnings.push(`${examDate} ${session}: ${unseated} student(s) could not be seated - not enough seats that satisfy the seating rules (add halls or mix more departments)`);
     }

     if (assignments.length > 0) await SeatAssignment.insertMany(assignments);

     const allFacultyForSession = await User.find({ role: 'faculty' }).lean();
     const allDuties = [...await FacultyDuty.find({}).lean(), ...runDuties];
     const shuffledFaculty = [...allFacultyForSession];
     for (let i = shuffledFaculty.length - 1; i > 0; i--) {
       const j = Math.floor(Math.random() * (i + 1));
       [shuffledFaculty[i], shuffledFaculty[j]] = [shuffledFaculty[j], shuffledFaculty[i]];
     }

     // No continuous duty: nobody who invigilated the session just before this one
     // (same-day FN for an AN session, otherwise the latest earlier session)
     const prev = previousSession(examDate, session, [...uniqueSessions, ...allDuties]);
     const previouslyAssignedIds = new Set();
     if (prev) {
       allDuties.filter(d => d.examDate === prev.examDate && d.examSession === prev.examSession).forEach(d => previouslyAssignedIds.add(d.facultyId.toString()));
     }

     // Hard constraint: reserves of this slot can't also invigilate (and vice versa)
     const reservedSet = await reservedFacultyIds(examDate, session);

     // Hard rules for this session; the department limit is the per-run quota
     // applied by allocateFaculty (replaces the fixed "max 2 per hall").
     const isFacultyAvailable = (faculty) => {
       const fId = faculty._id.toString();
       const isDemand = demandFacultyIds.includes(fId);
       if (reservedSet.has(fId)) return false;
       const fDuties = allDuties.filter(d => d.facultyId.toString() === fId);
       if (fDuties.some(d => d.examDate === examDate && d.examSession === session)) return false;
       if (previouslyAssignedIds.has(fId) && !isDemand) return false;
       const targetDate = new Date(examDate);
       const dutiesThisWeek = fDuties.filter(d => Math.abs(new Date(d.examDate) - targetDate) / (1000 * 60 * 60 * 24) <= 7);
       if (dutiesThisWeek.length >= 4 && !isDemand) return false;
       return true;
     };

     const hallsWithStudentsInSession = new Set(assignments.map(a => a.hallId.toString()));

     // Clear old transient Hall facultyAssigned for selected halls
     const selectedHallIds = halls.map(h => h._id);
     await Hall.updateMany(
       { _id: { $in: selectedHallIds } },
       { $set: { facultyAssigned: [] } }
     );

     // Fairness: fewer total duties first (saved duties + ones handed out earlier in this run)
     const dutyCounts = { ...baseDutyCounts };
     runDuties.forEach(d => { dutyCounts[String(d.facultyId)] = (dutyCounts[String(d.facultyId)] || 0) + 1; });

     const allocation = allocateFaculty({
       halls: halls
         .filter(h => hallsWithStudentsInSession.has(h._id.toString()))
         .map(h => ({ hallId: h._id, hallName: h.name, required: h.facultyRequired || 1 })),
       faculty: shuffledFaculty,
       isEligible: isFacultyAvailable,
       dutyCounts,
       demandIds: demandFacultyIds,
     });
     const sessionFacultyAssignments = allocation.facultyAssignments;
     sessionFacultyAssignments.forEach(fa => fa.facultyIds.forEach(id => allAssignedFacultyIds.add(id)));
     const allocationWarnings = allocation.vacancies.map(v => `${examDate} ${session} - Hall ${v.hallName}: No faculty found (Need ${v.required}, got ${v.assigned})`);
     if (allocation.vacancies.length) {
       planVacancies.push({ planType: 'internal', planId: examSessionDoc._id, examDate, session, vacancies: allocation.vacancies });
     }

     // Save to ExamSession
     await ExamSession.findByIdAndUpdate(examSessionDoc._id, {
       $set: { facultyAssignments: sessionFacultyAssignments }
     });
     runDuties.push(...dutiesFromAssignments(examDate, session, sessionFacultyAssignments));

     if (allocationWarnings.length > 0) globalAllocationWarnings.push(...allocationWarnings);
     generatedCount++;
  }

  const hasShortage = globalAllocationWarnings.length > 0;
  let facultySuggestions = [];
  if (hasShortage) {
    const allFacultyInDb = await User.find({ role: 'faculty' }).lean();
    facultySuggestions = allFacultyInDb.filter(f => {
      const fId = f._id.toString();
      return !allAssignedFacultyIds.has(fId);
    }).map(f => ({ id: f._id, name: f.name, department: f.department }));
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

export const generateAllInternalSeating = async (req, res) => {
  try {
    const { demandFacultyIds = [] } = req.body;
    const result = await runInternalGeneration(demandFacultyIds);
    if (result.count === 0 && result.message) return res.status(400).json({ error: result.message });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
