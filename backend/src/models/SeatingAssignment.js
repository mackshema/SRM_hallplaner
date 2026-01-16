import mongoose from "mongoose";

const seatingAssignmentSchema = new mongoose.Schema(
  {
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    studentRollNumber: { type: String, required: true },

    row: { type: Number, required: true },

    column: { type: Number, required: true },

    benchPosition: { type: Number, required: true },

    examDate: { type: String, required: true },

    examSession: { type: String, enum: ["FN", "AN"], required: true },

    examTime: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("SeatingAssignment", seatingAssignmentSchema);
