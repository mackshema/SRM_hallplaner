import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import ExamSession from "../models/ExamSession.js";
import User from "../models/User.js";
const Faculty = User; // Alias for readability in this file
// import Faculty from "../models/Faculty.js"; // REPLACED
import FacultyDuty from "../models/FacultyDuty.js";
import SeatingPlan from "../models/SeatingPlan.js";
import InternalExamData from "../models/InternalExamData.js"; // AL-01

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

    if (session.status === "FINAL") {
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

    // If FINAL, source of truth is FacultyDuty
    if (session.status === 'FINAL') {
      const duties = await FacultyDuty.find({
        hallId,
        examDate: session.examDate,
        examSession: session.examSession
      });
      facultyAssigned = duties.map(d => d.facultyId);
    } else {
      // If DRAFT, source is Hall.facultyAssigned (Transient)
      // Note: This shared field means multiple drafts conflict. 
      // Ideally, we'd store draft assignments per session, but for now we follow the single-draft-context assumption.
      const hall = await Hall.findById(hallId);
      facultyAssigned = hall ? hall.facultyAssigned : [];
    }

    const examMetadata = {
      examDate: session.examDate,
      examSession: session.examSession,
      examTime: session.examTime
    };

    res.json({
      assignments,
      facultyAssigned,
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

    // 1. Get finalized duties
    const duties = await FacultyDuty.find({ facultyId }).populate('hallId');

    // 2. Sort duties by date (do not filter out past dates as faculty should see their history or test data)
    const upcomingDuties = duties.sort((a, b) => new Date(b.examDate) - new Date(a.examDate));

    // Transform to summary format
    const summary = upcomingDuties.map(duty => ({
      hallId: duty.hallId._id,
      hallName: duty.hallId.name,
      floor: duty.hallId.floor || "",
      examDate: duty.examDate,
      examSession: duty.examSession,
      examTime: duty.examTime,
      // examSessionId is not directly on duty but implied by date/session
    }));

    res.json(summary);
  } catch (error) {
    console.error("Faculty summary error:", error);
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
    if (session.status === "FINAL") {
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

    // AL-01: Build subject snapshot map (rollNumber → subjectCode) from InternalExamData
    const internalData = await InternalExamData.find({}).lean();
    const subjectMap = {};
    internalData.forEach(d => {
      if (d.rollNumber) subjectMap[d.rollNumber] = d.subjectCode || null;
    });

    const generationWarnings = []; // AL-03: silent warning collector
    const deptMap = {};
    allStudents.forEach(s => {
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
    }

    // Save Student Assignments
    if (assignments.length > 0) {
      await SeatAssignment.insertMany(assignments);
    }

    // ============================================
    // STEP 2 & 3: FACULTY ALLOCATION LOGIC
    // ============================================

    // 2.1 Fetch Previous Session to enforce "No Continuous Participation"
    let previousSession = null;
    if (session.examSession === "AN") {
      previousSession = { examDate: session.examDate, examSession: "FN" };
    } else {
      const prevSessionDoc = await ExamSession.findOne({ examDate: { $lt: session.examDate } }).sort({ examDate: -1, examSession: -1 });
      if (prevSessionDoc) {
        previousSession = { examDate: prevSessionDoc.examDate, examSession: prevSessionDoc.examSession };
      }
    }

    // 2.2 Fetch ALL Eligible Faculty
    // Support for "Demand" (Admin overrides for continuous participation or extra pool)
    const demandFacultyIdsInput = req.body.demandFacultyIds || [];
    const demandFacultyIds = demandFacultyIdsInput.map(id => id.toString());

    // Fetch faculty members based on session-specific selection or legacy global flag
    let facultyQuery = { role: "faculty" };
    if (session.selectedFaculty && session.selectedFaculty.length > 0) {
      // Use specific selection for this session + any extra "demand" overrides
      const combinedIds = [...new Set([
        ...session.selectedFaculty.map(id => id.toString()),
        ...demandFacultyIds
      ])];
      facultyQuery._id = { $in: combinedIds };
    } else {
      // Fallback to legacy global selection OR current demand
      facultyQuery.$or = [
        { isSelectedForGeneration: true },
        { _id: { $in: demandFacultyIds } }
      ];
    }

    const allFaculty = await Faculty.find(facultyQuery).lean();

    // 2.3 Get Existing Duties for Constraint Checking (Optimized: AL-10)
    const examDateStr = session.examDate;
    const sevenDaysAgo = getDateDaysAgo(examDateStr, 7);

    // Query recent duties for "no continuous participation" and "weekly duty limit" checks
    const recentDuties = await FacultyDuty.find({
      examDate: { $gte: sevenDaysAgo, $lte: examDateStr }
    }).select('facultyId examDate examSession').lean();

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

    // Helper to check constraints
    const isFacultyAvailable = (faculty, hall, currentAssignments, examDate) => {
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

      // 3. Same Session Duplicate: Cannot be in two places at once (HARD CONSTRAINT)
      if (sameSessionFacultySet.has(fId)) return false;

      // 4. No Continuous Participation (Unless Demand)
      if (prevSessionFacultySet.has(fId) && !isDemand) {
        return false;
      }

      // 5. Weekly Limit: Max 4 duties (User Rule)
      if (!isDemand) {
        const count = weeklyDutyCount[fId] || 0;
        if (count >= 4) return false;
      }

      return true;
    };

    // 2.4 Allocation Loop
    const allocationResult = {
      shortage: false,
      warnings: [],
      suggestions: []
    };

    const globalAssignedIds = new Set();

    // Shuffle faculty for randomization
    let shuffledFaculty = [...allFaculty];
    for (let i = shuffledFaculty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledFaculty[i], shuffledFaculty[j]] = [shuffledFaculty[j], shuffledFaculty[i]];
    }

    // AL-07: collector for session-scoped faculty assignments
    // Written to ExamSession in one shot after the loop — prevents
    // concurrent sessions overwriting each other via Hall.facultyAssigned.
    const sessionFacultyAssignments = [];

    // AL-07 Step 4: clear stale Hall-level data so old UI reads show nothing
    // (non-blocking — backward compat for any pre-AL-07 Hall reads)
    const selectedHallIds = orderedHalls.map(h => h._id);
    await Hall.updateMany(
      { _id: { $in: selectedHallIds } },
      { $set: { facultyAssigned: [] } }
    );

    // Only assign faculty to halls that actually received students
    const hallsWithStudents = new Set(assignments.map(a => a.hallId.toString()));

    // Iterate Halls — skip empty halls
    for (const hall of orderedHalls) {
      if (!hallsWithStudents.has(hall._id.toString())) {
        continue; // No students → no faculty needed (Hall already cleared above)
      }

      const required = hall.facultyRequired || 1;
      const hallAssignedIds = [];

      for (let i = 0; i < required; i++) {
        let selected = null;

        for (const faculty of shuffledFaculty) {
          const fId = faculty._id.toString();
          if (globalAssignedIds.has(fId)) continue;

          if (isFacultyAvailable(faculty, hall, hallAssignedIds, examDate)) {
            selected = faculty;
            break;
          }
        }

        if (selected) {
          const fId = selected._id.toString();
          hallAssignedIds.push(fId);
          globalAssignedIds.add(fId);
        } else {
          allocationResult.shortage = true;
          allocationResult.warnings.push(`Hall ${hall.name}: Could not find enough faculty (Need ${required}, got ${hallAssignedIds.length})`);
        }
      }

      // AL-07: push to session-scoped collector instead of writing to Hall
      // This prevents concurrent generation runs from overwriting each other.
      sessionFacultyAssignments.push({
        hallId: hall._id,
        facultyIds: hallAssignedIds
      });
    }

    // AL-07: persist all faculty assignments to ExamSession in one atomic write
    await ExamSession.findByIdAndUpdate(examSessionId, {
      $set: { facultyAssignments: sessionFacultyAssignments }
    });

    // If there is a shortage, provide suggestions
    if (allocationResult.shortage) {
      // Suggest all faculty who are free in this session (ignoring soft limits like continuous/weekly caps)
      const allFacultyInDb = await Faculty.find({ role: "faculty" }).lean();

      allocationResult.suggestions = allFacultyInDb
        .filter(f => !globalAssignedIds.has(f._id.toString())) // Not already assigned in this generation run
        .filter(f => !sameSessionFacultySet.has(f._id.toString())) // No duplicate duty in this same session
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
    if (session.status === "FINAL") {
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

    // Safety: only allow marking on FINAL published sessions
    const session = await ExamSession.findById(assignment.examSessionId);
    if (!session || session.status !== 'FINAL' || !session.isPublished) {
      return res.status(400).json({
        message: 'Can only mark absences on published final sessions.'
      });
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

