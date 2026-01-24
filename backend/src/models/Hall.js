import mongoose from "mongoose";

const hallSchema = new mongoose.Schema({
  name: { type: String, required: true },
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

  facultyAssigned: [String], // Store faculty IDs as strings (from localStorage)

  examDate: String,
  examSession: String,
  examTime: String,
});

export default mongoose.model("Hall", hallSchema);
