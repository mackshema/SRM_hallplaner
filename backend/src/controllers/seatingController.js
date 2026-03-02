import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import Department from "../models/Department.js";
import ExamSession from "../models/ExamSession.js";
import User from "../models/User.js";
const Faculty = User; // Alias for readability in this file
// import Faculty from "../models/Faculty.js"; // REPLACED
import FacultyDuty from "../models/FacultyDuty.js";
import SeatingPlan from "../models/SeatingPlan.js";

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

    // Sync departments from frontend to MongoDB
    let departments = [];
    if (frontendDepartments && Array.isArray(frontendDepartments) && frontendDepartments.length > 0) {
      for (const dept of frontendDepartments) {
        const existingDept = await Department.findOneAndUpdate(
          {
            name: dept.name,
            rollNumberStart: dept.rollNumberStart,
            rollNumberEnd: dept.rollNumberEnd,
          },
          {
            name: dept.name,
            rollNumberStart: dept.rollNumberStart,
            rollNumberEnd: dept.rollNumberEnd,
          },
          { upsert: true, new: true }
        );
        departments.push(existingDept);
      }
    } else {
      departments = await Department.find({ isSelected: true });
    }

    if (!departments.length) {
      return res.status(400).json({ message: "No departments found. Please create departments first." });
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
      for (
        let r = Number(dept.rollNumberStart);
        r <= Number(dept.rollNumberEnd);
        r++
      ) {
        const rollStr = r.toString();
        if (!skipSet.has(rollStr) && !manualSet.has(rollStr)) {
          deptQueues[dept._id].push(rollStr);
        }
      }
    });

    // Add manual roll numbers (Priority)
    manualSet.forEach((manualRoll) => {
      const rollNum = Number(manualRoll);
      for (const dept of departments) {
        const start = Number(dept.rollNumberStart);
        const end = Number(dept.rollNumberEnd);
        if (rollNum >= start && rollNum <= end) {
          deptQueues[dept._id].unshift(manualRoll);
          break;
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

      // Fill remaining capacity if any queue has students
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

      const batchDeptIds = Array.from(hallBatch.keys());
      let batchPtr = 0;

      // Fill Regular Seats
      for (let row = 1; row <= hall.rows; row++) {
        for (let col = 1; col <= hall.columns; col++) {
          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            let attempts = 0;
            while (attempts < batchDeptIds.length) {
              const dId = batchDeptIds[batchPtr];
              batchPtr = (batchPtr + 1) % batchDeptIds.length;

              const pQueue = hallBatch.get(dId);
              if (pQueue && pQueue.length > 0) {
                const roll = pQueue.shift();
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
                });
                break;
              }
              attempts++;
            }
          }
        }
      }

      // Fill Extra Benches
      if (hall.extraBenches && hall.extraBenches.length > 0) {
        for (const bench of hall.extraBenches) {
          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            let attempts = 0;
            while (attempts < batchDeptIds.length) {
              const dId = batchDeptIds[batchPtr];
              batchPtr = (batchPtr + 1) % batchDeptIds.length;

              const pQueue = hallBatch.get(dId);
              if (pQueue && pQueue.length > 0) {
                const roll = pQueue.shift();
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
                });
                break;
              }
              attempts++;
            }
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
      previousSession = await ExamSession.findOne({ examDate: session.examDate, examSession: "FN" });
    } else {
      previousSession = await ExamSession.findOne({ examDate: { $lt: session.examDate } }).sort({ examDate: -1, examSession: -1 });
    }

    let previouslyAssignedFacultyIds = [];
    if (previousSession) {
      const prevDuties = await FacultyDuty.find({
        examDate: previousSession.examDate,
        examSession: previousSession.examSession
      });
      previouslyAssignedFacultyIds = prevDuties.map(d => d.facultyId.toString());
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

    // 2.3 Get Existing Duties for Constraint Checking
    const allDuties = await FacultyDuty.find({});

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

      const fDuties = allDuties.filter(d => d.facultyId.toString() === fId);

      // 3. Same Session Duplicate: Cannot be in two places at once (HARD CONSTRAINT)
      if (fDuties.some(d => d.examDate === examDate && d.examSession === examSession)) return false;

      // 4. No Continuous Participation (Unless Demand)
      if (previouslyAssignedFacultyIds.includes(fId) && !isDemand) {
        return false;
      }

      // 5. Weekly Limit: Max 4 duties (User Rule)
      if (!isDemand) {
        const targetDate = new Date(examDate);
        const dutiesLastWeek = fDuties.filter(d => {
          const dDate = new Date(d.examDate);
          const diffTime = Math.abs(targetDate - dDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        }).length;
        if (dutiesLastWeek >= 4) return false;
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

    // Iterate Halls
    for (const hall of orderedHalls) {
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

      // Save to Hall (Draft)
      await Hall.findByIdAndUpdate(hall._id, {
        facultyAssigned: hallAssignedIds
      });
    }

    // If there is a shortage, provide suggestions
    if (allocationResult.shortage) {
      // Find faculty who were NOT assigned but ARE free and MEET all rules
      const allFacultyInDb = await Faculty.find({ role: "faculty" }).lean();

      allocationResult.suggestions = allFacultyInDb
        .filter(f => !globalAssignedIds.has(f._id.toString())) // Must be free
        .filter(f => {
          // Check if they distrub any rules (Continuous, Weekly, Hard Duplicates)
          // We pass an empty hallAssignedIds because we just want to know if they are generally eligible
          return isFacultyAvailable(f, {}, [], examDate);
        })
        .map(f => ({ id: f._id, name: f.name, department: f.department }));
    }

    // POPULATE UNALLOCATED STUDENTS
    const unallocated = [];
    deptIds.forEach((deptId) => {
      if (deptQueues[deptId] && deptQueues[deptId].length > 0) {
        unallocated.push(...deptQueues[deptId]);
      }
    });

    res.json({
      success: true,
      count: assignments.length,
      unallocated: unallocated,
      allocationResult
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

    const newDuties = [];

    for (const hall of halls) {
      // Check if this hall was used (has assignments or faculty assigned)
      if (hall.facultyAssigned && hall.facultyAssigned.length > 0) {

        // Create Duty Records
        for (const facultyId of hall.facultyAssigned) {
          newDuties.push({
            facultyId,
            hallId: hall._id,
            examDate: session.examDate,
            examSession: session.examSession,
            examTime: session.examTime
          });

          // Update Faculty stats
          await Faculty.findByIdAndUpdate(facultyId, {
            lastDutyDate: new Date(),
            // Increment weekly count? Need accurate week logic
          });
        }

        // Add to SeatingPlan snapshot
        // Fetch assignments for this hall
        const assignments = await SeatAssignment.find({ hallId: hall._id, examSessionId });

        seatingPlanData.halls.push({
          hallId: hall._id,
          assignments: assignments, // Full snapshot
          facultyAssigned: hall.facultyAssigned
        });

        // Clear transient draft from Hall (Optional, but good cleanup)
        // hall.facultyAssigned = [];
        // await hall.save(); 
        // Actually, let's keep it in Hall for now so Admin Review panel still works if they revisit? 
        // Or strictly 'Draft' vs 'Final'. 
        // If finalized, we shouldn't change Hall.facultyAssigned essentially locks it.
      }
    }

    if (newDuties.length > 0) {
      await FacultyDuty.insertMany(newDuties);
    }

    const plan = new SeatingPlan(seatingPlanData);
    await plan.save();

    res.json(session);
  } catch (err) {
    console.error("Finalize error:", err);
    res.status(500).json({ error: "Failed to finalize plan" });
  }
};
