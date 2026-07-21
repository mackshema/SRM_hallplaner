import mongoose from "mongoose";

const hallSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  rows: { type: Number, required: true },
  columns: { type: Number, required: true },
  seatsPerBench: { type: Number, required: true },
  floor: { type: String },

  // New Feature: Dynamic Extra Benches
  extraBenches: [{
    id: { type: String, required: true },
    row: { type: Number, required: true },
    column: { type: Number, required: true },
    offsetX: Number,
    offsetY: Number
  }],

  // DEPRECATED (AL-07): use ExamSession.facultyAssignments instead.
  // Hall is a global physical room — storing assignments here caused cross-session
  // overwrites when two sessions were generated concurrently.
  // Kept for backward compatibility with pre-AL-07 finalized sessions.
  facultyAssigned: [String], // Store faculty IDs as strings (from localStorage)

  examDate: String,
  examSession: String,
  examTime: String,

  facultyRequired: { type: Number, default: 1 }, // New Field
  isSelected: { type: Boolean, default: true },
});

export default mongoose.model("Hall", hallSchema);
