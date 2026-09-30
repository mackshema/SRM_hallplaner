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

// Lookup index for timetable imports. Deliberately NOT unique: per-student rows
// (manual maps) share subject/department/date/session with each other, and
// duplicate class rows are already prevented by the upserts in
// utils/timetableImport.js. The old unique version is dropped in config/migrations.js.
internalExamDataSchema.index({
  subjectCode: 1,
  department: 1,
  year: 1
});

export default mongoose.model("InternalExamData", internalExamDataSchema);
