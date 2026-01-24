import mongoose from "mongoose";

const seatAssignmentSchema = new mongoose.Schema(
  {
    hallId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },
    row: Number,
    column: Number,
    benchPosition: Number,
    studentRollNumber: String,
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    isExtraBench: { type: Boolean, default: false }, // 🔥 NEW FLAG

    examDate: String,
    examSession: String,
    examTime: String,
  },
  { timestamps: true }
);

export default mongoose.model("SeatAssignment", seatAssignmentSchema);
