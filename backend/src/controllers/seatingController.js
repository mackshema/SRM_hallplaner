import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import Department from "../models/Department.js";

/* ===============================
   SAVE SEATING PLAN (ADMIN)
================================ */
export const saveSeatingPlan = async (req, res) => {
  try {
    const { hallId, examDate, examSession, examTime, assignments } = req.body;

    // Validate duplicate roll numbers within this hall
    const rollNumbers = assignments
      .map(a => a.studentRollNumber)
      .filter(r => r); // Filter out empty/null

    const uniqueRolls = new Set(rollNumbers);
    if (rollNumbers.length !== uniqueRolls.size) {
      const duplicates = rollNumbers.filter((r, i) => rollNumbers.indexOf(r) !== i);
      return res.status(400).json({
        error: "Duplicate roll numbers detected",
        duplicates: [...new Set(duplicates)]
      });
    }

    await SeatAssignment.deleteMany({ hallId });

    const docs = assignments.map((a) => ({
      ...a,
      hallId,
      examDate,
      examSession,
      examTime,
    }));

    await SeatAssignment.insertMany(docs);

    await Hall.findByIdAndUpdate(hallId, {
      examDate,
      examSession,
      examTime,
    });

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

    const assignments = await SeatAssignment.find({ hallId });

    // Also get exam metadata from hall
    const hall = await Hall.findById(hallId);
    const examMetadata = hall ? {
      examDate: hall.examDate,
      examSession: hall.examSession,
      examTime: hall.examTime
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
    const assignments = await SeatAssignment.find();
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

    // facultyId can be number (from localStorage) or string (from MongoDB)
    // Convert to string for matching
    const facultyIdStr = String(facultyId);

    const halls = await Hall.find({
      facultyAssigned: { $in: [facultyIdStr, facultyId] }, // Match both string and number
    });

    const summary = halls.map((hall) => ({
      hallId: hall._id,
      hallName: hall.name,
      floor: hall.floor || "",
      examDate: hall.examDate || "",
      examSession: hall.examSession || "",
      examTime: hall.examTime || "",
    }));

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
      examDate,
      examSession,
      examTime,
      departments: frontendDepartments,
      skipRollNumbers = [],
      manualRollNumbers = []
    } = req.body;

    // Delete all existing assignments
    await SeatAssignment.deleteMany({});

    // Get all halls
    const halls = await Hall.find();

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
            rollNumberEnd: dept.rollNumberEnd
          },
          {
            name: dept.name,
            rollNumberStart: dept.rollNumberStart,
            rollNumberEnd: dept.rollNumberEnd
          },
          { upsert: true, new: true }
        );
        departments.push(existingDept);
      }
    } else {
      // Fallback: try to get from MongoDB if frontend didn't send
      departments = await Department.find();
    }

    if (!departments.length) {
      return res.status(400).json({ message: "No departments found. Please create departments first." });
    }

    // Update Halls with Exam Metadata
    if (examDate || examSession || examTime) {
      await Hall.updateMany({}, {
        examDate,
        examSession,
        examTime
      });
    }

    // STEP 1: BUILD GLOBAL ROLL QUEUES (ONE PER DEPARTMENT)
    // Convert skip/manual arrays to Sets for fast lookup
    const skipSet = new Set(skipRollNumbers.map(r => r.toString().trim()).filter(Boolean));
    const manualSet = new Set(manualRollNumbers.map(r => r.toString().trim()).filter(Boolean));

    const deptQueues = {};
    departments.forEach((dept) => {
      deptQueues[dept._id] = [];

      // Build roll number queue for this department
      for (
        let r = Number(dept.rollNumberStart);
        r <= Number(dept.rollNumberEnd);
        r++
      ) {
        const rollStr = r.toString();
        // Skip if in skip list OR in manual list (to avoid duplicates)
        if (!skipSet.has(rollStr) && !manualSet.has(rollStr)) {
          deptQueues[dept._id].push(rollStr);
        }
      }
    });

    // Add manual roll numbers to appropriate department queues
    manualSet.forEach((manualRoll) => {
      const rollNum = Number(manualRoll);
      let assigned = false;
      for (const dept of departments) {
        const start = Number(dept.rollNumberStart);
        const end = Number(dept.rollNumberEnd);
        if (rollNum >= start && rollNum <= end) {
          deptQueues[dept._id].unshift(manualRoll); // Priority
          assigned = true;
          break;
        }
      }
    });

    // STEP 2: RANDOMIZE STARTING HALL (ROTATE, NOT SHUFFLE - EXISTING LOGIC)
    const startIndex = Math.floor(Math.random() * halls.length);
    const orderedHalls = [
      ...halls.slice(startIndex),
      ...halls.slice(0, startIndex)
    ];

    // STEP 2.5: SHUFFLE DEPARTMENTS (REQ: "Shuffling departments on every generation")
    const deptIds = Object.keys(deptQueues);
    // Fisher-Yates Shuffle for better randomness than random sort
    const shuffledDeptIds = [...deptIds];
    for (let i = shuffledDeptIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeptIds[i], shuffledDeptIds[j]] = [shuffledDeptIds[j], shuffledDeptIds[i]];
    }

    // STEP 3: HALL-BY-HALL FILLING (DEPARTMENT-CENTRIC BATCHING)
    const assignments = [];

    // Global pointer for department rotation
    // We rotate the "Active Window" of departments for each hall
    let deptPtr = 0;

    // Helper to get next N non-empty departments
    const getNextActiveDepts = (n) => {
      const active = [];
      let checked = 0;
      // We loop at most through "allDepartments * 2" to ensure we find some if flexible
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
      const hallCapacity = hall.rows * hall.columns * hall.seatsPerBench;

      // 1. Select Departments for this Hall (Target: ~3-4)
      const desiredDeptCount = 3;

      // Let's grab active depts starting from current deptPtr
      let activeDepts = getNextActiveDepts(desiredDeptCount);

      if (activeDepts.length === 0) break; // No one left anywhere

      // SHIFT POINTER: Move it forward by 1 to rotate the selection for next hall
      // "Every Generate button click changes the department -> hall starting order" (Done by shuffle)
      // "Roll number 1 doesn't always start from same hall" (Done by rotation)
      // For NEXT HALL, we shift the window.
      deptPtr = (deptPtr + 1) % shuffledDeptIds.length;

      // 2. Prep Batch Allocations
      const hallBatch = new Map();
      activeDepts.forEach(d => hallBatch.set(d, []));

      let seatsFilled = 0;

      // 3. Batch Distribution Phase (Continuous Blocks)
      // "Average distribution per department per hall"
      // "Avg = floor(totalHallCapacity / totalDepartments)" -> Local Context: / activeDepts.length

      const targetPerDept = Math.floor(hallCapacity / activeDepts.length);

      activeDepts.forEach(dId => {
        const queue = deptQueues[dId];
        // Take up to targetPerDept
        const takeCount = Math.min(targetPerDept, queue.length);
        for (let k = 0; k < takeCount; k++) {
          hallBatch.get(dId).push(queue.shift());
          seatsFilled++;
        }
      });

      // 4. Fill Remainder (Backfill if hall not full)
      // If we still have space, round robin through activeDepts (then others) until full

      let safetyCheck = 0;
      while (seatsFilled < hallCapacity && safetyCheck < (hallCapacity * 2)) {
        safetyCheck++;

        // Dynamically find valid departments with students
        // We prefer activeDepts, then ANY valid dept
        let candidates = activeDepts.filter(d => deptQueues[d].length > 0);

        if (candidates.length === 0) {
          // Broaden search to global
          candidates = shuffledDeptIds.filter(d => deptQueues[d].length > 0);
          if (candidates.length === 0) break; // GLOBAL EMPTY

          // If we found new global candidates, add them to our batch map 
          // so they can be interleaved
          candidates.forEach(c => {
            if (!hallBatch.has(c)) hallBatch.set(c, []);
          });
        }

        // Round robin pick one to add ONE student to batch
        // We use 'seatsFilled' as a rough index for rotation
        const dId = candidates[seatsFilled % candidates.length];
        hallBatch.get(dId).push(deptQueues[dId].shift());
        seatsFilled++;
      }

      // 5. Commit to Hall (Interleaved Rendering)
      // Now hallBatch has all students for this hall, grouped by Dept.
      // We must seat them Round-Robin to ensure "Same department students must NOT sit together"

      const batchDeptIds = Array.from(hallBatch.keys());
      let batchPtr = 0;

      for (let row = 1; row <= hall.rows; row++) {
        for (let col = 1; col <= hall.columns; col++) {
          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            // Find next dept in our batch that has a student ready
            let seated = false;
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
                  examTime
                });
                seated = true;
                break;
              }
              attempts++;
            }
          }
        }
      }
    }

    // STEP 4: SAVE RESULTS TO MONGODB
    if (assignments.length > 0) {
      await SeatAssignment.insertMany(assignments);
    }

    // Calculate unallocated roll numbers
    const unallocated = [];
    deptIds.forEach(deptId => {
      if (deptQueues[deptId] && deptQueues[deptId].length > 0) {
        unallocated.push(...deptQueues[deptId]);
      }
    });

    res.json({
      success: true,
      count: assignments.length,
      unallocated: unallocated
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ message: "Generation failed", error: err.message });
  }
};
