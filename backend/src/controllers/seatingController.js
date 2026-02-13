import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import Department from "../models/Department.js";
import ExamSession from "../models/ExamSession.js";

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
      // Fallback or empty if no session specified
      return res.json({ assignments: [], examDate: "", examSession: "", examTime: "" });
    }

    const assignments = await SeatAssignment.find({ hallId, examSessionId });
    const session = await ExamSession.findById(examSessionId);

    const examMetadata = session ? {
      examDate: session.examDate,
      examSession: session.examSession,
      examTime: session.examTime
    } : {};

    res.json({
      assignments,
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
   Shows halls assigned to faculty for FINAL exams
================================ */
export const getFacultyHallSummary = async (req, res) => {
  try {
    const { facultyId } = req.params;

    // facultyId can be number (from localStorage) or string (from MongoDB)
    const facultyIdStr = String(facultyId);

    // 1. Find all halls assigned to this faculty
    const myHalls = await Hall.find({
      facultyAssigned: { $in: [facultyIdStr, facultyId] },
    });

    if (myHalls.length === 0) {
      return res.json([]);
    }

    const myHallIds = myHalls.map(h => h._id);

    // 2. Find all FINAL exam sessions
    const finalSessions = await ExamSession.find({ status: "FINAL" }).sort({ examDate: 1 });

    if (finalSessions.length === 0) {
      return res.json([]);
    }

    const summary = [];

    // 3. Build summary: For each session, which halls am I managing?
    // We check if there are seat assignments for this session + my hall
    // OR we just assume if I'm assigned to Hall A, I manage it for all Final Sessions?
    // User Prompt: "Faculty dashboard shows that date’s halls... Query logic: find ExamSession where status = FINAL -> Fetch halls assigned"
    // This implies showing the hall even if empty? Likely yes.

    for (const session of finalSessions) {
      for (const hall of myHalls) {
        // Optional: Check if hall has students allocated for this session?
        // Let's rely on standard practice: If I am assigned to Hall A, I show up for Exam X in Hall A.

        summary.push({
          hallId: hall._id,
          hallName: hall.name,
          floor: hall.floor || "",
          examDate: session.examDate,
          examSession: session.examSession,
          examTime: session.examTime,
          examSessionId: session._id
        });
      }
    }

    res.json(summary);
  } catch (error) {
    console.error("Faculty summary error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   GENERATE SEATING PLAN
   DEPARTMENT-CENTRIC BATCHING + HALL ROTATION
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
    const halls = await Hall.find({ isSelected: true });

    if (!halls.length) {
      return res.status(400).json({ message: "No halls found" });
    }

    // Sync departments from frontend to MongoDB
    let departments = [];
    if (frontendDepartments && Array.isArray(frontendDepartments) && frontendDepartments.length > 0) {
      // Upsert departments from frontend to MongoDB
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
      // Filter out unselected ones provided by frontend if any? 
      // Actually, if frontend provides them, we assume they are the selected ones.
      // But we should double check if the user "unchecked" them on the frontend, the frontend should just NOT send them.
    } else {
      departments = await Department.find({ isSelected: true });
    }

    if (!departments.length) {
      return res.status(400).json({ message: "No departments found. Please create departments first." });
    }

    // STEP 1: BUILD GLOBAL ROLL QUEUES (ONE PER DEPARTMENT)
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

    // Add manual roll numbers
    manualSet.forEach((manualRoll) => {
      const rollNum = Number(manualRoll);
      for (const dept of departments) {
        const start = Number(dept.rollNumberStart);
        const end = Number(dept.rollNumberEnd);
        if (rollNum >= start && rollNum <= end) {
          deptQueues[dept._id].unshift(manualRoll); // Priority
          break;
        }
      }
    });

    // STEP 2: RANDOMIZE STARTING HALL
    const startIndex = Math.floor(Math.random() * halls.length);
    const orderedHalls = [
      ...halls.slice(startIndex),
      ...halls.slice(0, startIndex),
    ];

    // STEP 2.5: SHUFFLE DEPARTMENTS
    const deptIds = Object.keys(deptQueues);
    const shuffledDeptIds = [...deptIds];
    for (let i = shuffledDeptIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeptIds[i], shuffledDeptIds[j]] = [shuffledDeptIds[j], shuffledDeptIds[i]];
    }

    // STEP 3: HALL-BY-HALL FILLING
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
                  examSessionId, // ADDED
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
                  examSessionId, // ADDED
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

    // STEP 4: SAVE RESULTS
    if (assignments.length > 0) {
      await SeatAssignment.insertMany(assignments);
    }

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
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ message: "Generation failed", error: err.message });
  }
};
