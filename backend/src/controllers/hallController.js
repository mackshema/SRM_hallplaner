import Hall from "../models/Hall.js";

export const createHall = async (req, res) => {
  try {
    const {
      name,
      rows,
      columns,
      seatsPerBench,
      floor,
      facultyAssigned = [],
      extraBenches = []
    } = req.body;

    // Validate required fields
    if (!name || !rows || !columns || !seatsPerBench || !floor) {
      return res.status(400).json({
        message: "Missing required fields: name, rows, columns, seatsPerBench, floor"
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

    const hall = await Hall.create({
      name,
      rows,
      columns,
      seatsPerBench,
      floor,
      facultyAssigned: normalizedFacultyAssigned,
      extraBenches
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
        message: "Hall with this name already exists"
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
    const halls = await Hall.find();
    res.json(halls);
  } catch (error) {
    console.error("Get halls error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   GET HALL BY ID
================================ */
export const getHallById = async (req, res) => {
  try {
    const { id } = req.params;
    const hall = await Hall.findById(id);

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
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
      extraBenches
    } = req.body;

    const hall = await Hall.findById(id);
    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    hall.name = name || hall.name;
    hall.rows = rows || hall.rows;
    hall.columns = columns || hall.columns;
    hall.seatsPerBench = seatsPerBench || hall.seatsPerBench;
    hall.floor = floor || hall.floor;
    if (facultyAssigned !== undefined) {
      hall.facultyAssigned = Array.isArray(facultyAssigned)
        ? facultyAssigned.map(f => String(f))
        : [];
    }
    if (extraBenches !== undefined) {
      hall.extraBenches = extraBenches;
    }

    const updatedHall = await hall.save();
    res.json(updatedHall);
  } catch (error) {
    console.error("Update hall error:", error);
    res.status(500).json({ error: error.message });
  }
};
