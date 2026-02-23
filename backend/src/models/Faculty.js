import mongoose from "mongoose";

const FacultySchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed
  role: { type: String, default: "FACULTY" },

  assignedHalls: [
    {
      hallId: Number,
      hallName: String,
      floor: String
    }
  ],
  department: { type: String }, // Ensure department is here
  email: { type: String },

  // New Generation Fields
  isSelectedForGeneration: { type: Boolean, default: false },
  weeklyDutyCount: { type: Number, default: 0 },
  lastDutyDate: { type: Date },

  active: { type: Boolean, default: true }
});

export default mongoose.model("Faculty", FacultySchema);
