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

export default mongoose.model("InternalExamData", internalExamDataSchema);
