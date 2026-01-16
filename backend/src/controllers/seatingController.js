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
   HALL-BY-HALL ALLOCATION WITH RANDOM START
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
        // Skip if in skip list
        if (!skipSet.has(rollStr)) {
          deptQueues[dept._id].push(rollStr);
        }
      }
    });

    // Add manual roll numbers to appropriate department queues
    // Find department by checking if roll number falls in any range
    manualSet.forEach((manualRoll) => {
      const rollNum = Number(manualRoll);
      for (const dept of departments) {
        const start = Number(dept.rollNumberStart);
        const end = Number(dept.rollNumberEnd);
        if (rollNum >= start && rollNum <= end) {
          // Add to front of queue for priority
          deptQueues[dept._id].unshift(manualRoll);
          break;
        }
      }
    });

    // STEP 2: RANDOMIZE STARTING HALL (ROTATE, NOT SHUFFLE)
    const startIndex = Math.floor(Math.random() * halls.length);
    const orderedHalls = [
      ...halls.slice(startIndex),
      ...halls.slice(0, startIndex)
    ];

    // STEP 2.5: RANDOMIZE STARTING DEPARTMENT (ROTATE, NOT SHUFFLE)
    const deptIds = Object.keys(deptQueues);
    const deptStartIndex = Math.floor(Math.random() * deptIds.length);
    const orderedDeptIds = [
      ...deptIds.slice(deptStartIndex),
      ...deptIds.slice(0, deptStartIndex)
    ];

    // STEP 3: HALL-BY-HALL FULL FILLING
    const assignments = [];
    
    for (let hallIndex = 0; hallIndex < orderedHalls.length; hallIndex++) {
      const hall = orderedHalls[hallIndex];
      
      // Each hall starts with a different department (rotate based on hall index)
      let currentDeptIndex = hallIndex % orderedDeptIds.length;
      
      // Fill this hall completely before moving to next
      for (let row = 1; row <= hall.rows; row++) {
        for (let col = 1; col <= hall.columns; col++) {
          for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
            // Round-robin through departments starting from hall's assigned start
            let allocated = false;
            let attempts = 0;

            while (attempts < orderedDeptIds.length && !allocated) {
              const deptId = orderedDeptIds[currentDeptIndex];
              currentDeptIndex = (currentDeptIndex + 1) % orderedDeptIds.length;

              if (deptQueues[deptId] && deptQueues[deptId].length > 0) {
                const rollNumber = deptQueues[deptId].shift();
                assignments.push({
                  hallId: hall._id,
                  row,
                  column: col,
                  benchPosition: seat,
                  studentRollNumber: rollNumber,
                  departmentId: deptId,
                  examDate,
                  examSession,
                  examTime
                });
                allocated = true;
              }
              attempts++;
            }

            // If no departments have rolls left, stop globally
            const hasAnyRolls = orderedDeptIds.some(id => deptQueues[id] && deptQueues[id].length > 0);
            if (!hasAnyRolls) {
              // Break out of all loops
              row = hall.rows + 1;
              col = hall.columns + 1;
              seat = hall.seatsPerBench + 1;
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
