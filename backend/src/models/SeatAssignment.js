import mongoose from "mongoose";

const seatAssignmentSchema = new mongoose.Schema(
  {
    hallId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSession",
      required: true,
    },
    row: { type: Number, required: true },
    column: { type: Number, required: true },
    benchPosition: { type: Number, required: true },
    studentRollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true   // normalize roll numbers to UPPERCASE
    },
    departmentId: {
      type: String,
    },
    isExtraBench: { type: Boolean, default: false }, // 🔥 NEW FLAG

    // AL-01: Snapshot fields — captured at generation time to prevent drift
    studentName: { type: String, default: '' },
    subjectCode: { type: String, default: null },

    examDate: String,
    examSession: String,
    examTime: String,

    isAbsent: { type: Boolean, default: false },
    markedAbsentAt: { type: Date, default: null },
    markedAbsentBy: { type: String, default: null },
  },
  { timestamps: true }
);

// Fast lookup: all seats in a hall for a session
seatAssignmentSchema.index({ examSessionId: 1, hallId: 1 });

// Fast student lookup: find student's seat in a session
seatAssignmentSchema.index({ studentRollNumber: 1, examSessionId: 1 });

// Prevent duplicate: same student in same session twice
seatAssignmentSchema.index(
  { studentRollNumber: 1, examSessionId: 1, hallId: 1, row: 1, column: 1 },
  { unique: true }
);

export default mongoose.model("SeatAssignment", seatAssignmentSchema);
