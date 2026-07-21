import mongoose from "mongoose";

const internalExamDataSchema = new mongoose.Schema({
  rollNumber: { type: String }, // specific student assigned manually
  subjectCode: { type: String, required: true },
  department: { type: String, required: true, default: "Unknown" },
  year: { type: String, required: false },
  examDate: { type: String, required: true },
  session: { type: String, required: true },
  studentName: { type: String }
}, { timestamps: true });

internalExamDataSchema.index({
  examDate: 1,
  session: 1,
  department: 1
});

// Also add a unique constraint to prevent duplicate timetable entries
internalExamDataSchema.index({
  subjectCode: 1,
  department: 1,
  examDate: 1,
  session: 1
}, { unique: true });

export default mongoose.model("InternalExamData", internalExamDataSchema);
