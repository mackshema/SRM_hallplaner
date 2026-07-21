import Hall from "../models/Hall.js";
import FacultyDuty from "../models/FacultyDuty.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";

export const createHall = async (req, res) => {
  try {
    const {
      name,
      rows,
      columns,
      seatsPerBench,
      floor,
      facultyAssigned = [],
      extraBenches = [],
      facultyRequired = 1 // Default to 1
    } = req.body;

    // Validate required fields
    if (!name || !rows || !columns || !seatsPerBench || !floor) {
      return res.status(400).json({
        message: "Missing required fields: name, rows, columns, seatsPerBench, floor"
      });
    }

    // Explicit check for duplicate hall name BEFORE saving (FIX 1)
    const hallExists = await Hall.findOne({ name });
    if (hallExists) {
      return res.status(400).json({
        message: "Hall number already exists. Please use a unique hall number."
      });
    }

    // Validate numeric fields
    if (typeof rows !== 'number' || rows < 1 ||
      typeof columns !== 'number' || columns < 1 ||
      typeof seatsPerBench !== 'number' || seatsPerBench < 1) {
      return res.status(400).json({
        message: "rows, columns, and seatsPerBench must be positive numbers"
      });
    }

    // Validate facultyAssigned is an array
    if (!Array.isArray(facultyAssigned)) {
      return res.status(400).json({
        message: "facultyAssigned must be an array"
      });
    }

    // Ensure facultyAssigned is array of strings
    const normalizedFacultyAssigned = Array.isArray(facultyAssigned)
      ? facultyAssigned.map(f => String(f))
      : [];

    // Drawing Hall Logic: if name contains 'DH', force seatsPerBench to 1
    let finalSeatsPerBench = Number(seatsPerBench);
    if (name.toUpperCase().includes("DH")) {
      finalSeatsPerBench = 1;
    }

    const hall = await Hall.create({
      name,
      rows,
      columns,
      seatsPerBench: finalSeatsPerBench,
      floor,
      facultyAssigned: normalizedFacultyAssigned,
      extraBenches,
      facultyRequired: Number(facultyRequired) || 1
    });

    res.status(201).json(hall);
  } catch (error) {
    console.error("Create Hall Error:", error);

    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        message: `Hall named "${name}" already exists.`
      });
    }

    // Handle CastError (invalid ObjectId, etc.)
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid data format",
        error: error.message
      });
    }

    // Generic error handler - ensure we always return a response
    res.status(500).json({
      message: "Failed to create hall",
      error: error.message || "Unknown error occurred"
    });
  }
};


/* ===============================
   GET ALL HALLS
================================ */
export const getAllHalls = async (req, res) => {
  try {
    const { examSessionId } = req.query;
    let halls = await Hall.find().lean(); // Use lean for easier modification

    if (examSessionId) {
      const session = await ExamSession.findById(examSessionId);
      if (session) {
        if (session.status === 'FINAL') {
          // Fetch duties for this FINAL session
          const duties = await FacultyDuty.find({
            examDate: session.examDate,
            examSession: session.examSession
          });

          // Map duties to halls
          // Create a map: hallId -> [facultyIds]
          const dutyMap = {};
          duties.forEach(d => {
            const hId = d.hallId.toString();
            if (!dutyMap[hId]) dutyMap[hId] = [];
            dutyMap[hId].push(d.facultyId);
          });

          // Override hall.facultyAssigned
          halls = halls.map(h => ({
            ...h,
            facultyAssigned: dutyMap[h._id.toString()] || []
          }));
        } else {
          // If DRAFT, source is ExamSession.facultyAssignments (AL-07) with fallback to global Hall.facultyAssigned
          const faMap = {};
          if (session.facultyAssignments && session.facultyAssignments.length > 0) {
            session.facultyAssignments.forEach(fa => {
              faMap[fa.hallId.toString()] = fa.facultyIds;
            });
          }
          halls = halls.map(h => ({
            ...h,
            facultyAssigned: faMap[h._id.toString()] || h.facultyAssigned || []
          }));
        }
      } else {
        // Check if it's an Anna University plan
        const annaPlan = await AnnaSeating.findById(examSessionId);
        if (annaPlan) {
          if (annaPlan.status === 'FINAL') {
            const duties = await FacultyDuty.find({
              examDate: annaPlan.examDate,
              examSession: annaPlan.session
            });
            const dutyMap = {};
            duties.forEach(d => {
              const hId = d.hallId.toString();
              if (!dutyMap[hId]) dutyMap[hId] = [];
              dutyMap[hId].push(d.facultyId);
            });
            halls = halls.map(h => ({
              ...h,
              facultyAssigned: dutyMap[h._id.toString()] || []
            }));
          } else {
            const faMap = {};
            if (annaPlan.facultyAssignments && annaPlan.facultyAssignments.length > 0) {
              annaPlan.facultyAssignments.forEach(fa => {
                faMap[fa.hallId.toString()] = fa.facultyIds;
              });
            }
            halls = halls.map(h => ({
              ...h,
              facultyAssigned: faMap[h._id.toString()] || h.facultyAssigned || []
            }));
          }
        }
      }
    }

    res.json(halls);
  } catch (error) {
    console.error("Get halls error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   GET HALL BY ID
================================ */
/* ===============================
   GET HALL BY ID
================================ */
export const getHallById = async (req, res) => {
  try {
    const { id } = req.params;
    const { examSessionId } = req.query;

    let hall = await Hall.findById(id).lean();

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    if (examSessionId) {
      const session = await ExamSession.findById(examSessionId);
      if (session) {
        if (session.status === 'FINAL') {
          // Fetch duties for this FINAL session
          const duties = await FacultyDuty.find({
            examDate: session.examDate,
            examSession: session.examSession,
            hallId: hall._id
          });

          // Override facultyAssigned
          hall = {
            ...hall,
            facultyAssigned: duties.map(d => d.facultyId.toString())
          };
        } else {
          // If DRAFT, source is ExamSession.facultyAssignments (AL-07) with fallback to global Hall.facultyAssigned
          const assignment = (session.facultyAssignments || []).find(fa => fa.hallId.toString() === hall._id.toString());
          if (assignment) {
            hall = {
              ...hall,
              facultyAssigned: assignment.facultyIds
            };
          }
        }
      } else {
        // Check if it's an Anna University plan
        const annaPlan = await AnnaSeating.findById(examSessionId);
        if (annaPlan) {
          if (annaPlan.status === 'FINAL') {
            const duties = await FacultyDuty.find({
              examDate: annaPlan.examDate,
              examSession: annaPlan.session,
              hallId: hall._id
            });
            hall = {
              ...hall,
              facultyAssigned: duties.map(d => d.facultyId.toString())
            };
          } else {
            const assignment = (annaPlan.facultyAssignments || []).find(fa => fa.hallId.toString() === hall._id.toString());
            if (assignment) {
              hall = {
                ...hall,
                facultyAssigned: assignment.facultyIds
              };
            }
          }
        }
      }
    }

    res.json(hall);
  } catch (error) {
    console.error("Get hall error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   DELETE HALL
================================ */
export const deleteHall = async (req, res) => {
  try {
    const { id } = req.params;
    await Hall.findByIdAndDelete(id);
    res.json({ message: "Hall deleted successfully" });
  } catch (error) {
    console.error("Delete hall error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   ASSIGN FACULTY TO HALL (ADMIN)
================================ */
export const assignFacultyToHall = async (req, res) => {
  try {
    const { hallId, facultyIds } = req.body;

    if (!hallId || !facultyIds) {
      return res.status(400).json({ message: "Missing data" });
    }

    const hall = await Hall.findByIdAndUpdate(
      hallId,
      { facultyAssigned: facultyIds },
      { new: true }
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json(hall);
  } catch (error) {
    console.error("Assign faculty error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   UPDATE HALL
================================ */
export const updateHall = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      rows,
      columns,
      seatsPerBench,
      floor,
      facultyAssigned,
      extraBenches,
      facultyRequired
    } = req.body;

    const hall = await Hall.findById(id);
    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    hall.name = name || hall.name;
    hall.rows = rows || hall.rows;
    hall.columns = columns || hall.columns;
    if (seatsPerBench !== undefined) {
      let finalSeatsPerBench = Number(seatsPerBench);
      if (hall.name.toUpperCase().includes("DH")) {
        finalSeatsPerBench = 1;
      }
      hall.seatsPerBench = finalSeatsPerBench;
    }
    hall.floor = floor || hall.floor;

    if (facultyRequired !== undefined) {
      hall.facultyRequired = Number(facultyRequired);
    }

    if (facultyAssigned !== undefined) {
      hall.facultyAssigned = Array.isArray(facultyAssigned)
        ? facultyAssigned.map(f => String(f))
        : [];
    }
    if (extraBenches !== undefined) {
      hall.extraBenches = extraBenches;
    }
    if (req.body.isSelected !== undefined) {
      hall.isSelected = req.body.isSelected;
    }

    const updatedHall = await hall.save();
    res.json(updatedHall);
  } catch (error) {
    console.error("Update hall error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   GET ALL COMBINED EXAM DATES
   Returns both Internal (ExamSession) and Anna University (AnnaSeating) dates
================================ */
export const getAllExamDates = async (req, res) => {
  try {
    // Fetch internal exam sessions
    const internalSessions = await ExamSession.find({}).sort({ examDate: 1, examSession: 1 }).lean();

    // Fetch Anna University seating plans
    const annaSessions = await AnnaSeating.find({}).sort({ examDate: 1, session: 1 }).lean();

    // Normalise internal sessions
    const internalFormatted = internalSessions.map(s => ({
      _id: s._id.toString(),
      examDate: s.examDate,
      examSession: s.examSession,
      examTime: s.examTime || (s.examSession === 'FN' ? '09:30 AM' : '01:30 PM'),
      status: s.status || 'DRAFT',
      type: 'internal',
      activeHalls: s.activeHalls || []
    }));

    // Normalise Anna University sessions
    const annaFormatted = annaSessions.map(s => ({
      _id: s._id.toString(),
      examDate: s.examDate,
      examSession: s.session,
      examTime: s.session === 'FN' ? '09:30 AM' : '01:30 PM',
      status: s.status || 'DRAFT',
      type: 'anna',
      activeHalls: [] // Anna seating doesn't use session-level activeHalls
    }));

    // Merge and sort
    const combined = [...internalFormatted, ...annaFormatted].sort((a, b) => {
      const dateCompare = new Date(a.examDate) - new Date(b.examDate);
      if (dateCompare !== 0) return dateCompare;
      // FN before AN for same date
      if (a.examSession !== b.examSession) return a.examSession === 'FN' ? -1 : 1;
      // Internal before Anna for exact same slot
      return a.type === 'internal' ? -1 : 1;
    });

    res.json(combined);
  } catch (error) {
    console.error("getAllExamDates error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   BULK CREATE HALLS
================================ */
export const bulkCreateHalls = async (req, res) => {
  try {
    const { halls } = req.body;

    if (!halls || !Array.isArray(halls)) {
      return res.status(400).json({ message: "Invalid halls data" });
    }

    const results = [];
    const errors = [];

    for (const hallData of halls) {
      try {
        let { name, rows, columns, seatsPerBench, floor, facultyRequired } = hallData;

        if (!name || !rows || !columns || !floor) {
          errors.push({ name: name || "Unknown", message: "Missing required fields" });
          continue;
        }

        // Check duplicate
        const exists = await Hall.findOne({ name });
        if (exists) {
          // If exists, we skip or update? User said "simplify creation", usually skip or error.
          errors.push({ name, message: "Hall already exists" });
          continue;
        }

        let finalSeatsPerBench = Number(seatsPerBench) || 1;
        if (name.toUpperCase().includes("DH")) {
          finalSeatsPerBench = 1;
        }

        const newHall = await Hall.create({
          name,
          rows: Number(rows),
          columns: Number(columns),
          seatsPerBench: finalSeatsPerBench,
          floor,
          facultyRequired: Number(facultyRequired) || 1
        });

        results.push(newHall);
      } catch (err) {
        errors.push({ name: hallData.name || "Unknown", message: err.message });
      }
    }

    res.json({
      success: true,
      created: results.length,
      errors: errors
    });
  } catch (error) {
    console.error("Bulk create halls error:", error);
    res.status(500).json({ error: error.message });
  }
};
