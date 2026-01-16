import Hall from "../models/Hall.js";

export const assignFacultyToHall = async (req, res) => {
  try {
    const { hallId, facultyIds } = req.body;

    const hall = await Hall.findByIdAndUpdate(
      hallId,
      { facultyAssigned: facultyIds },
      { new: true }
    );

    res.json(hall);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
