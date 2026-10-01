import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import ExamSession from "../models/ExamSession.js";
import User from "../models/User.js";
const Faculty = User; // Alias for readability in this file
// import Faculty from "../models/Faculty.js"; // REPLACED
import FacultyDuty from "../models/FacultyDuty.js";
import SeatingPlan from "../models/SeatingPlan.js";
import InternalExamData from "../models/InternalExamData.js"; // AL-01
import AnnaSeating from "../models/AnnaSeating.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import { previousSession as findPreviousSession, dutiesFromAssignments } from "../utils/facultyDuties.js";
import { isLocked, isPlanVisible } from "../utils/planStatus.js";
import { allocateFaculty, vacancyMessage } from "../utils/facultyAllocation.js";
import { normalizePlan, reserveQueryForPlan } from "../services/planService.js";
import { onPlanChanged } from "../services/planLifecycle.js";
import { totalDutyCounts, reservedFacultyIds } from "../services/facultyPickerService.js";
import { getFacultyDutyCards } from "../services/facultyDashboardService.js";
import { hallAbsenteeWindow, isAssignedInvigilator } from "../services/absenteeService.js";

const getDateDaysAgo = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getPrevSession = (session) =>
  session === 'AN' ? 'FN' : null; // FN→AN is same day, AN→next day FN


/* ===============================
   SAVE SEATING PLAN (ADMIN)
================================ */
export const saveSeatingPlan = async (req, res) => {
  try {
    const { hallId, examSessionId, assignments } = req.body;

    if (!examSessionId) {
      return res.status(400).json({ error: "Exam Session ID is required" });
    }

    const session = await ExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ error: "Exam session not found" });
    }

    if (isLocked(session.status)) {
      return res.status(400).json({ error: "Cannot edit a finalized seating plan" });
    }

    // Validate duplicate roll numbers within this hall
    const rollNumbers = assignments
      .map((a) => a.studentRollNumber)
      .filter((r) => r); // Filter out empty/null

    const uniqueRolls = new Set(rollNumbers);
    if (rollNumbers.length !== uniqueRolls.size) {
      const duplicates = rollNumbers.filter((r, i) => rollNumbers.indexOf(r) !== i);
      return res.status(400).json({
        error: "Duplicate roll numbers detected",
        duplicates: [...new Set(duplicates)],
      });
    }

    // Delete existing assignments for THIS hall and THIS session
    await SeatAssignment.deleteMany({ hallId, examSessionId });

    const docs = assignments.map((a) => ({
      ...a,
      hallId,
      examSessionId,
      examDate: session.examDate,
      examSession: session.examSession,
      examTime: session.examTime,
    }));

    await SeatAssignment.insertMany(docs);

    // NOTE: We do NOT update Hall global strings (examDate, etc.) to preserve history support.

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save seating plan" });
  }
};

/* ===============================
   GET HALL SEATING
================================ */
export const getHallSeating = async (req, res) => {
  try {
    const { hallId } = req.params;
    const { examSessionId } = req.query;

    if (!examSessionId) {
      return res.json({ assignments: [], examDate: "", examSession: "", examTime: "", facultyAssigned: [] });
    }

    const session = await ExamSession.findById(examSessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const assignments = await SeatAssignment.find({ hallId, examSessionId });

    // Determine Faculty
    let facultyAssigned = [];

    // Locked plans (FINAL / SCHEDULED / PUBLISHED): source of truth is FacultyDuty
    if (isLocked(session.status)) {
      const duties = await FacultyDuty.find({
        hallId,
        examDate: session.examDate,
        examSession: session.examSession
      });
      facultyAssigned = duties.map(d => d.facultyId);
    } else {
      // Draft: the session's own assignments (AL-07), falling back to the
      // deprecated Hall.facultyAssigned for pre-AL-07 drafts
      const fa = (session.facultyAssignments || []).find(a => String(a.hallId) === String(hallId));
      if (fa) {
        facultyAssigned = fa.facultyIds;
      } else {
        const hall = await Hall.findById(hallId);
        facultyAssigned = hall ? hall.facultyAssigned : [];
      }
    }

    // Reserve faculty of this plan, shown at the bottom of the bench layout
    const plan = normalizePlan("internal", session);
    const reserves = await ReserveFaculty.find(reserveQueryForPlan(plan, ["reserve"]))
      .populate("facultyId", "name department designation").lean();

    const examMetadata = {
      examDate: session.examDate,
      examSession: session.examSession,
      examTime: session.examTime,
      status: session.status
    };

    res.json({
      assignments,
      facultyAssigned,
      reserveFaculty: reserves.filter(r => r.facultyId).map(r => ({
        _id: r.facultyId._id,
        name: r.facultyId.name,
        department: r.facultyId.department || "",
        designation: r.facultyId.designation || ""
      })),
      ...examMetadata
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================
   GET ALL SEAT ASSIGNMENTS (FOR EXPORTS)
================================ */
export const getAllSeatAssignments = async (req, res) => {
  try {
    const { examSessionId } = req.query;
    const query = examSessionId ? { examSessionId } : {};

    const assignments = await SeatAssignment.find(query);
    res.json({ assignments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================
   FACULTY SUMMARY (READ-ONLY)
================================ */
export const getFacultyHallSummary = async (req, res) => {
  try {
    const { facultyId } = req.params;

    // A faculty member may only read their own duties; admins can read anyone's
    if (req.user?.role !== "admin" && String(req.user?.id) !== String(facultyId)) {
      return res.status(403).json({ message: "You can only view your own duties." });
    }

    // Duty cards (hall + reserve), each respecting the scheduled-publish rule,
    // with exam live status and absentee upload window
    res.json(await getFacultyDutyCards(facultyId));
  } catch (error) {
    console.error("Error fetching faculty hall summary:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   GENERATE SEATING PLAN
================================ */
export const generateSeatingPlan = async (req, res) => {
  try {
    const {
      examSessionId,
      departments: frontendDepartments,
      skipRollNumbers = [],
      manualRollNumbers = [],
    } = req.body;

    if (!examSessionId) {
      return res.status(400).json({ message: "Exam Session ID is required" });
    }

    const session = await ExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam Session not found" });
    }
    if (isLocked(session.status)) {
      return res.status(400).json({ message: "Cannot regenerate a finalized session" });
    }

    const { examDate, examSession, examTime } = session;

    // Delete all existing assignments FOR THIS SESSION
    await SeatAssignment.deleteMany({ examSessionId });

    // Get all SELECTED halls
    let halls;
    if (session.activeHalls && session.activeHalls.length > 0) {
      halls = await Hall.find({ _id: { $in: session.activeHalls } });
    } else {
      halls = await Hall.find({ isSelected: true });
    }

    if (!halls.length) {
      return res.status(400).json({ message: "No halls found/selected for this session" });
    }

    // Fetch students from the database directly instead of departments
    const allStudents = await User.find({ role: "student", isSelected: true }).sort({ username: 1 }).lean();
    if (!allStudents.length) {
      return res.status(400).json({ message: "No students found in the database. Please add students first." });
    }

    // AL-01: Build name snapshot map (rollNumber → name)
    const nameMap = {};
    allStudents.forEach(s => { nameMap[s.username] = s.name || ''; });

    // Follow the timetable: seat only students with an exam in THIS session, matched the
    // same way as automatic generation (roll-number mapping first, else department + year).
    // Sessions created by hand with no timetable rows keep seating every selected student.
    // AL-01: subjectMap (rollNumber → subjectCode) doubles as the subject snapshot.
    const scheduled = await InternalExamData.find({ examDate, session: examSession }).lean();
    const subjectMap = {};
    let sessionStudents = allStudents;
    if (scheduled.length > 0) {
      sessionStudents = allStudents.filter(s => {
        const sub = scheduled.find(x => x.rollNumber === s.username) ||
          scheduled.find(x => !x.rollNumber && x.department === s.department && x.year === s.degree);
        if (sub) subjectMap[s.username] = sub.subjectCode || null;
        return !!sub;
      });
      if (!sessionStudents.length) {
        return res.status(400).json({ message: "No students match this session's timetable (check Department and Year)." });
      }
    } else {
      const internalData = await InternalExamData.find({ rollNumber: { $nin: [null, ""] } }).lean();
      internalData.forEach(d => { subjectMap[d.rollNumber] = d.subjectCode || null; });
    }

    const generationWarnings = []; // AL-03: silent warning collector
    const deptMap = {};
    sessionStudents.forEach(s => {
        if (!s.department) {
            console.warn('Student missing department, excluded from seating:', s.username);
            generationWarnings.push({
                type: 'STUDENT_NO_DEPARTMENT',
                rollNumber: s.username,
                message: `Student ${s.name} (${s.username}) excluded — missing department field`
            });
            return;
        }
        const dept = s.department;
        if (!deptMap[dept]) {
            deptMap[dept] = [];
        }
        deptMap[dept].push(s.username);
    });

    const departments = Object.keys(deptMap).map(deptName => ({
        _id: deptName,
        name: deptName
    }));

    // FIX 4: Skip Roll Number Validation
    const invalidSkips = [];
    for (const skip of skipRollNumbers) {
      const skipStr = String(skip).trim();
      if (!skipStr) continue;
      if (!allStudents.some(s => s.username === skipStr)) {
          invalidSkips.push(skipStr);
      }
    }

    if (invalidSkips.length > 0) {
      return res.status(400).json({
        message: "Invalid roll number. This roll number does not exist in the seating plan."
      });
    }

    // ============================================
    // STEP 1: STUDENT SEATING LOGIC
    // ============================================

    // 1.1: Build queues
    const skipSet = new Set(skipRollNumbers.map((r) => r.toString().trim()).filter(Boolean));
    const manualSet = new Set(manualRollNumbers.map((r) => r.toString().trim()).filter(Boolean));

    const deptQueues = {};
    departments.forEach((dept) => {
      deptQueues[dept._id] = [];
      const rolls = deptMap[dept._id] || [];
      rolls.forEach((rollStr) => {
        if (!skipSet.has(rollStr) && !manualSet.has(rollStr)) {
          deptQueues[dept._id].push(rollStr);
        }
      });
    });

    // AL-06: O(1) pointer indices — replaces O(N) Array.shift() on deptQueues
    // Each entry tracks how many students have been consumed from that dept queue.
    // Reads use deptQueues[d][deptPtrs[d]] and increment; arrays are never mutated.
    const deptPtrs = {};
    Object.keys(deptQueues).forEach(dept => { deptPtrs[dept] = 0; });

    // Add manual roll numbers (Priority)
    manualSet.forEach((manualRoll) => {
      const student = allStudents.find(s => s.username === manualRoll);
      if (student) {
        const deptId = student.department || "Unknown";
        if (deptQueues[deptId]) {
          deptQueues[deptId].unshift(manualRoll);
        }
      }
    });

    // 1.2: Randomize Start
    const startIndex = Math.floor(Math.random() * halls.length);
    const orderedHalls = [
      ...halls.slice(startIndex),
      ...halls.slice(0, startIndex),
    ];

    // 1.3: Shuffle Departments
    const deptIds = Object.keys(deptQueues);
    const shuffledDeptIds = [...deptIds];
    // Fisher-Yates shuffle
    for (let i = shuffledDeptIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeptIds[i], shuffledDeptIds[j]] = [shuffledDeptIds[j], shuffledDeptIds[i]];
    }

    // 1.4: Hall-by-Hall Filling
    const assignments = [];
    let deptPtr = 0;
    // generationWarnings is already declared above

    const isPairBlocked = (dId1, dId2) => {
      if (!session.blockedCombinations) return false;
      for (const blockGroup of session.blockedCombinations) {
        const strGroup = blockGroup.map(id => id.toString());
        if (strGroup.includes(dId1.toString()) && strGroup.includes(dId2.toString())) {
          return true;
        }
      }
      return false;
    };

    const getNextActiveDepts = (n) => {
      const active = [];
      let checked = 0;
      while (active.length < n && checked < shuffledDeptIds.length) {
        const dId = shuffledDeptIds[(deptPtr + checked) % shuffledDeptIds.length];
        if (deptQueues[dId] && deptPtrs[dId] < deptQueues[dId].length) {
          if (!active.includes(dId)) {
            let conflicts = false;
            for (const existingId of active) {
              if (isPairBlocked(dId, existingId)) {
                conflicts = true;
                break;
              }
            }
            if (!conflicts) {
              active.push(dId);
            }
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
        const remaining = queue.length - deptPtrs[dId]; // AL-06: available count
        const takeCount = Math.min(targetPerDept, remaining);
        for (let k = 0; k < takeCount; k++) {
          hallBatch.get(dId).push(queue[deptPtrs[dId]++]); // AL-06: O(1) read
          seatsFilled++;
        }
      });

      // Fill remaining capacity if any queue has students
      let safetyCheck = 0;
      while (seatsFilled < hallCapacity && safetyCheck < hallCapacity * 2) {
        safetyCheck++;
        let candidates = activeDepts.filter((d) => deptPtrs[d] < deptQueues[d].length); // AL-06
        if (candidates.length === 0) {
          candidates = shuffledDeptIds.filter((d) => deptPtrs[d] < deptQueues[d].length); // AL-06

          const currentHBatchIds = Array.from(hallBatch.keys());
          candidates = candidates.filter(d => {
            if (currentHBatchIds.includes(d)) return true; // Already in batch
            for (const existingId of currentHBatchIds) {
              if (isPairBlocked(d, existingId)) return false;
            }
            return true;
          });

          if (candidates.length === 0) break;
          candidates.forEach((c) => {
            if (!hallBatch.has(c)) hallBatch.set(c, []);
          });
        }
        const dId = candidates[seatsFilled % candidates.length];
        hallBatch.get(dId).push(deptQueues[dId][deptPtrs[dId]++]); // AL-06: O(1) read
        seatsFilled++;
      }

      // ─────────────────────────────────────────────────────────────────────
      // PLACEMENT HELPERS
      //   tryPlace         – tests all 4 adjacency constraints before placing
      //   getStudentFromDept – prefers hallBatch; falls back to global queue
      //                        (exceptional fill so no seat is left empty when
      //                         students are globally available)
      // ─────────────────────────────────────────────────────────────────────

      // Rebuild batchDeptIds after pre-fill (includes any globally pulled depts)
      const batchDeptIds = Array.from(hallBatch.keys()).filter(d => hallBatch.get(d).length > 0);
      const singleDept   = batchDeptIds.length === 1;

      const grid = Array(hall.rows + 1).fill(null)
        .map(() => Array(hall.columns * hall.seatsPerBench + 1).fill(null));

      // AL-05: Parallel subject-code grid for Rule 7 (subject separation)
      // Tracks the subjectCode placed at each [row][col] position.
      // Null means empty or no subject data available.
      const subjectGrid = Array(hall.rows + 1).fill(null)
        .map(() => Array(hall.columns * hall.seatsPerBench + 1).fill(null));

      const tryPlaceHere = (dId, gridX, gridY, benchPos1Dept, seat, candidateSubjectCode) => {
        // Rule 1 – bench-mate: seat-2 dept ≠ seat-1 dept on the same bench
        if (seat > 1 && benchPos1Dept === dId) return false;
        // Rule 2 – left neighbor
        if (gridX > 1 && grid[gridY][gridX - 1] === dId) return false;
        // Rule 3 – top neighbor (vertical adjacency)
        if (gridY > 1 && grid[gridY - 1][gridX] === dId) return false;
        // Rule 4 – bottom neighbor (look-ahead; prevents blocking next row)
        if (gridY < hall.rows && grid[gridY + 1] && grid[gridY + 1][gridX] === dId) return false;
        // Rule 5 – right neighbor (already checked by the NEXT seat's rule-2, but guard here)
        if (gridX < hall.columns * hall.seatsPerBench && grid[gridY][gridX + 1] === dId) return false;
        // Rule 6 – blocked dept combinations
        if (isPairBlocked) {
          const neighbors = [];
          if (grid[gridY][gridX - 1] && grid[gridY][gridX - 1] !== '__EMPTY__') neighbors.push(grid[gridY][gridX - 1]);
          if (grid[gridY - 1]?.[gridX] && grid[gridY - 1][gridX] !== '__EMPTY__') neighbors.push(grid[gridY - 1][gridX]);
          for (const nDept of neighbors) {
            if (isPairBlocked(dId, nDept)) return false;
          }
        }
        // Rule 7 – AL-05: subject-code separation
        // If candidate has a known subject code, reject placement if any direct
        // neighbor (L/R/U/D) already holds the SAME subject code.
        // Null-safe: skipped when subjectCode is unavailable (legacy sessions).
        if (candidateSubjectCode) {
          const subjectNeighbors = [
            subjectGrid[gridY]?.[gridX - 1],      // left
            subjectGrid[gridY]?.[gridX + 1],      // right
            subjectGrid[gridY - 1]?.[gridX],      // top
            subjectGrid[gridY + 1]?.[gridX],      // bottom
          ];
          for (const ns of subjectNeighbors) {
            if (ns && ns === candidateSubjectCode) return false;
          }
        }
        return true;
      };

      const getStudentFromDeptSC = (dId) => {
        const bQueue = hallBatch.get(dId);
        if (bQueue && bQueue.length > 0) return bQueue.shift(); // hallBatch is small; .shift() here is fine
        // Exceptional fill – pull directly from global queue (AL-06: pointer-based)
        if (deptQueues[dId] && deptPtrs[dId] < deptQueues[dId].length) {
          return deptQueues[dId][deptPtrs[dId]++];
        }
        return null;
      };

      // Fill Regular Seats – row-first (bench as a unit) for proper interleaving
      for (let row = 1; row <= hall.rows; row++) {
        for (let col = 1; col <= hall.columns; col++) {
          let benchPos1Dept = null;

          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            const gridX = (col - 1) * hall.seatsPerBench + seat;
            const gridY = row;

            // Single-dept rule: leave bench position 2+ empty
            if (singleDept && seat > 1) {
              grid[gridY][gridX] = '__EMPTY__';
              continue;
            }

            let placed = false;

            // Candidate list: batch depts first, then any globally available dept
            const globalExtras = shuffledDeptIds.filter(
              d => !batchDeptIds.includes(d) && deptPtrs[d] < deptQueues[d].length // AL-06
            );
            const candidateDepts = [...batchDeptIds, ...globalExtras];

            for (let attempt = 0; attempt < candidateDepts.length; attempt++) {
              const dId = candidateDepts[attempt];

              // AL-05: peek at the front roll to get its subjectCode for Rule 7
              // We peek (not pop) so getStudentFromDeptSC still works normally.
              // AL-06: use pointer to peek at current front of global queue
              const peekRoll = hallBatch.get(dId)?.[0] ?? deptQueues[dId]?.[deptPtrs[dId]] ?? null;
              const candidateSubjectCode = peekRoll ? (subjectMap[peekRoll] || null) : null;

              if (!tryPlaceHere(dId, gridX, gridY, benchPos1Dept, seat, candidateSubjectCode)) continue;

              const roll = getStudentFromDeptSC(dId);
              if (roll === null) continue;

              if (!hallBatch.has(dId)) hallBatch.set(dId, []);
              grid[gridY][gridX] = dId;
              subjectGrid[gridY][gridX] = subjectMap[roll] || null; // AL-05: record subject for future neighbors
              if (seat === 1) benchPos1Dept = dId;

              assignments.push({
                hallId: hall._id,
                row,
                column: col,
                benchPosition: seat,
                studentRollNumber: roll,
                departmentId: dId,
                examDate,
                examSession,
                examTime,
                examSessionId,
                studentName: nameMap[roll] || '',        // AL-01 snapshot
                subjectCode: subjectMap[roll] || null,  // AL-01 snapshot
              });
              placed = true;
              break;
            }

            // If no dept can be placed without violating rules — leave empty
            if (!placed) {
              grid[gridY][gridX] = '__EMPTY__';
              // AL-03: record the deadlocked seat
              generationWarnings.push({
                type: 'SEAT_EMPTY',
                hall: hall.name,
                row,
                col,
                message: `Seat [${row},${col}] in ${hall.name} could not be filled — constraint deadlock`
              });
            }
          }
        }
      }

      // Fill Extra Benches (bench-mate + exceptional fill; no grid adjacency for isolated benches)
      if (hall.extraBenches && hall.extraBenches.length > 0) {
        for (const bench of hall.extraBenches) {
          let extraBenchPos1Dept = null;

          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            // Single-dept rule: leave bench position 2+ empty
            if (singleDept && seat > 1) continue;

            let placed = false;

            const globalExtras = shuffledDeptIds.filter(
              d => !batchDeptIds.includes(d) && deptPtrs[d] < deptQueues[d].length // AL-06
            );
            const candidateDepts = [...batchDeptIds, ...globalExtras];

            for (let attempt = 0; attempt < candidateDepts.length; attempt++) {
              const dId = candidateDepts[attempt];

              // Bench-mate constraint only for extra benches (isolated from main grid)
              if (seat > 1 && extraBenchPos1Dept === dId) continue;

              const roll = getStudentFromDeptSC(dId);
              if (roll === null) continue;

              if (!hallBatch.has(dId)) hallBatch.set(dId, []);
              if (seat === 1) extraBenchPos1Dept = dId;

              assignments.push({
                hallId: hall._id,
                row: bench.row,
                column: bench.column,
                benchPosition: seat,
                studentRollNumber: roll,
                departmentId: dId,
                examDate,
                examSession,
                examTime,
                examSessionId,
                isExtraBench: true,
                studentName: nameMap[roll] || '',        // AL-01 snapshot
                subjectCode: subjectMap[roll] || null,  // AL-01 snapshot
              });
              placed = true;
              break;
            }
            // If no eligible dept — leave empty rather than violate rules
            if (!placed) continue;
          }
        }
      }

      // Students pulled into this hall's batch but left unplaced (adjacency rules
      // left seats empty) go back into their queue at the read pointer, so the next
      // hall picks them up - or they are reported as unallocated below.
      for (const [dId, leftover] of hallBatch) {
        if (leftover.length > 0) deptQueues[dId].splice(deptPtrs[dId], 0, ...leftover);
      }
    }

    // Save Student Assignments
    if (assignments.length > 0) {
      await SeatAssignment.insertMany(assignments);
    }

    // ============================================
    // STEP 2 & 3: FACULTY ALLOCATION LOGIC
    // ============================================

    // 2.1 Other sessions: needed for "No Continuous Participation" (previous session is
    // resolved in 2.3) and because their draft invigilators count as duties too.
    const otherSessions = await ExamSession.find({ _id: { $ne: examSessionId } })
      .select('examDate examSession status facultyAssignments').lean();

    // 2.2 Fetch ALL Eligible Faculty
    // Support for "Demand" (Admin overrides for continuous participation or extra pool)
    const demandFacultyIdsInput = req.body.demandFacultyIds || [];
    const demandFacultyIds = demandFacultyIdsInput.map(id => id.toString());

    // Fetch all active faculty members (role: "faculty") for internal exam allocation
    let facultyQuery = { role: "faculty" };
    if (session.selectedFaculty && session.selectedFaculty.length > 0) {
      // Fetch session-selected faculty, demand faculty, plus any newly created faculty
      facultyQuery = {
        role: "faculty",
        $or: [
          { _id: { $in: [...session.selectedFaculty.map(id => id.toString()), ...demandFacultyIds] } },
          { isSelectedForGeneration: true }
        ]
      };
    }

    const allFaculty = await Faculty.find(facultyQuery).lean();

    // 2.3 Get Existing Duties for Constraint Checking (Optimized: AL-10)
    const examDateStr = session.examDate;
    const sevenDaysAgo = getDateDaysAgo(examDateStr, 7);

    // Query recent duties for "no continuous participation" and "weekly duty limit" checks
    const savedDuties = await FacultyDuty.find({
      examDate: { $gte: sevenDaysAgo, $lte: examDateStr }
    }).select('facultyId examDate examSession').lean();
    // Draft sessions have invigilators but no FacultyDuty records until finalized
    const draftDuties = otherSessions
      .filter(s => !isLocked(s.status))
      .flatMap(s => dutiesFromAssignments(s.examDate, s.examSession, s.facultyAssignments))
      .filter(d => d.examDate >= sevenDaysAgo && d.examDate <= examDateStr);
    const recentDuties = [...savedDuties, ...draftDuties];

    // Previous session: same-day FN for an AN session, otherwise the latest earlier one
    const previousSession = findPreviousSession(examDateStr, session.examSession, [...otherSessions, ...recentDuties]);

    // Build lookup Set for previous session duties
    const prevSessionKey = previousSession ? `${previousSession.examDate}_${previousSession.examSession}` : null;
    const prevSessionFacultySet = new Set(
      prevSessionKey
        ? recentDuties
            .filter(d => `${d.examDate}_${d.examSession}` === prevSessionKey)
            .map(d => d.facultyId.toString())
        : []
    );

    // Hard Constraint lookup: Same Session Duplicate
    const sameSessionKey = `${examDateStr}_${session.examSession}`;
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
    const reservedSet = await reservedFacultyIds(examDateStr, session.examSession);

    // Hard rules for this session. The department limit is no longer a fixed
    // "max 2 per hall": allocateFaculty applies a per-run department quota.
    const isFacultyAvailable = (faculty) => {
      const fId = faculty._id.toString();
      const isDemand = demandFacultyIds.includes(fId);

      // Same Session Duplicate / Reserve: cannot be in two places at once (HARD CONSTRAINT)
      if (sameSessionFacultySet.has(fId) || reservedSet.has(fId)) return false;

      // No Continuous Participation (Unless Demand)
      if (prevSessionFacultySet.has(fId) && !isDemand) return false;

      // Weekly Limit: Max 4 duties (User Rule)
      if (!isDemand && (weeklyDutyCount[fId] || 0) >= 4) return false;

      return true;
    };

    // AL-07 Step 4: clear stale Hall-level data so old UI reads show nothing
    // (non-blocking — backward compat for any pre-AL-07 Hall reads)
    const selectedHallIds = orderedHalls.map(h => h._id);
    await Hall.updateMany(
      { _id: { $in: selectedHallIds } },
      { $set: { facultyAssigned: [] } }
    );

    // Only assign faculty to halls that actually received students
    const hallsWithStudents = new Set(assignments.map(a => a.hallId.toString()));
    const hallsToStaff = orderedHalls
      .filter(h => hallsWithStudents.has(h._id.toString()))
      .map(h => ({ hallId: h._id, hallName: h.name, required: h.facultyRequired || 1 }));

    // 2.4 Allocation: department quota + fairness (fewer total duties first)
    const allocation = allocateFaculty({
      halls: hallsToStaff,
      faculty: allFaculty,
      isEligible: isFacultyAvailable,
      dutyCounts: await totalDutyCounts(),
      demandIds: demandFacultyIds,
    });

    // AL-07: persist all faculty assignments to ExamSession in one atomic write
    // (session-scoped, so concurrent generation runs never overwrite each other)
    await ExamSession.findByIdAndUpdate(examSessionId, {
      $set: { facultyAssignments: allocation.facultyAssignments }
    });

    const allocationResult = {
      shortage: allocation.vacancies.length > 0,
      warnings: allocation.vacancies.map(v => `Hall ${v.hallName}: Could not find enough faculty (Need ${v.required}, got ${v.assigned})`),
      suggestions: [],
      vacancies: allocation.vacancies,
      vacancyMessage: vacancyMessage(allocation.vacancies),
      departmentQuota: allocation.quota,
    };

    // If there is a shortage, provide suggestions
    if (allocationResult.shortage) {
      // Suggest all faculty who are free in this session (ignoring soft limits like continuous/weekly caps)
      const assignedIds = new Set(allocation.facultyAssignments.flatMap(a => a.facultyIds));
      const allFacultyInDb = await Faculty.find({ role: "faculty" }).lean();

      allocationResult.suggestions = allFacultyInDb
        .filter(f => !assignedIds.has(f._id.toString())) // Not already assigned in this generation run
        .filter(f => !sameSessionFacultySet.has(f._id.toString()) && !reservedSet.has(f._id.toString())) // No duplicate duty in this same session
        .map(f => ({ id: f._id, name: f.name, department: f.department }));
    }

    // POPULATE UNALLOCATED STUDENTS
    // AL-06: remaining students are those after the pointer position (not yet consumed)
    const unallocated = [];
    deptIds.forEach((deptId) => {
      const ptr = deptPtrs[deptId] || 0;
      if (ptr < deptQueues[deptId].length) {
        unallocated.push(...deptQueues[deptId].slice(ptr));
      }
    });

    res.json({
      success: true,
      count: assignments.length,
      unallocated: unallocated,
      allocationResult,
      warnings: generationWarnings,           // AL-03: seat deadlock warnings
      warningCount: generationWarnings.length  // AL-03: convenience count
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ message: "Generation failed", error: err.message });
  }
};

/* ===============================
   FINALIZE SEATING PLAN
================================ */
export const finalizeSeatingPlan = async (req, res) => {
  try {
    const { examSessionId } = req.body;

    if (!examSessionId) {
      return res.status(400).json({ error: "Exam Session ID is required" });
    }

    const session = await ExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ error: "Exam session not found" });
    }
    if (isLocked(session.status)) {
      return res.status(400).json({ error: "Exam session is already finalized." });
    }

    // 1. Mark session as FINAL
    session.status = "FINAL";
    session.finalizedAt = new Date();
    await session.save();

    // 2. Create FacultyDuty records from Hall.facultyAssigned
    // We iterate all halls that have assignments for this session.
    // Wait, halls are global... `facultyAssigned` in Hall model is transient (DRAFT).
    // We need to snapshot this into FacultyDuty.

    // Get all halls involved in this session (those with SeatAssignments or just all selected halls?)
    // Better to check all halls that are 'active' or have students.
    let halls;
    if (session.activeHalls && session.activeHalls.length > 0) {
      halls = await Hall.find({ _id: { $in: session.activeHalls } });
    } else {
      halls = await Hall.find({ isSelected: true });
    }

    const seatingPlanData = {
      examDate: session.examDate,
      examSession: session.examSession,
      examTime: session.examTime,
      halls: [],
      isFinalized: true
    };

    // AL-07: build a hallId → facultyIds lookup from session-scoped assignments
    // (replaces direct read of Hall.facultyAssigned which is now deprecated)
    const faMap = new Map(
      (session.facultyAssignments || []).map(fa => [fa.hallId.toString(), fa.facultyIds])
    );

    for (const hall of halls) {
      // 1. Fetch assignments for this hall
      const assignments = await SeatAssignment.find({ hallId: hall._id, examSessionId });

      // 2. Only process if hall is NOT empty (has students)
      if (assignments.length > 0) {

        // Read faculty from ExamSession (AL-07) with fallback to deprecated Hall field
        const assignedFaculty = faMap.get(hall._id.toString()) || hall.facultyAssigned || [];

        // Create/update Duty Records (if any faculty were assigned)
        if (assignedFaculty.length > 0) {
          for (const facultyId of assignedFaculty) {
            await FacultyDuty.updateOne(
              { facultyId, examDate: session.examDate, examSession: session.examSession },
              { $set: { hallId: hall._id, examTime: session.examTime } },
              { upsert: true }
            );

            // Update Faculty stats
            await Faculty.findByIdAndUpdate(facultyId, {
              lastDutyDate: new Date(),
            });
          }
        }

        // Add to SeatingPlan snapshot
        seatingPlanData.halls.push({
          hallId: hall._id,
          assignments: assignments, // Full snapshot
          facultyAssigned: assignedFaculty // AL-07: from session, not Hall
        });
      }
    }

    // Remove any existing snapshot for this session (idempotent finalize)
    await SeatingPlan.deleteOne({
      examDate: session.examDate,
      examSession: session.examSession
    });

    const plan = new SeatingPlan(seatingPlanData);
    await plan.save();

    await onPlanChanged("internal", examSessionId, { reason: "plan finalized" });
    res.json(session);
  } catch (err) {
    console.error("Finalize error:", err);
    res.status(500).json({ error: "Failed to finalize plan" });
  }
};

/* ===============================
   GET ALL FACULTY DUTIES
================================ */
export const getAllDuties = async (req, res) => {
  try {
    const duties = await FacultyDuty.find({}).populate('hallId').populate('facultyId');
    res.json(duties);
  } catch (error) {
    console.error("Error fetching all duties:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   MARK ABSENT (FACULTY/ADMIN)
================================ */
export const markAbsent = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { isAbsent } = req.body; // true or false

    const assignment = await SeatAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    // Safety: only allow marking on finalized sessions that are published and live
    const session = await ExamSession.findById(assignment.examSessionId);
    if (!session || !isLocked(session.status) || !isPlanVisible(session)) {
      return res.status(400).json({
        message: 'Can only mark absences on published final sessions.'
      });
    }

    // Faculty: only the invigilator of this hall, and only inside the upload
    // window when the plan has exam timing (same rules as the absentee upload)
    if (req.user?.role !== 'admin') {
      const plan = normalizePlan("internal", session);
      if (!(await isAssignedInvigilator(plan, assignment.hallId, req.user.id))) {
        return res.status(403).json({ message: 'You can only mark absentees in the hall you are invigilating.' });
      }
      const window = await hallAbsenteeWindow(plan, assignment.hallId, req.user.id);
      if (window && !window.isOpen) {
        return res.status(403).json({ message: 'The absentee upload window is closed.' });
      }
    }

    assignment.isAbsent = isAbsent === true;
    assignment.markedAbsentAt = isAbsent ? new Date() : null;
    assignment.markedAbsentBy = req.user?.username || 'unknown';
    await assignment.save();

    return res.json({
      message: isAbsent ? 'Student marked absent.' : 'Absence cleared.',
      assignmentId,
      isAbsent: assignment.isAbsent
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error marking absent.', error: err.message });
  }
};

