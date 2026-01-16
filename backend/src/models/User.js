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
    department: { type: String } // Optional for faculty
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
