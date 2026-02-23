import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // In production, hash this!
    role: {
      type: String,
      enum: ["admin", "faculty"], // Lowercase to match frontend
      default: "faculty"
    },
    department: { type: String }, // Optional for faculty
    // New Generation Fields for Faculty
    isSelectedForGeneration: { type: Boolean, default: false },
    weeklyDutyCount: { type: Number, default: 0 },
    lastDutyDate: { type: Date },

    isSelected: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
