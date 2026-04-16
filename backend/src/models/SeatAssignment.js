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
    row: Number,
    column: Number,
    benchPosition: Number,
    studentRollNumber: String,
    departmentId: {
      type: String,
    },
    isExtraBench: { type: Boolean, default: false }, // 🔥 NEW FLAG

    examDate: String,
    examSession: String,
    examTime: String,
  },
  { timestamps: true }
);

// Index for student lookup
seatAssignmentSchema.index({ studentRollNumber: 1 });

export default mongoose.model("SeatAssignment", seatAssignmentSchema);
